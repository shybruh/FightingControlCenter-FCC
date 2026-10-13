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

await vite.close()
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
