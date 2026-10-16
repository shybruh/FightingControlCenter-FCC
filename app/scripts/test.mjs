// FCC's checks: every board's catalog entry is sound, and protocol packets match the documented bytes, with the drivers
// run against simulated keyboards. No hardware involved. Run with `npm test` (Rust checks: `npm run test:rust`).
import path from 'node:path'
import { createServer } from 'vite'

const app = path.resolve(import.meta.dirname, '..')
const vite = await createServer({ root: app, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const R = await vite.ssrLoadModule('/src/hid/razer.ts')
const { DEVICES, activateDevice } = await vite.ssrLoadModule('/src/devices/registry.ts')
const layout = await vite.ssrLoadModule('/src/data/layout.ts')
const codec = await vite.ssrLoadModule('/src/hid/codec.ts')

let pass = 0
let fail = 0
const hex = (a) => Array.from(a, (b) => b.toString(16).padStart(2, '0')).join(' ')
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`)
}
/** header bytes 0..7 + n argument bytes */
const head = (p, n) => Array.from(p.slice(0, 8 + n))
const crcOf = (p) => { let c = 0; for (let i = 2; i < 88; i++) c ^= p[i]; return c }

// ---- every board in every catalog ----
{
  const ids = new Set()
  const problems = []
  const byProtocol = {}
  for (const d of DEVICES) {
    if (ids.has(d.id)) problems.push('duplicate id ' + d.id)
    ids.add(d.id)
    byProtocol[d.protocol] = (byProtocol[d.protocol] ?? 0) + 1
    activateDevice(d)
    const keys = layout.KEYS
    if (d.transport === 'wired' && !keys.length) problems.push(d.id + ': no keys')
    const keyIds = new Set()
    for (const k of keys) {
      if (keyIds.has(k.id)) problems.push(d.id + ': key id ' + k.id + ' used twice')
      keyIds.add(k.id)
      if (k.id < 0 || k.id >= 128) problems.push(d.id + ': key id ' + k.id + ' outside 0..127')
      if (!(k.w > 0)) problems.push(d.id + ': key ' + k.label + ' has no width')
    }
    if (d.protocol === 'razer' && !d.razer) problems.push(d.id + ': razer details missing')
  }
  console.log('boards:', JSON.stringify(byProtocol))
  check('every board: unique id, a layout, key ids unique and within 0..127', problems.slice(0, 10), [])
}

// ---- packet format ----
const st = R.effect.static([0xff, 0x80, 0x00])
check('report is 90 bytes', st.length, 90)
check('static: status, tid 0x1F, size 9, class 0F id 02, args', head(st, 9), [0, 0x1f, 0, 0, 0, 0x09, 0x0f, 0x02, 0x01, 0x05, 0x01, 0, 0, 0x01, 0xff, 0x80, 0x00])
check('crc = xor of bytes 2..87', st[88], crcOf(st))
check('last byte reserved 0', st[89], 0)
check('none', head(R.effect.none(), 3), [0, 0x1f, 0, 0, 0, 0x06, 0x0f, 0x02, 1, 5, 0])
check('spectrum', head(R.effect.spectrum(), 3), [0, 0x1f, 0, 0, 0, 0x06, 0x0f, 0x02, 1, 5, 3])
check('wave right', head(R.effect.wave(2), 5), [0, 0x1f, 0, 0, 0, 0x06, 0x0f, 0x02, 1, 5, 4, 2, 0x28])
check('breathing single', head(R.effect.breathing([1, 2, 3]), 9), [0, 0x1f, 0, 0, 0, 0x09, 0x0f, 0x02, 1, 5, 2, 1, 0, 1, 1, 2, 3])
check('breathing random', head(R.effect.breathingRandom(), 3), [0, 0x1f, 0, 0, 0, 0x06, 0x0f, 0x02, 1, 5, 2])
check('reactive speed clamps to 1..4', R.effect.reactive(9, [0, 0, 0])[12], 4)
check('starlight random', head(R.effect.starlightRandom(2), 5), [0, 0x1f, 0, 0, 0, 0x06, 0x0f, 0x02, 1, 5, 7, 0, 2])
check('custom frame effect', head(R.effect.custom(), 3), [0, 0x1f, 0, 0, 0, 0x0c, 0x0f, 0x02, 0, 0, 8])
const row = R.frameRow(2, 0, 21, new Uint8Array(66).fill(7))
check('frame row: size 0x47, class 0F id 03, row, cols 0..21', head(row, 5), [0, 0x1f, 0, 0, 0, 0x47, 0x0f, 0x03, 0, 0, 2, 0, 21])
check('frame row carries 22 x 3 colour bytes', [row[13], row[13 + 65], row[13 + 66]], [7, 7, 0])
check('brightness', head(R.brightness(255), 3), [0, 0x1f, 0, 0, 0, 0x03, 0x0f, 0x04, 1, 5, 255])
check('polling 8000 Hz', head(R.settings.setPolling(0x01), 2), [0, 0x1f, 0, 0, 0, 0x02, 0x00, 0x40, 0, 0x01])
check('get polling', head(R.settings.getPolling(), 1), [0, 0x1f, 0, 0, 0, 0x01, 0x00, 0xc0, 0])
check('game mode on', head(R.settings.setGameMode(true), 3), [0, 0x1f, 0, 0, 0, 0x03, 0x03, 0x00, 0, 8, 1])
check('keyswitch typing (two packets)', R.settings.setKeyswitch(false).map((p) => head(p, 6)), [
  [0, 0x1f, 0, 0, 0, 0x04, 0x02, 0x02, 0x00, 0x14, 0x00, 0x28, 0x00, 0],
  [0, 0x1f, 0, 0, 0, 0x05, 0x02, 0x15, 0x01, 0x00, 0x14, 0x00, 0x28, 0x00],
])
check('keyswitch gaming (two packets)', R.settings.setKeyswitch(true).map((p) => head(p, 1)), [
  [0, 0x1f, 0, 0, 0, 0x04, 0x02, 0x02, 0],
  [0, 0x1f, 0, 0, 0, 0x05, 0x02, 0x15, 0x01],
])

// ---- replies ----
const ok = st.slice(); ok[0] = 0x02
check('reply ok accepted', R.checkReply(st, ok).length, 80)
const bad = st.slice(); bad[0] = 0x05
let err = ''
try { R.checkReply(st, bad) } catch (e) { err = e.message }
check('"not supported" reply rejected', err.includes('not supported'), true)
const other = ok.slice(); other[7] = 0x04
err = ''
try { R.checkReply(st, other) } catch (e) { err = e.message }
check('reply for another command rejected', err.includes('not 0x0f 0x02'), true)

// ---- driver with the mock board ----
const dev = DEVICES.find((d) => d.id === 'razer-huntsman-v2')
check('Huntsman V2 registered as untested razer board, keymap off', [dev?.protocol, dev?.status, dev?.caps.keymap, dev?.caps.perKeyRgb], ['razer', 'untested', false, true])
activateDevice(dev)
const KEYS = layout.KEYS
check('layout has 108 keys, ids under 128', [KEYS.length, Math.max(...KEYS.map((k) => k.id)) < 128], [108, true])
const esc = KEYS.find((k) => k.label === 'Esc'), w = KEYS.find((k) => k.label === 'W'), np0 = KEYS.find((k) => k.label === '0' && k.x > 18)
check('matrix: Esc (0,0), W (2,2), numpad 0 (5,18)', [dev.razer.matrix[esc.id], dev.razer.matrix[w.id], dev.razer.matrix[np0.id]], [[0, 0], [2, 2], [5, 18]])
const cells = new Set(Object.values(dev.razer.matrix).map(([r, c]) => `${r},${c}`))
check('no two keys share a matrix cell', cells.size, KEYS.length)

const mock = new R.MockRazerTransport(dev)
const kb = new R.RazerKeyboard(mock, dev)
const regions = await kb.readAll()
check('connect reads polling, game mode and keyswitch', mock.sent.map((p) => `${p[6].toString(16)}/${p[7].toString(16)}`), ['0/c0', '3/80', '2/82'])
check('settings decoded from the board', R.decodeRazerSettings(regions.settings), { polling: 0x08, gameMode: false, gaming: false })

mock.sent.length = 0
const led = codec.encodeLed(regions.led, { ...codec.decodeLed(regions.led), effect: R.RAZER_FX.custom, brightness: 3 })
const colors = regions.colors.slice()
colors.set([w.id, 255, 0, 0], w.id * 4)
await kb.writeRegion('colors', colors)
check('colours alone send nothing while per-key is off', mock.sent.length, 0)
await kb.writeRegion('led', led)
check('per-key on: 6 rows, show them, brightness', mock.sent.map((p) => `${p[6].toString(16)}/${p[7].toString(16)}${p[7] === 3 ? ` r${p[10]}` : ''}`), ['f/3 r0', 'f/3 r1', 'f/3 r2', 'f/3 r3', 'f/3 r4', 'f/3 r5', 'f/2', 'f/4'])
const row2 = mock.sent[2]
check('W is red at row 2, column 2', [row2[13 + 6], row2[13 + 7], row2[13 + 8]], [255, 0, 0])
check('brightness level 3 of 5 -> 153', mock.sent.at(-1)[10], 153)

mock.sent.length = 0
await kb.writeRegion('settings', R.encodeRazerSettings(regions.settings, { polling: 0x01, gameMode: false, gaming: false }))
check('changing polling sends only polling', mock.sent.map((p) => `${p[6].toString(16)}/${p[7].toString(16)} ${p[9]}`), ['0/40 1'])
mock.sent.length = 0
await kb.writeRegion('keys', regions.keys)
check('keymap writes send nothing (no Razer command)', mock.sent.length, 0)


// ---- every Razer model ----
const razers = DEVICES.filter((d) => d.protocol === 'razer')
check('19 Razer models, unique ids and USB ids', [razers.length, new Set(razers.map((d) => d.id)).size, new Set(razers.map((d) => d.productId)).size], [19, 19, 19])
const layoutIssues = []
for (const d of razers) {
  activateDevice(d)
  const keys = layout.KEYS
  const cells = new Set()
  for (const k of keys) {
    const at = d.razer.matrix[k.id]
    if (!at) { layoutIssues.push(d.name + ': key without matrix cell ' + k.label); continue }
    const [r, c] = at
    if (r >= d.razer.rows || c >= d.razer.cols) layoutIssues.push(d.name + ': ' + k.label + ' outside the matrix')
    if (cells.has(r + ',' + c)) layoutIssues.push(d.name + ': two keys at ' + r + ',' + c)
    cells.add(r + ',' + c)
    if (k.id >= 128) layoutIssues.push(d.name + ': id ' + k.id + ' too big')
  }
  for (const must of ['Esc', 'Space', 'Enter', 'W', 'A', 'S', 'D']) if (!keys.some((k) => k.label === must)) layoutIssues.push(d.name + ': no ' + must)
}
check('every model: keys inside the matrix, no shared cells, the basics present', layoutIssues, [])

async function run(id, fn) {
  const d = DEVICES.find((x) => x.id === id)
  activateDevice(d)
  const m = new R.MockRazerTransport(d)
  const answered = []
  const req = m.request.bind(m)
  m.request = async (r) => { answered.push(r); return req(r) }
  const k = new R.RazerKeyboard(m, d)
  const regs = await k.readAll()
  await fn(k, regs, d)
  return { all: m.sent, answered }
}
const cmd = (p) => p[6].toString(16) + '/' + p[7].toString(16)

let r = await run('razer-blackwidow-v3', async (k, regs) => {
  await k.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: R.RAZER_FX.custom }))
  await k.writeRegion('settings', R.encodeRazerSettings(regs.settings, { polling: 0x01, gameMode: true, gaming: true }))
})
check('BlackWidow V3 connect: no polling or keyswitch reads (it has neither)', r.all.slice(0, 1).map(cmd), ['3/80'])
check('BlackWidow V3 game mode read: stored variant, tid 0xFF', [r.all[0][8], r.all[0][1]], [1, 0xff])
const frames = r.all.filter((p) => cmd(p) === 'f/3'), custom = r.all.find((p) => cmd(p) === 'f/2'), bri = r.all.find((p) => cmd(p) === 'f/4')
check('BlackWidow V3: frames tid 0x1F, effects and brightness 0x3F', [frames[0][1], custom[1], bri[1]], [0x1f, 0x3f, 0x3f])
check('BlackWidow V3: checksums still valid after re-tagging', [frames[0], custom, bri].every((p) => p[88] === crcOf(p)), true)
check('BlackWidow V3 settings: only game mode sent (no polling, no keyswitch)', r.all.filter((p) => p[6] !== 0x0f).slice(1).map(cmd), ['3/0'])

r = await run('razer-blackwidow-v4', async (k, regs) => {
  await k.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: R.RAZER_FX.custom }))
})
const v4frames = r.all.filter((p) => cmd(p) === 'f/3')
check('BlackWidow V4: 8 frame rows of 23 columns', [v4frames.length, v4frames[0][12]], [8, 22])
check('BlackWidow V4: frames and custom effect sent without waiting for an answer', r.answered.filter((p) => cmd(p) === 'f/3' || (cmd(p) === 'f/2' && p[10] === 8)).length, 0)
check('BlackWidow V4: brightness still waits for its answer', r.answered.some((p) => cmd(p) === 'f/4'), true)
check('BlackWidow V4 reads polling (it has 8 kHz)', r.all.some((p) => cmd(p) === '0/c0'), true)

r = await run('razer-huntsman-mini', async (k, regs) => {
  await k.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: R.RAZER_FX.custom }))
})
check('Huntsman Mini: 5 rows, tid 0x3F on frames', [r.all.filter((p) => cmd(p) === 'f/3').length, r.all.find((p) => cmd(p) === 'f/3')[1]], [5, 0x3f])

// a built-in design on a Razer board: every key's colour in its own matrix cell
const presets = await vite.ssrLoadModule('/src/lighting/presets.ts')
for (const id of ['razer-blackwidow-v3-tkl', 'razer-huntsman-v2']) {
  const wrong = []
  r = await run(id, async (k, regs, d) => {
    const sunset = presets.presetColors(presets.COLOR_PRESETS.find((p) => p.id === 'sunset'))
    await k.writeRegion('colors', codec.withColorMap(regs.colors, sunset))
    await k.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: R.RAZER_FX.custom }))
    const sent = k.frameReports().filter((p) => cmd(p) === 'f/3')
    for (const key of layout.KEYS) {
      const [row, col] = d.razer.matrix[key.id]
      const got = Array.from(sent[row].slice(13 + col * 3, 16 + col * 3))
      if (JSON.stringify(got) !== JSON.stringify(sunset.get(key.id))) wrong.push(key.label)
    }
  })
  check(`${id}: Sunset design lands on every key`, wrong, [])
}

// underglow: lights that aren't keys continue the matrix after the keys, as OpenRGB numbers them
{
  const lit = (id) => {
    const d = DEVICES.find((x) => x.id === id)
    activateDevice(d)
    const lights = layout.KEYS.filter((k) => k.light)
    const cells = lights.flatMap((k) => d.razer.spans[k.id])
    const all = layout.KEYS.flatMap((k) => d.razer.spans[k.id] ?? [d.razer.matrix[k.id]]).map(String)
    return { d, lights, cells, shared: all.length - new Set(all).size, maxId: Math.max(...layout.KEYS.map((k) => k.id)) }
  }
  const v4 = lit('razer-blackwidow-v4')
  check('BlackWidow V4: 6 underglow segments, 18 LEDs in row 6 columns 0-17', [v4.lights.length, v4.cells.length, v4.cells.every(([r]) => r === 6), v4.cells.map(([, c]) => c).join()], [6, 18, true, [...Array(18).keys()].join()])
  const pro = lit('razer-blackwidow-v4-pro')
  check('BlackWidow V4 Pro: wrist rest after 5 unconnected LEDs (row 7, columns 0-19)', pro.cells.slice(18).map(String), [...Array(20).keys()].map((c) => `7,${c}`))
  const elite = lit('razer-huntsman-elite')
  check('Huntsman Elite: 66 underglow LEDs fill rows 6-8', [elite.cells.length, Math.min(...elite.cells.map(([r]) => r)), Math.max(...elite.cells.map(([r]) => r))], [66, 6, 8])
  check('no LED lit by two keys or segments, ids fit the colour region', [v4, pro, elite].map((x) => [x.shared, x.maxId < 126]), [[0, true], [0, true], [0, true]])
  const fr = await run('razer-blackwidow-v4', async (k, regs, d) => {
    const colors = regs.colors.slice()
    const seg = layout.KEYS.find((x) => x.label === 'Underglow right 2')
    colors.set([seg.id, 0, 255, 0], seg.id * 4)
    await k.writeRegion('colors', colors)
    await k.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: R.RAZER_FX.custom }))
  })
  const row6 = fr.all.filter((p) => cmd(p) === 'f/3').find((p) => p[10] === 6)
  check('painting "Underglow right 2" lights its 3 LEDs (row 6, columns 12-14) green', [12, 13, 14].map((c) => Array.from(row6.slice(13 + c * 3, 16 + c * 3))), [[0, 255, 0], [0, 255, 0], [0, 255, 0]])
}

// fixed-speed effects preview at the model's own pace
activateDevice(DEVICES.find((d) => d.id === 'razer-huntsman-v2'))
const huntsmanPace = codec.EFFECTS.find((e) => e.name === 'Spectrum cycle').previewSpeed
activateDevice(DEVICES.find((d) => d.id === 'razer-blackwidow-v3-tkl'))
check('spectrum preview: Huntsman V2 slow (1), BlackWidow V3 TKL faster (3)', [huntsmanPace, codec.EFFECTS.find((e) => e.name === 'Spectrum cycle').previewSpeed], [1, 3])

// ---- SteelSeries: FCC streams the lighting frames ----
{
  const SS = await vite.ssrLoadModule('/src/hid/steelseries.ts')
  const d = DEVICES.find((x) => x.id === 'steelseries-apex-pro-gen3')
  check('Apex Pro Gen 3: 1038:1640, SteelSeries protocol, interface 1, untested, no keymap', [d?.vendorId, d?.productId, d?.protocol, d?.steelseries?.iface, d?.status, d?.caps.keymap], [0x1038, 0x1640, 'steelseries', 1, 'untested', false])
  activateDevice(d)
  const keys = layout.KEYS
  const codes = keys.map(SS.ssLedCode)
  const byLabel = (l) => codes[keys.findIndex((k) => k.label === l)]
  check('Apex Pro Gen 3: 104 keys, each with its own LED code; W is 0x1a, Fn 0xf0, right Win 0xe7', [keys.length, new Set(codes).size, codes.includes(0), byLabel('W'), byLabel('Fn'), codes.filter((c) => c === 0xe7).length], [104, 104, false, 0x1a, 0xf0, 1])

  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const mock = new SS.MockSteelSeriesTransport(d)
  const kb = new SS.SteelSeriesKeyboard(mock, d)
  // custom per-key: W red, everything else from the defaults (white), brightness 3 of 5
  const regs = SS.ssDefaults()
  const w = keys.find((k) => k.label === 'W')
  regs.colors.set([w.id, 255, 0, 0], w.id * 4)
  regs.led = codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: SS.SS_FX.custom, brightness: 3 })
  kb.seed({ led: regs.led, colors: regs.colors })
  await kb.readAll()
  await wait(30)
  const frame = mock.sent[1]
  const entry = (f, code) => { for (let i = 0; i < f[1]; i++) if (f[2 + i * 4] === code) return Array.from(f.slice(3 + i * 4, 6 + i * 4)); return null }
  check('first the Gen 3 start (0x4b), then a 0x40 frame for all 104 keys', [mock.sent[0][0], frame[0], frame[1]], [0x4b, 0x40, 104])
  check('W red and the rest white, at brightness 3/5', [entry(frame, 0x1a), entry(frame, 0x04)], [[153, 0, 0], [153, 153, 153]])

  mock.sent.length = 0
  await kb.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: 0 }))
  await wait(30)
  check('lighting off: an all-black frame', [mock.sent.at(-1)[0], mock.sent.at(-1)[1], mock.sent.at(-1).slice(2).filter((b, i) => i % 4 !== 0).every((b) => b === 0)], [0x40, 104, true])

  mock.sent.length = 0
  const settings = Uint8Array.from(regs.settings)
  settings[SS.SS_SETTING.original] = 1
  await kb.writeRegion('settings', settings)
  await kb.writeRegion('led', codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: SS.SS_FX.spectrum }))
  await wait(260)
  const frames = mock.sent.filter((f) => f[0] === 0x3a)
  check('Original commands: 0x3a frames, no start packet', [frames.length > 0, mock.sent.some((f) => f[0] === 0x4b)], [true, false])
  check('spectrum streams frames (~20 a second) and the colours move', [frames.length >= 4, JSON.stringify(entry(frames[0], 0x04)) !== JSON.stringify(entry(frames.at(-1), 0x04))], [true, true])
  await kb.close()
  const after = mock.sent.length
  await wait(120)
  check('closing stops the frames and never sends 0x41 (it reboots Gen 3 boards)', [mock.sent.length, mock.sent.some((f) => f[0] === 0x41)], [after, false])
}

// ---- Sinowealth 010c (AULA F99): model check first, then streamed frames ----
{
  const SW = await vite.ssrLoadModule('/src/hid/sinowealth.ts')
  const { detect } = await vite.ssrLoadModule('/src/devices/registry.ts')
  const f99 = DEVICES.find((x) => x.id === 'aula-f99')
  check('AULA F99: 258a:010c, Sinowealth protocol, interface 1, model 0xa4, untested', [f99?.vendorId, f99?.productId, f99?.protocol, f99?.sinowealth?.iface, f99?.sinowealth?.model, f99?.status], [0x258a, 0x010c, 'sinowealth', 1, 0xa4, 'untested'])
  activateDevice(f99)
  const keys = layout.KEYS
  const leds = keys.map((k) => f99.sinowealth.leds[k.id])
  const ledOf = (label) => f99.sinowealth.leds[keys.find((k) => k.label === label).id]
  check('F99: 99 keys, every LED index used once and inside the report; Esc 0, W 14, Fn 59, numpad Enter 112', [keys.length, new Set(leds).size, Math.max(...leds) * 3 + 10 < 520, ledOf('Esc'), ledOf('W'), ledOf('Fn'), f99.sinowealth.leds[keys.find((k) => k.hid === 0x58).id]], [99, 99, true, 0, 14, 59, 112])
  check('detection: 258a:010c is the F99, Royal Kludge boards on the same vendor id stay RK', [detect(0x258a, 0x010c, 'Gaming Keyboard').device?.id, detect(0x258a, 0x0147, '').device?.protocol], ['aula-f99', 'rk'])

  // every 010c model: the board's model answer picks it; LEDs unique and inside the report; no keys on top of each other
  const sw = DEVICES.filter((d) => d.protocol === 'sinowealth')
  check('010c models: the model answer picks the board (F99 0xa4, F75 0xcd, F87 Pro 0x0b, Hi75C Pro 0xa3), anything else none',
    [0xa4, 0xcd, 0x0b, 0xa3, 0x05].map((m) => detect(0x258a, 0x010c, 'Gaming Keyboard', undefined, m).device?.id ?? null),
    ['aula-f99', 'aula-f75', 'aula-f87-pro', 'leobog-hi75c-pro', null])
  const layoutProblems = []
  for (const d of sw) {
    activateDevice(d)
    const ks = layout.KEYS
    const ls = ks.map((k) => d.sinowealth.leds[k.id])
    if (new Set(ls).size !== ls.length) layoutProblems.push(`${d.name}: LED used twice`)
    if (Math.max(...ls) * 3 + 10 >= 520) layoutProblems.push(`${d.name}: LED outside the report`)
    for (const a of ks) for (const b of ks) {
      if (a.id >= b.id) continue
      const overlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + (b.h ?? 1) - 0.01 && b.y < a.y + (a.h ?? 1) - 0.01
      if (overlap) layoutProblems.push(`${d.name}: ${a.label} overlaps ${b.label}`)
    }
    for (const must of ['Esc', 'W', 'A', 'S', 'D', 'Space', 'Enter']) if (!ks.some((k) => k.label === must)) layoutProblems.push(`${d.name}: no ${must}`)
  }
  check('010c layouts: LEDs unique and inside the report, no overlapping keys, the basics present', layoutProblems, [])
  check('key counts: F99 99, F75 80, F87 Pro 87, Hi75C Pro 81', sw.map((d) => { activateDevice(d); return layout.KEYS.length }), [99, 80, 87, 81])
  activateDevice(f99)

  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  // another brand's board on the same USB id: asked once, then left alone
  const other = new SW.MockSinowealthTransport(f99, 0x05)
  const kbOther = new SW.SinowealthKeyboard(other, f99)
  let refused = ''
  try { await kbOther.readAll() } catch (e) { refused = e.message }
  await wait(60)
  check('a board answering another model id: refused, and nothing but the model request is sent', [/model 0x05/.test(refused), other.sent.length, Array.from(other.sent[0].slice(0, 7))], [true, 1, [0x06, 0x82, 0x01, 0x00, 0x01, 0x00, 0x06]])
  await kbOther.close()

  // the F99: W blue at brightness 3/5
  const mock = new SW.MockSinowealthTransport(f99)
  const kb = new SW.SinowealthKeyboard(mock, f99)
  const regs = (await vite.ssrLoadModule('/src/hid/streamed.ts')).streamedDefaults()
  const w = keys.find((k) => k.label === 'W')
  regs.colors.set([w.id, 0, 0, 255], w.id * 4)
  // FCC's red swatch: on LEDs its bit of blue has to shrink as much as a screen shrinks it, or the key looks pink
  const e = keys.find((k) => k.label === 'E')
  regs.colors.set([e.id, 0xff, 0x2d, 0x55], e.id * 4)
  regs.led = codec.encodeLed(regs.led, { ...codec.decodeLed(regs.led), effect: 5, brightness: 3 })
  kb.seed({ led: regs.led, colors: regs.colors })
  await kb.readAll()
  await wait(30)
  const frame = mock.sent[1]
  check('F99 frame: report 0x06, 520 bytes, header, W blue at LED 14 (brightness 3/5), Esc white', [frame[0], frame.length, Array.from(frame.slice(0, 8)), Array.from(frame.slice(8 + 14 * 3, 11 + 14 * 3)), Array.from(frame.slice(8, 11))], [0x06, 520, [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7a, 0x01], [0, 0, 153], [153, 153, 153]])
  check('F99 frame: colours are made LED-linear (red #ff2d55 → 153, 4, 14 at 3/5, not pink)', Array.from(frame.slice(8 + ledOf('E') * 3, 11 + ledOf('E') * 3)), [153, 4, 14])
  await wait(1150)
  check('a still picture is sent again twice a second (the board drops streamed lighting after ~1 s)', mock.sent.length >= 4, true)
  await kb.close()
  const after = mock.sent.length
  await wait(600)
  check('closing stops the frames', mock.sent.length, after)
}

// ---- share codes: lighting and rapid trigger, across keyboards ----
{
  const Sh = await vite.ssrLoadModule('/src/share.ts')
  const f68 = DEVICES.find((x) => x.id === 'fighting68')
  const fun60 = DEVICES.find((x) => x.id === 'ry-2299')
  const razer = DEVICES.find((x) => x.id === 'razer-huntsman-v2')
  const blank = () => ({ led: new Uint8Array(16), colors: new Uint8Array(512), rt: new Uint8Array(1024) })

  // on the Fighting68: Wave at brightness 4, W red, W actuation 0.40 mm with RT 0.10 / 0.15 mm
  activateDevice(f68)
  const src = blank()
  const waveId = codec.EFFECTS.find((e) => e.name === 'Wave')?.id ?? codec.EFFECTS[1].id
  src.led = codec.encodeLed(src.led, { effect: waveId, r: 10, g: 20, b: 30, rainbow: true, brightness: 4, speed: 2, direction: 1 })
  const wF = layout.KEYS.find((k) => k.label === 'W')
  src.colors = codec.withColorMap(src.colors, new Map([[wF.id, [255, 0, 0]]]))
  src.rt = codec.withRT(src.rt, [wF.id], { actuation: 40, press: 10, release: 15, flags: 1 })
  const code = await Sh.encodeShareCode(Sh.sharedFrom({ name: 'My setup', from: 'Fighting68', ...src, caps: f68.caps }, { lighting: true, rt: true }))
  check('share code: one line, FCC1- prefix, compact', [code.startsWith('FCC1-'), /^[A-Za-z0-9_-]+$/.test(code.slice(5)), code.length < 4000], [true, true, true])

  // back onto the same model: the same settings
  const back = Sh.planImport(await Sh.decodeShareCode(code), blank(), f68.caps)
  check('same model: effect, per-key colour and rapid trigger come back as they were', [
    codec.decodeLed(back.patch.led).effect === waveId, codec.decodeLed(back.patch.led).brightness, Array.from(codec.decodeColor(back.patch.colors, wF.id)),
    (({ actuation, press, release, flags }) => [actuation, press, release, flags])(codec.decodeRT(back.patch.rt, wF.id)),
  ], [true, 4, [255, 0, 0], [40, 10, 15, 1]])

  // onto a MonsGeek FUN60 (another brand): the key is found by what it is, travel stays inside the board's range
  activateDevice(fun60)
  const wR = layout.KEYS.find((k) => k.label === 'W')
  const onFun = Sh.planImport(await Sh.decodeShareCode(code), blank(), fun60.caps)
  const rtR = codec.decodeRT(onFun.patch.rt, wR.id)
  check('other brand: W gets the red and the rapid trigger, within this board\'s limits', [
    Array.from(codec.decodeColor(onFun.patch.colors, wR.id)), rtR.press > 0 && rtR.release > 0,
    rtR.actuation >= codec.RT_LIMITS.actuationMin && rtR.actuation <= codec.RT_LIMITS.actuationMax,
  ], [[255, 0, 0], true, true])

  // onto a Razer: no adjustable switches, so rapid trigger is left out and said so
  activateDevice(razer)
  const onRazer = Sh.planImport(await Sh.decodeShareCode(code), blank(), razer.caps)
  check('board without rapid trigger: lighting applies, RT left out with a reason', ['led' in onRazer.patch, 'rt' in onRazer.patch, onRazer.skipped.some((s) => /rapid trigger/.test(s))], [true, false, true])

  // codes the way chat apps hand them over: in backticks, a code block, quotes, a sentence, split over lines …
  const wrapped = code.match(/.{1,70}/g).join('\n')
  const pasted = ['`' + code + '`', '```\n' + code + '\n```', `"${code}"`, `here's mine: ${code} enjoy!`, code + '.', wrapped, 'fcc1-' + code.slice(5),
    code.slice(0, 40) + '​' + code.slice(40), `<${code}>`, code + '\n' + code]
  const read = await Promise.all(pasted.map((t) => Sh.decodeShareCode(t).then((x) => x.name, (e) => e.message)))
  check('pasted codes are found in backticks, code blocks, quotes, sentences, wrapped lines, with invisible characters', read, pasted.map(() => 'My setup'))
  check('a code cut short says so', await Sh.decodeShareCode(code.slice(0, -10)).then(() => 'accepted', (e) => e.message), 'the code is damaged or incomplete: make sure all of it was copied')

  // codes that must be refused
  const reject = async (c) => { try { await Sh.decodeShareCode(c); return 'accepted' } catch (e) { return e.message } }
  const tampered = await Sh.encodeShareCode({ v: 1, name: 'x', from: 'y', rt: { keys: [['h1a', 5000, 10, 10, 0]] } })
  const future = await Sh.encodeShareCode({ v: 2, name: 'x', from: 'y' })
  const results = [await reject('hello'), await reject('FCC1-!!!'), await reject('FCC1-' + 'A'.repeat(20000)), await reject('FCC1-AAAA'), await reject(tampered), await reject(future)]
  check('refused: not a code, bad characters, too long, damaged, out-of-range values, newer format', results.map((r) => r !== 'accepted'), [true, true, true, true, true, true])
  activateDevice(f68)
}

// ---- support requests: spotting unsupported keyboards, and the request itself ----
{
  const S = await vite.ssrLoadModule('/src/support.ts')
  // a real Sonix descriptor fragment: vendor page 0xFF68, usage 0x61, feature report 0x05 of 64 bytes
  const sonixConfig = [0x06, 0x68, 0xff, 0x09, 0x61, 0xa1, 0x01, 0x85, 0x05, 0x75, 0x08, 0x95, 0x40, 0xb1, 0x02, 0xc0]
  const col = (vid, pid, product, page, usage, extra = {}) => ({
    vendor_id: vid, product_id: pid, product, manufacturer: 'Maker', release: 0x0102, usage_page: page, usage, interface: page === 1 ? 0 : 2, bus: 'Usb', descriptor: null, ...extra,
  })
  const scan = [
    col(0x0c45, 0x8030, 'Fighting68', 1, 6), col(0x0c45, 0x8030, 'Fighting68', 0xff68, 0x61), // supported
    col(0x0c45, 0x7777, 'Mystery HE', 1, 6), col(0x0c45, 0x7777, 'Mystery HE', 0xff68, 0x61, { descriptor: sonixConfig }), // unknown, configurable
    col(0x1234, 0x0001, 'Office Keyboard', 1, 6), // plain keyboard: no configuration interface
    col(0x1234, 0x0002, 'Gaming Mouse', 1, 6), col(0x1234, 0x0002, 'Gaming Mouse', 0xff00, 1), // a mouse that also types
    col(0x3151, 0x5007, 'AJAZZ 2.4G 8K', 1, 6), col(0x3151, 0x5007, 'AJAZZ 2.4G 8K', 0xffff, 2), // a wireless receiver
    col(0x1234, 0x0003, 'BT Board', 1, 6, { bus: 'Bluetooth' }), col(0x1234, 0x0003, 'BT Board', 0xff00, 1, { bus: 'Bluetooth' }),
  ]
  const boards = S.fromScan(scan)
  check('support: USB keyboards found (mouse, receiver and Bluetooth left out)', boards.map((k) => `${S.usbId(k)} ${k.known ? 'known' : 'new'}`), ['0c45:8030 known', '0c45:7777 new', '1234:0001 new'])
  check('support: only the unknown configurable one gets the start-screen notice', S.unsupportedOf(boards, []).map(S.usbId), ['0c45:7777'])
  check('support: hidden boards stay hidden', S.unsupportedOf(boards, ['0c45:7777']), [])
  const mystery = boards.find((k) => k.productId === 0x7777)
  check('support: chip guess from the vendor id', S.chipGuess(mystery), 'Sonix (the same family as most boards FCC supports)')
  check('support: report sizes read from the descriptor', mystery.interfaces[1].reports.feature, { 5: 64 })

  const req = await S.buildRequest(mystery, { brand: 'Acme', model: 'HE|65', link: 'https://example.com/he65', notes: 'Uses a web driver.' })
  check('support: issue title', req.title, 'Support request: Acme HE/65 (0c45:7777)')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { execFileSync } = await import('node:child_process')
  const file = path.join(os.tmpdir(), 'fcc-request-test.md')
  fs.writeFileSync(file, req.markdown)
  const decoded = execFileSync(process.execPath, [path.join(app, '../tools/report/decode.js'), file], { encoding: 'utf8' })
  check('support: decode.js reads the request back', [/Acme HE\|65/.test(decoded), /0c45:7777 "Mystery HE"/.test(decoded), /page 0xff68 usage 0x61 {2}feature 0x05:64B/.test(decoded)], [true, true, true])
  fs.rmSync(file)
}

// ---- the USB capture reader (tools/capture) on a built capture ----
{
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const { pcapng, control, interrupt, setup } = require('../../tools/capture/fixture.js')
  const { readCapture, decode } = require('../../tools/capture/usb-capture.js')
  const dev = Buffer.alloc(18)
  dev.writeUInt16LE(0x1532, 8)
  dev.writeUInt16LE(0x026c, 10)
  dev[15] = 2
  const name = Buffer.concat([Buffer.from([36, 3]), Buffer.from('Razer Huntsman V2', 'utf16le')])
  const report = (level) => Buffer.from([0, 0x1f, 0, 0, 0, 3, 0x0f, 0x04, 1, 5, level])
  const cap = pcapng([
    control(0, 7, setup(0x80, 6, 0x0100, 0, 18), { reply: dev }),
    control(0.01, 7, setup(0x80, 6, 0x0302, 0x409, 255), { reply: name }),
    control(0.5, 7, setup(0x21, 9, 0x0300, 3, 11), { out: report(0x80) }),
    control(0.52, 7, setup(0xa1, 1, 0x0300, 3, 11), { reply: report(0x80) }),
    control(3, 7, setup(0x21, 9, 0x0300, 3, 11), { out: report(0xff), split: true }),
    interrupt(3.1, 7, 0x81, Buffer.from([0, 0, 4, 0, 0, 0, 0, 0])),
    interrupt(3.2, 7, 0x02, Buffer.from([0x55, 0xaa])),
  ])
  const { devices, events } = decode(readCapture(cap))
  const d = devices.find((x) => x.id === '1.7')
  check('capture: device named from its descriptors', [d.vid, d.pid, d.product], [0x1532, 0x026c, 'Razer Huntsman V2'])
  check(
    'capture: SET / GET feature reports (also with data in its own packet), interrupt OUT; typing left out',
    events.map((e) => `${e.t} ${e.kind} ${e.report ?? ''} ${e.iface ?? e.ep} ${e.data.toString('hex')}`),
    ['0.5 set feature 3 001f000000030f04010580', '0.521 get feature 3 001f000000030f04010580', '3 set feature 3 001f000000030f040105ff', '3.2 out  2 55aa'],
  )
}

// ---- calibration mode never runs unless FCC asked for it ----
{
  const { Keyboard } = await vite.ssrLoadModule('/src/hid/device.ts')
  const { MockTransport } = await vite.ssrLoadModule('/src/hid/mock.ts')
  const P = await vite.ssrLoadModule('/src/hid/protocol.ts')
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const mock = new MockTransport()
  const sent = []
  const send = mock.send.bind(mock)
  mock.send = (p) => (sent.push(p[1]), send(p))
  const kb = new Keyboard(mock)
  const travel = []
  kb.sensor.on((e) => travel.push(e))
  // the board is put in calibration mode behind FCC's back (an earlier session, a crash): FCC ends it
  await send(P.buildCommand(P.Cmd.CalibrationStart))
  await wait(120)
  check('a calibration stream FCC did not start is ended, and none of it is shown as key travel', [sent.includes(P.Cmd.CalibrationEnd), travel.length], [true, 0])
  // FCC's own live travel still works, and ending it sends exactly what it should
  sent.length = 0
  await kb.command(P.Cmd.CalibrationStart)
  await wait(120)
  const seen = travel.length
  await kb.command(P.Cmd.CalibrationEnd)
  await wait(200)
  check('live travel FCC started streams, and is ended once (no stray-stop for its own trailing packets)', [seen > 0, sent.filter((c) => c === P.Cmd.CalibrationEnd).length], [true, 1])
  await kb.close()

  // a late reply for the previous chunk (after a retry) must not be taken for the current chunk's
  const real = new MockTransport()
  const realSend = real.send.bind(real)
  const listeners = []
  const onReport = real.onReport.bind(real)
  real.onReport = (l) => (listeners.push(l), onReport(l))
  real.send = async (p) => {
    const off = p[3] | (p[4] << 8)
    if (p[1] === 0x17 && off >= 56) {
      const stale = new Uint8Array(64)
      stale.set([0x55, 0x17, 56, (off - 56) & 0xff, (off - 56) >> 8])
      stale.fill(0xee, 8)
      listeners.forEach((l) => l(stale))
    }
    return realSend(p)
  }
  const kb2 = new Keyboard(real)
  const clean = await new Keyboard(new MockTransport()).readRegion('rt')
  const rt = await kb2.readRegion('rt')
  check('a stale reply for another chunk is ignored: the region reads back exactly', Array.from(rt).every((v, i) => v === clean[i]), true)
}

// ---- accent colours stay visible on every theme ----
{
  const T = await vite.ssrLoadModule('/src/theme.ts')
  check('accent: white on a light theme is darkened until it stands out', T.visibleOn([255, 255, 255], false).every((v) => v < 160), true)
  check('accent: black on a dark theme is lightened until it stands out', T.visibleOn([0, 0, 0], true).every((v) => v > 80), true)
  check('accent: a colour that already stands out is used exactly as picked', [T.visibleOn([37, 99, 235], false), T.visibleOn([37, 99, 235], true)], [[37, 99, 235], [37, 99, 235]])
}

await vite.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
