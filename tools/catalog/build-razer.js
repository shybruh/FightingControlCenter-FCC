// Builds app/src/devices/razer-catalog.json: the Razer keyboards FCC supports, with protocol details and key layouts.
//
// Protocol details per model (interface, transaction ids, which settings exist, matrix size) are the facts OpenRazer's
// keyboard driver documents. Key positions in each board's LED matrix follow OpenRGB's approach: a standard ANSI
// keyboard (full / TKL / 75% / 60%) on a grid, then a few per-model edits. Nothing here is copied code; it's the same
// facts written down as data, and the layout rules re-implemented.
//
// Usage: node tools/catalog/build-razer.js

const fs = require('fs')
const path = require('path')

// ---------- standard ANSI keyboard on the LED grid: [name, row, col] ----------

const MAIN = [
  ['`', 1, 0], ['1', 1, 1], ['2', 1, 2], ['3', 1, 3], ['4', 1, 4], ['5', 1, 5], ['6', 1, 6], ['7', 1, 7], ['8', 1, 8], ['9', 1, 9],
  ['0', 1, 10], ['-', 1, 11], ['=', 1, 12], ['Backspace', 1, 13],
  ['Tab', 2, 0], ['Q', 2, 1], ['W', 2, 2], ['E', 2, 3], ['R', 2, 4], ['T', 2, 5], ['Y', 2, 6], ['U', 2, 7], ['I', 2, 8], ['O', 2, 9],
  ['P', 2, 10], ['[', 2, 11], [']', 2, 12], ['\\', 2, 13],
  ['Caps', 3, 0], ['A', 3, 1], ['S', 3, 2], ['D', 3, 3], ['F', 3, 4], ['G', 3, 5], ['H', 3, 6], ['J', 3, 7], ['K', 3, 8], ['L', 3, 9],
  [';', 3, 10], ["'", 3, 11], ['Enter', 3, 13],
  ['LShift', 4, 0], ['Z', 4, 2], ['X', 4, 3], ['C', 4, 4], ['V', 4, 5], ['B', 4, 6], ['N', 4, 7], ['M', 4, 8], [',', 4, 9], ['.', 4, 10],
  ['/', 4, 11], ['RShift', 4, 13],
  ['LCtrl', 5, 0], ['LWin', 5, 1], ['LAlt', 5, 2], ['Space', 5, 6], ['RAlt', 5, 10], ['Fn', 5, 11], ['Menu', 5, 12], ['RCtrl', 5, 13],
]
const FN_ROW = [
  ['Esc', 0, 0], ['F1', 0, 2], ['F2', 0, 3], ['F3', 0, 4], ['F4', 0, 5], ['F5', 0, 6], ['F6', 0, 7], ['F7', 0, 8], ['F8', 0, 9],
  ['F9', 0, 10], ['F10', 0, 11], ['F11', 0, 12], ['F12', 0, 13], ['PrtSc', 0, 14], ['ScrLk', 0, 15], ['Pause', 0, 16],
]
const EXTRAS = [
  ['Ins', 1, 14], ['Home', 1, 15], ['PgUp', 1, 16], ['Del', 2, 14], ['End', 2, 15], ['PgDn', 2, 16],
  ['Up', 4, 15], ['Left', 5, 14], ['Down', 5, 15], ['Right', 5, 16],
]
const NUMPAD = [
  ['Num', 1, 17], ['N/', 1, 18], ['N*', 1, 19], ['N-', 1, 20], ['N7', 2, 17], ['N8', 2, 18], ['N9', 2, 19], ['N+', 2, 20],
  ['N4', 3, 17], ['N5', 3, 18], ['N6', 3, 19], ['N1', 4, 17], ['N2', 4, 18], ['N3', 4, 19], ['NEnter', 4, 20], ['N0', 5, 18], ['N.', 5, 19],
]
const SIZES = {
  full: [MAIN, FN_ROW, EXTRAS, NUMPAD],
  tkl: [MAIN, FN_ROW, EXTRAS],
  '75': [MAIN, FN_ROW],
  '60': [MAIN],
}

// ---------- layout rules ----------

const sorted = (keys) => keys.sort((a, b) => a.row - b.row || a.col - b.col)

/** Puts a key at row/col and moves that row's keys from col on one to the right; a blank name only moves them. */
function insert(keys, name, row, col) {
  for (const k of keys) if (k.row === row && k.col >= col) k.col++
  if (name) keys.push({ name, row, col })
  return sorted(keys)
}
/** Removes the key at row/col (if any) and moves the row's later keys one to the left. */
function remove(keys, row, col) {
  const out = keys.filter((k) => !(k.row === row && k.col === col))
  for (const k of out) if (k.row === row && k.col > col) k.col--
  return sorted(out)
}
/** Renames the key at row/col, deletes it for a blank name, or adds it where there was none. */
function swap(keys, name, row, col) {
  const at = keys.find((k) => k.row === row && k.col === col)
  if (at && name) at.name = name
  else if (at) keys.splice(keys.indexOf(at), 1)
  else if (name) keys.push({ name, row, col })
  return sorted(keys)
}

function layout(size, edits) {
  let keys = sorted(SIZES[size].flat().map(([name, row, col]) => ({ name, row, col })))
  if (size === '60') {
    // no function row: the number row moves up and Esc takes the backtick's place
    keys = keys.map((k) => ({ ...k, row: k.row - 1 }))
    swap(keys, 'Esc', 0, 0)
  }
  for (const [op, row, col, name] of edits) {
    if (op === 'ins') keys = insert(keys, name, row, col)
    else if (op === 'rm') keys = remove(keys, row, col)
    else keys = swap(keys, name, row, col)
  }
  return keys
}

/** "(row,0) moves right" on every keyboard row: the matrix keeps column 0 for macro keys or nothing. */
const shiftRows = (rows) => rows.map((r) => ['ins', r, 0, ''])
const MEDIA = (row, from) => ['Prev', 'Play', 'Next', 'Mute'].map((n, i) => ['ins', row, from + i, n])

// ---------- models ----------
// iface: USB interface for commands. tid: transaction ids [effects, per-key frame, brightness]. game: storage + tid for
// game mode. frameNoAnswer: the board doesn't answer per-key frames. polling: Hz list when the board has the
// polling-rate command. keyswitch: typing/gaming optimisation. matrix: OpenRazer's [rows, cols].
// lights: LEDs that aren't keys (underglow), in the order OpenRGB lists them after the keyboard. Like OpenRGB, they
// continue the LED matrix where the keys end (row 6 onwards, left to right): { side, name, count, segments } draws them
// as a strip beside the keys, split into segments FCC paints as one; { skip } is LEDs that aren't connected.
// fx: how fast the board's firmware runs breathing / spectrum / wave (FCC's preview speed, 1 slow … 5 fast). Razer
// sends every board the same commands, so the pace is the firmware's own. Measured: Huntsman V2 (1); the BlackWidow V3
// TKL runs faster than that. Others follow their generation (boards on transaction id 0x3f are the older firmware).

const SIDES = [{ side: 'left', name: 'Underglow left', count: 9, segments: 3 }, { side: 'right', name: 'Underglow right', count: 9, segments: 3 }]
// OpenRGB has these 66 as one block; where each sits around the board isn't documented, so they're one strip below it
const UNDERGLOW_66 = [{ side: 'bottom', name: 'Underglow', count: 66, segments: 6 }]

const MODELS = [
  { id: 'huntsman-v2', name: 'Huntsman V2', pid: 0x026c, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['no', 0x1f], polling: [125, 250, 500, 1000, 2000, 4000, 8000], keyswitch: true, matrix: [6, 22], size: 'full', edits: MEDIA(0, 17) },
  { id: 'huntsman-v2-tkl', name: 'Huntsman V2 TKL', pid: 0x026b, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['no', 0x1f], polling: [125, 250, 500, 1000, 2000, 4000, 8000], keyswitch: true, matrix: [6, 18], size: 'tkl', edits: [] },
  { id: 'huntsman-v2-analog', name: 'Huntsman V2 Analog', pid: 0x0266, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [9, 22], lights: UNDERGLOW_66, size: 'full', edits: [...shiftRows([0]), ...MEDIA(0, 18), ...shiftRows([1, 2, 3, 4, 5])] },
  { id: 'huntsman-v3-pro', name: 'Huntsman V3 Pro', pid: 0x02a6, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: [...shiftRows([0, 1, 2, 3, 4, 5]), ['rm', 5, 17]] },
  { id: 'huntsman-v3-pro-tkl', name: 'Huntsman V3 Pro TKL', pid: 0x02a7, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [6, 22], size: 'tkl', edits: [['ins', 0, 0, ''], ['swap', 0, 16, 'Play'], ['ins', 0, 17, ''], ...shiftRows([1, 2, 3, 4, 5])] },
  { id: 'huntsman-mini', name: 'Huntsman Mini', pid: 0x0257, iface: 2, tid: [0x3f, 0x3f, 0x3f], game: ['var', 0xff], matrix: [5, 15], size: '60', edits: shiftRows([0, 1, 2, 3, 4]) },
  { id: 'huntsman-elite', name: 'Huntsman Elite', pid: 0x0226, iface: 1, tid: [0x3f, 0x3f, 0x3f], game: ['var', 0xff], matrix: [9, 22], lights: UNDERGLOW_66, size: 'full', edits: [...shiftRows([0]), ...MEDIA(0, 18), ...shiftRows([1, 2, 3, 4, 5])] },
  { id: 'huntsman-te', name: 'Huntsman Tournament Edition', pid: 0x0243, iface: 2, tid: [0x3f, 0x3f, 0x3f], game: ['var', 0xff], matrix: [6, 18], size: 'tkl', edits: shiftRows([0, 1, 2, 3, 4, 5]) },
  { id: 'huntsman', name: 'Huntsman', pid: 0x0227, iface: 1, tid: [0x3f, 0x3f, 0x3f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: shiftRows([0, 1, 2, 3, 4, 5]) },
  { id: 'blackwidow-v3', name: 'BlackWidow V3', pid: 0x024e, iface: 3, tid: [0x3f, 0x1f, 0x3f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: [...shiftRows([0, 1, 2, 3, 4, 5]), ['swap', 5, 6, 'Space'], ['swap', 5, 7, ''], ['swap', 5, 10, 'RAlt']] },
  { id: 'blackwidow-v3-tkl', name: 'BlackWidow V3 TKL', pid: 0x0a24, iface: 2, tid: [0x3f, 0x1f, 0x3f], game: ['var', 0xff], matrix: [6, 18], size: 'tkl', edits: shiftRows([0, 1, 2, 3, 4, 5]) },
  { id: 'blackwidow-v3-mini', name: 'BlackWidow V3 Mini (wired)', pid: 0x0258, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [5, 16], size: '60', edits: [['swap', 0, 0, 'Esc'], ['ins', 0, 13, ''], ['swap', 0, 15, 'Del'], ['swap', 1, 15, 'PgUp'], ['swap', 2, 15, 'PgDn'], ['swap', 3, 14, 'Ins'], ['swap', 3, 15, 'Up'], ['swap', 4, 12, 'RCtrl'], ['swap', 4, 13, 'Left'], ['swap', 4, 14, 'Down'], ['swap', 4, 15, 'Right']] },
  { id: 'blackwidow-v3-pro', name: 'BlackWidow V3 Pro (wired)', pid: 0x025a, iface: 2, tid: [0x3f, 0x1f, 0x3f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: MEDIA(0, 18) },
  { id: 'blackwidow-v4', name: 'BlackWidow V4', pid: 0x0287, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], frameNoAnswer: true, lights: SIDES, polling: [125, 250, 500, 1000, 2000, 4000, 8000], matrix: [8, 23], size: 'full', edits: [...shiftRows([0]), ...MEDIA(0, 19), ...shiftRows([1, 2, 3, 4, 5])] },
  { id: 'blackwidow-v4-pro', name: 'BlackWidow V4 Pro', pid: 0x028d, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], frameNoAnswer: true, lights: [...SIDES, { skip: 5 }, { side: 'bottom', name: 'Wrist rest', count: 20, segments: 5 }], polling: [125, 250, 500, 1000, 2000, 4000, 8000], matrix: [8, 23], size: 'full', edits: [...shiftRows([0]), ...MEDIA(0, 19), ...shiftRows([1, 2, 3, 4, 5])] },
  { id: 'blackwidow-v4-x', name: 'BlackWidow V4 X', pid: 0x0293, iface: 2, tid: [0x3f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: [] },
  { id: 'blackwidow-v4-75', name: 'BlackWidow V4 75%', pid: 0x02a5, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], frameNoAnswer: true, polling: [125, 250, 500, 1000, 2000, 4000, 8000], matrix: [6, 16], size: '75', edits: [/* OpenRGB lists (0,2) here, which deletes F1; closing the gap after Esc is what it means */ ['rm', 0, 1], ['ins', 1, 14, ''], ['ins', 1, 16, 'Del'], ['ins', 2, 16, 'PgUp'], ['ins', 3, 16, 'PgDn'], ['ins', 4, 15, 'Up'], ['ins', 4, 16, 'Ins'], ['rm', 5, 13], ['ins', 5, 14, 'Left'], ['ins', 5, 15, 'Down'], ['ins', 5, 16, 'Right']] },
  { id: 'blackwidow-v4-tkl', name: 'BlackWidow V4 TKL (wired)', pid: 0x02d7, iface: 3, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], polling: [125, 250, 500, 1000], matrix: [6, 18], size: 'tkl', edits: [['ins', 0, 10, ''], ['ins', 1, 14, ''], ['ins', 2, 14, ''], ['ins', 4, 14, ''], ['ins', 5, 5, '']] },
  { id: 'blackwidow-elite', name: 'BlackWidow Elite', pid: 0x0228, iface: 1, tid: [0x1f, 0x1f, 0x1f], game: ['var', 0xff], matrix: [6, 22], size: 'full', edits: [...shiftRows([0]), ...MEDIA(0, 18), ...shiftRows([1, 2, 3, 4, 5]), ['rm', 5, 6]] },
]

// ---------- labels, HID usages and on-screen geometry ----------

const HID = {
  Esc: 0x29, F1: 0x3a, F2: 0x3b, F3: 0x3c, F4: 0x3d, F5: 0x3e, F6: 0x3f, F7: 0x40, F8: 0x41, F9: 0x42, F10: 0x43, F11: 0x44, F12: 0x45,
  PrtSc: 0x46, ScrLk: 0x47, Pause: 0x48, '`': 0x35, 1: 0x1e, 2: 0x1f, 3: 0x20, 4: 0x21, 5: 0x22, 6: 0x23, 7: 0x24, 8: 0x25, 9: 0x26, 0: 0x27,
  '-': 0x2d, '=': 0x2e, Backspace: 0x2a, Tab: 0x2b, Q: 0x14, W: 0x1a, E: 0x08, R: 0x15, T: 0x17, Y: 0x1c, U: 0x18, I: 0x0c, O: 0x12,
  P: 0x13, '[': 0x2f, ']': 0x30, '\\': 0x31, Caps: 0x39, A: 0x04, S: 0x16, D: 0x07, F: 0x09, G: 0x0a, H: 0x0b, J: 0x0d, K: 0x0e,
  L: 0x0f, ';': 0x33, "'": 0x34, Enter: 0x28, LShift: 0xe1, Z: 0x1d, X: 0x1b, C: 0x06, V: 0x19, B: 0x05, N: 0x11, M: 0x10, ',': 0x36,
  '.': 0x37, '/': 0x38, RShift: 0xe5, LCtrl: 0xe0, LWin: 0xe3, LAlt: 0xe2, Space: 0x2c, RAlt: 0xe6, Fn: 0, Menu: 0x65, RCtrl: 0xe4,
  Ins: 0x49, Home: 0x4a, PgUp: 0x4b, Del: 0x4c, End: 0x4d, PgDn: 0x4e, Up: 0x52, Left: 0x50, Down: 0x51, Right: 0x4f,
  Num: 0x53, 'N/': 0x54, 'N*': 0x55, 'N-': 0x56, N7: 0x5f, N8: 0x60, N9: 0x61, 'N+': 0x57, N4: 0x5c, N5: 0x5d, N6: 0x5e,
  N1: 0x59, N2: 0x5a, N3: 0x5b, NEnter: 0x58, N0: 0x62, 'N.': 0x63, Prev: 0, Play: 0, Next: 0, Mute: 0,
}
const LABEL = {
  LShift: 'Shift', RShift: 'Shift', LCtrl: 'Ctrl', RCtrl: 'Ctrl', LWin: 'Win', LAlt: 'Alt', RAlt: 'Alt', Up: '↑', Left: '←', Down: '↓', Right: '→',
  'N/': '/', 'N*': '*', 'N-': '-', 'N+': '+', NEnter: 'Enter', 'N.': '.', Prev: '⏮', Play: '⏯', Next: '⏭', Mute: '🔇',
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4', N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
}
const WIDTH = { Backspace: 2, Tab: 1.5, '\\': 1.5, Caps: 1.75, Enter: 2.25, LShift: 2.25, RShift: 2.75, LCtrl: 1.25, LWin: 1.25, LAlt: 1.25, Space: 6.25, RAlt: 1.25, Fn: 1.25, Menu: 1.25, RCtrl: 1.25, N0: 2 }
const TALL = new Set(['N+', 'NEnter'])
/** Fixed spots on full-size and TKL boards (key units); everything else follows on from the key before it. */
const FIXED = {
  Esc: 0, F1: 2, F5: 6.5, F9: 11, PrtSc: 15.25, Ins: 15.25, Del: 15.25, Up: 16.25, Left: 15.25, Num: 18.5, N7: 18.5, N4: 18.5, N1: 18.5, N0: 18.5,
}
const ROW_Y = [0, 1.25, 2.25, 3.25, 4.25, 5.25]

function geometry(model, keys) {
  const wide = model.size === 'full' || model.size === 'tkl'
  const out = []
  for (let row = 0; row < 6; row++) {
    const inRow = keys.filter((k) => k.row === row).sort((a, b) => a.col - b.col)
    // 75% / 60%: no gap under Esc, a compact bottom row, and Shift shortened for the arrow keys
    const compact = !wide
    let x = 0
    for (const k of inRow) {
      let w = WIDTH[k.name] ?? 1
      if (compact && model.size === '75') {
        if (k.name === 'RShift') w = 1.75
        if (k.name === 'RAlt' || k.name === 'Fn' || k.name === 'RCtrl') w = 1
      }
      if (compact && model.size === '60' && inRow.some((o) => o.name === 'Up')) {
        // 65%: shorter right Shift and single-unit modifiers next to the arrows
        if (k.name === 'RShift') w = 1.75
        if (k.name === 'RAlt' || k.name === 'Fn' || k.name === 'RCtrl' || k.name === 'Menu') w = 1
      }
      if (wide && FIXED[k.name] !== undefined) x = FIXED[k.name]
      // media keys sit above the numpad, or after Pause on TKL boards
      if (wide && ['Prev', 'Play', 'Next', 'Mute'].includes(k.name) && x < 18.5 && model.size === 'full' && k.name === 'Prev') x = 18.5
      // 75%: a quarter gap after Esc in the function row
      if (model.size === '75' && row === 0 && k.name !== 'Esc' && x === 1) x = 1.25
      out.push({ name: k.name, row: k.row, col: k.col, x, y: model.size === '60' ? row : ROW_Y[row], w, h: TALL.has(k.name) ? 2 : 1 })
      x += w
    }
  }
  return out
}

/** Light strips beside the keys (thickness and gap in key units); the keys move right when there's a strip on the left. */
const STRIP = 0.32
const GAP = 0.28
function lightStrips(m, keys, cols) {
  if (!m.lights) return { keys, lights: [] }
  const left = m.lights.some((l) => l.side === 'left') ? STRIP + GAP : 0
  const moved = keys.map((k) => ({ ...k, x: k.x + left }))
  const right = Math.max(...moved.map((k) => k.x + k.w))
  const bottom = Math.max(...moved.map((k) => k.y + k.h))
  const out = []
  // the LEDs after the keyboard's own rows, numbered on along the matrix
  let led = 6 * cols
  for (const l of m.lights) {
    if (l.skip) {
      led += l.skip
      continue
    }
    const per = l.count / l.segments
    const vertical = l.side !== 'bottom'
    const length = vertical ? bottom : right - left
    const start = vertical ? 0 : left
    const size = (length - GAP * (l.segments - 1)) / l.segments
    for (let s = 0; s < l.segments; s++) {
      const cells = []
      for (let i = Math.round(s * per); i < Math.round((s + 1) * per); i++) cells.push([Math.floor((led + i) / cols), (led + i) % cols])
      const at = start + s * (size + GAP)
      const x = l.side === 'left' ? 0 : l.side === 'right' ? right + GAP : at
      const y = vertical ? at : bottom + GAP
      out.push({ name: `${l.name} ${s + 1}`, x, y, w: vertical ? STRIP : size, h: vertical ? size : STRIP, cells })
    }
    led += l.count
  }
  return { keys: moved, lights: out }
}

const round = (n) => +n.toFixed(2)

const catalog = MODELS.map((m) => {
  const keys = layout(m.size, m.edits).filter((k) => k.row < 6)
  const cols = Math.max(m.matrix[1], ...keys.map((k) => k.col + 1))
  const placed = lightStrips(m, geometry(m, keys), cols)
  return {
    id: `razer-${m.id}`,
    name: `Razer ${m.name}`,
    productId: m.pid,
    iface: m.iface,
    tid: { effect: m.tid[0], frame: m.tid[1], brightness: m.tid[2], game: m.game[1] },
    gameStore: m.game[0] === 'var' ? 1 : 0,
    frameNoAnswer: !!m.frameNoAnswer,
    pollingRates: m.polling ?? [],
    keyswitch: !!m.keyswitch,
    previewSpeed: m.fx ?? (m.tid[0] === 0x3f ? 3 : 1),
    rows: m.matrix[0],
    cols,
    keys: [
      ...placed.keys.map((k) => [LABEL[k.name] ?? k.name, HID[k.name] ?? 0, k.row, k.col, round(k.x), k.y, k.w, k.h]),
      // lights that aren't keys: no HID usage, and every matrix cell the segment covers
      ...placed.lights.map((l) => [l.name, 0, l.cells[0][0], l.cells[0][1], round(l.x), round(l.y), round(l.w), round(l.h), l.cells]),
    ],
  }
})

const out = path.join(__dirname, '../../app/src/devices/razer-catalog.json')
fs.writeFileSync(out, JSON.stringify(catalog) + '\n')
for (const c of catalog) {
  const lights = c.keys.filter((k) => k[8]).length
  console.log(`${c.name.padEnd(34)} ${c.productId.toString(16).padStart(4, '0')} if${c.iface} ${c.rows}x${c.cols} ${c.keys.length - lights} keys${lights ? ` + ${lights} light segments` : ''}`)
}
