// Builds app/src/devices/rk-catalog.json for Royal Kludge "legacy" (Sinowealth, VID 0x258a) boards from the
// KB.ini definition files of RK's Windows software. Only facts are extracted (key positions, key slots, key codes,
// lighting mode capabilities); RK's files themselves are not shipped.
//
//   node build-rk.js <dir containing <PID>/KB.ini> <out.json>
//
// KB.ini [KEY] entries look like:  K1=57,22,79,44, 0x02,0x1B,0x00,0
//   x1,y1,x2,y2 (pixels in RK's keyboard picture), type, Windows virtual-key code, extra, key slot (bIndex)
// [OPT] LedOptN=a,s,b,d,r,c: capability flags of lighting mode N (speed, brightness, direction, random, colour).

const fs = require('fs')
const path = require('path')
const [devDir, out] = process.argv.slice(2)

// The boards to include. Names as RK lists them.
const BOARDS = [
  { pid: 0x0147, name: 'RK M75' },
  { pid: 0x0163, name: 'RK M75 RGB (new layout)' },
  { pid: 0x0175, name: 'RK M75 ISO' },
  { pid: 0x01ac, name: 'RK M75N ISO' },
]

// RK's standard lighting mode names, by mode number.
const MODE_NAMES = {
  1: 'Steady', 2: 'Customize', 3: 'Breathing', 4: 'Press and destroy', 5: 'Neon stream', 6: 'Streamer',
  7: 'Ambilight', 8: 'Dripping ripples', 9: 'Brilliant point', 10: 'Flash away', 11: 'Shadow disappear',
  12: 'Ripples shining', 13: 'Rich and honored', 14: 'Marquee', 15: 'Rotating storm', 16: 'Serpentine race',
  17: 'Stars twinkle', 18: 'Retro snake', 19: 'Diagonal transformation', 20: 'Sine wave',
}

// Windows virtual-key code -> USB HID usage (standard VK constants; 0xFA is RK's Fn key).
const VK_TO_HID = {
  0x08: 0x2a, 0x09: 0x2b, 0x0d: 0x28, 0x13: 0x48, 0x14: 0x39, 0x1b: 0x29, 0x20: 0x2c,
  0x21: 0x4b, 0x22: 0x4e, 0x23: 0x4d, 0x24: 0x4a, 0x25: 0x50, 0x26: 0x52, 0x27: 0x4f, 0x28: 0x51,
  0x2c: 0x46, 0x2d: 0x49, 0x2e: 0x4c, 0x5b: 0xe3, 0x5c: 0xe7, 0x5d: 0x65, 0x91: 0x47, 0x90: 0x53,
  0xa0: 0xe1, 0xa1: 0xe5, 0xa2: 0xe0, 0xa3: 0xe4, 0xa4: 0xe2, 0xa5: 0xe6,
  0xba: 0x33, 0xbb: 0x2e, 0xbc: 0x36, 0xbd: 0x2d, 0xbe: 0x37, 0xbf: 0x38, 0xc0: 0x35,
  0xdb: 0x2f, 0xdc: 0x31, 0xdd: 0x30, 0xde: 0x34, 0xe2: 0x64,
  0xfa: 0x00, // Fn
}
for (let i = 0; i < 26; i++) VK_TO_HID[0x41 + i] = 0x04 + i // A-Z
for (let i = 1; i <= 9; i++) VK_TO_HID[0x30 + i] = 0x1d + i // 1-9
VK_TO_HID[0x30] = 0x27 // 0
for (let i = 0; i < 12; i++) VK_TO_HID[0x70 + i] = 0x3a + i // F1-F12

function parseIni(file) {
  const text = fs.readFileSync(file, 'latin1').replace(/\r/g, '')
  const sections = {}
  let cur = null
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (!s || s.startsWith(';')) continue
    const h = s.match(/^\[(.+)\]$/)
    if (h) { cur = sections[h[1]] = {}; continue }
    const kv = s.match(/^([^=]+?)\s*=\s*(.*)$/)
    if (kv && cur) cur[kv[1].trim()] = kv[2].trim()
  }
  return sections
}

const q = (v) => Math.round(v * 4) / 4

function buildLayout(keySection) {
  const raw = Object.entries(keySection)
    .filter(([k]) => /^K\d+$/.test(k))
    .map(([, v]) => {
      const p = v.split(',').map((x) => x.trim())
      return { x1: +p[0], y1: +p[1], x2: +p[2], y2: +p[3], vk: parseInt(p[5], 16), slot: +p[7] }
    })
  // key pitch: the most common distance between neighbouring 1u keys on a row
  const sizes = raw.map((k) => k.x2 - k.x1).sort((a, b) => a - b)
  const unitW = sizes[Math.floor(sizes.length / 2)]
  const steps = []
  for (const a of raw) for (const b of raw) if (b.x1 > a.x1 && Math.abs(b.y1 - a.y1) < 5 && b.x1 - a.x1 < unitW * 2.2) steps.push(b.x1 - a.x1)
  steps.sort((a, b) => a - b)
  const pitch = steps[Math.floor(steps.length / 4)] // lower quartile = adjacent keys, not gaps
  // rows: cluster key tops
  const tops = [...new Set(raw.map((k) => k.y1))].sort((a, b) => a - b)
  const rows = []
  for (const t of tops) if (!rows.length || t - rows[rows.length - 1] > unitW * 0.6) rows.push(t)
  const rowOf = (y) => rows.reduce((best, r, i) => (Math.abs(r - y) < Math.abs(rows[best] - y) ? i : best), 0)
  const x0 = Math.min(...raw.map((k) => k.x1))
  return raw.map((k) => {
    const hid = VK_TO_HID[k.vk]
    if (hid === undefined) throw new Error(`unknown VK 0x${k.vk.toString(16)}`)
    return [k.slot, hid, q((k.x1 - x0) / pitch), rowOf(k.y1), q((k.x2 - k.x1 + (pitch - unitW)) / pitch), 1]
  })
}

const devices = BOARDS.map(({ pid, name }) => {
  const hex = pid.toString(16).toUpperCase().padStart(4, '0')
  const ini = parseIni(path.join(devDir, hex, 'KB.ini'))
  const opt = ini.OPT
  const modes = Object.entries(opt)
    .filter(([k]) => /^LedOpt\d+$/.test(k))
    .map(([k, v]) => {
      const index = +k.slice(6)
      const [, speed, brightness, direction, random, color] = v.split(',').map((x) => +x.trim())
      return { index, name: MODE_NAMES[index] ?? `Mode ${index}`, speed: !!speed, brightness: !!brightness, direction, random: !!random, color: !!color }
    })
    .sort((a, b) => a.index - b.index)
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name,
    vendorId: 0x258a,
    productId: pid,
    rgb: opt.RGBKb === '1',
    layers: +opt.LayerNum || 1,
    keys: buildLayout(ini.KEY),
    lighting: { modes, defaultMode: +opt.DefLedIndex || modes[0]?.index || 1, defaultBrightness: +opt.DefBri || 5 },
  }
})

fs.writeFileSync(out, JSON.stringify({ source: "RK Windows software KB.ini (facts only), 2026-10-10", devices }))
console.log(devices.map((d) => `${d.name}: ${d.keys.length} keys, ${d.lighting.modes.length} modes`).join('\n'))
