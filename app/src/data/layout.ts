// Keyboard layouts. `id` is the firmware key index used by every per-key region.
// The active layout is swapped per connected board (see devices/registry.ts); these exports are live
// bindings, so importers always see the current board.

export interface KeyDef {
  id: number
  label: string
  /** secondary (shifted) legend */
  sub?: string
  /** default Fn-layer legend */
  fn?: string
  /** HID usage of the key's native function */
  hid: number
  w: number
  /** height in rows (numpad + / Enter span two) */
  h?: number
  x: number
  y: number
}

type Row = Array<[id: number, label: string, hid: number, w?: number, sub?: string]>

const ROWS: Row[] = [
  [
    [0, 'Esc', 0x29],
    [17, '1', 0x1e, 1, '!'],
    [18, '2', 0x1f, 1, '@'],
    [19, '3', 0x20, 1, '#'],
    [20, '4', 0x21, 1, '$'],
    [21, '5', 0x22, 1, '%'],
    [22, '6', 0x23, 1, '^'],
    [23, '7', 0x24, 1, '&'],
    [24, '8', 0x25, 1, '*'],
    [25, '9', 0x26, 1, '('],
    [26, '0', 0x27, 1, ')'],
    [27, '-', 0x2d, 1, '_'],
    [28, '=', 0x2e, 1, '+'],
    [92, 'Backspace', 0x2a, 2],
    [103, 'Ins', 0x49],
  ],
  [
    [32, 'Tab', 0x2b, 1.5],
    [33, 'Q', 0x14],
    [34, 'W', 0x1a],
    [35, 'E', 0x08],
    [36, 'R', 0x15],
    [37, 'T', 0x17],
    [38, 'Y', 0x1c],
    [39, 'U', 0x18],
    [40, 'I', 0x0c],
    [41, 'O', 0x12],
    [42, 'P', 0x13],
    [43, '[', 0x2f, 1, '{'],
    [44, ']', 0x30, 1, '}'],
    [60, '\\', 0x31, 1.5, '|'],
    [106, 'Del', 0x4c],
  ],
  [
    [48, 'Caps', 0x39, 1.75],
    [49, 'A', 0x04],
    [50, 'S', 0x16],
    [51, 'D', 0x07],
    [52, 'F', 0x09],
    [53, 'G', 0x0a],
    [54, 'H', 0x0b],
    [55, 'J', 0x0d],
    [56, 'K', 0x0e],
    [57, 'L', 0x0f],
    [58, ';', 0x33, 1, ':'],
    [59, "'", 0x34, 1, '"'],
    [76, 'Enter', 0x28, 2.25],
    [105, 'PgUp', 0x4b],
  ],
  [
    [64, 'Shift', 0xe1, 2.25],
    [65, 'Z', 0x1d],
    [66, 'X', 0x1b],
    [67, 'C', 0x06],
    [68, 'V', 0x19],
    [69, 'B', 0x05],
    [70, 'N', 0x11],
    [71, 'M', 0x10],
    [72, ',', 0x36, 1, '<'],
    [73, '.', 0x37, 1, '>'],
    [74, '/', 0x38, 1, '?'],
    [75, 'Shift', 0xe5, 1.75],
    [90, '↑', 0x52],
    [108, 'PgDn', 0x4e],
  ],
  [
    [80, 'Ctrl', 0xe0, 1.25],
    [81, 'Win', 0xe3, 1.25],
    [82, 'Alt', 0xe2, 1.25],
    [83, '', 0x2c, 6.25],
    [84, 'Alt', 0xe6],
    [85, 'Fn', 0x00],
    [87, 'Ctrl', 0xe4],
    [88, '←', 0x50],
    [89, '↓', 0x51],
    [91, '→', 0x4f],
  ],
]

const FN_LEGENDS: Record<number, string> = {
  0: '~',
  17: 'F1', 18: 'F2', 19: 'F3', 20: 'F4', 21: 'F5', 22: 'F6',
  23: 'F7', 24: 'F8', 25: 'F9', 26: 'F10', 27: 'F11', 28: 'F12',
  92: 'Reset', 103: 'Home', 106: 'End', 105: 'PrtSc', 108: 'ScrLk',
  37: 'LED off', 60: 'Color+', 76: 'LED mode', 66: 'SOCD',
  49: 'Win', 50: 'Mac', 80: 'Fn swap',
  90: 'Bright+', 89: 'Bright−', 88: 'Effect−', 91: 'Effect+',
}

/** Hand-tuned Fighting68 layout (verified on hardware). */
export const FIGHTING68_KEYS: KeyDef[] = ROWS.flatMap((row, y) => {
  let x = 0
  return row.map(([id, label, hid, w = 1, sub]) => {
    const k: KeyDef = { id, label, hid, w, x, y, sub, fn: FN_LEGENDS[id] }
    x += w
    return k
  })
})

export let KEYS: KeyDef[] = FIGHTING68_KEYS
export let KEY_BY_ID = new Map<number, KeyDef>()
export let KEY_IDS: number[] = []
export let LAYOUT_WIDTH = 16
export let LAYOUT_HEIGHT = 5
/** Whether the active board's Fn functions are known (only for the Fighting68 so far). */
export let HAS_FN_LAYER = true

export function setLayout(keys: KeyDef[]) {
  KEYS = keys
  KEY_BY_ID = new Map(keys.map((k) => [k.id, k]))
  KEY_IDS = keys.map((k) => k.id)
  LAYOUT_WIDTH = Math.max(...keys.map((k) => k.x + k.w))
  LAYOUT_HEIGHT = Math.max(...keys.map((k) => k.y + (k.h ?? 1)))
  HAS_FN_LAYER = keys.some((k) => k.fn)
}
setLayout(FIGHTING68_KEYS)

/** The Fn key gives access to the firmware's Fn layer, so it is never remapped. */
export function isFnKey(k: KeyDef | undefined) {
  return !!k && /^fnd?$/i.test(k.label.trim())
}

export function keyByHid(hid: number) {
  return KEYS.find((k) => k.hid === hid)
}
