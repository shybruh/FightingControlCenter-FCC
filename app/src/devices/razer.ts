// Razer keyboards FCC knows. Each key has an on-screen position (key units), its HID usage and its place in the
// keyboard's 6 x 22 LED matrix (row, column), which is where per-key colours are sent.

import type { KeyDef } from '../data/layout'

export interface RazerInfo {
  rows: number
  cols: number
  /** FCC key id -> [matrix row, matrix column] */
  matrix: Record<number, [number, number]>
  /** polling rates the board offers, in Hz */
  pollingRates: number[]
}

export interface RazerModel {
  id: string
  name: string
  productId: number
  keys: KeyDef[]
  razer: RazerInfo
}

export const RAZER_VENDOR_ID = 0x1532

/** One key: label, HID usage, matrix column, width, x (when it doesn't follow the previous key), height. */
type K = [label: string, hid: number, col: number, w?: number, x?: number, h?: number]

/** Full-size ANSI with four media keys above the numpad (Huntsman V2). Rows are matrix rows. */
const FULL_SIZE: { y: number; keys: K[] }[] = [
  {
    y: 0,
    keys: [
      ['Esc', 0x29, 0], ['F1', 0x3a, 2, 1, 2], ['F2', 0x3b, 3], ['F3', 0x3c, 4], ['F4', 0x3d, 5],
      ['F5', 0x3e, 6, 1, 6.5], ['F6', 0x3f, 7], ['F7', 0x40, 8], ['F8', 0x41, 9],
      ['F9', 0x42, 10, 1, 11], ['F10', 0x43, 11], ['F11', 0x44, 12], ['F12', 0x45, 13],
      ['PrtSc', 0x46, 14, 1, 15.25], ['ScrLk', 0x47, 15], ['Pause', 0x48, 16],
      ['⏮', 0, 17, 1, 18.5], ['⏯', 0, 18], ['⏭', 0, 19], ['🔇', 0, 20],
    ],
  },
  {
    y: 1.25,
    keys: [
      ['`', 0x35, 0], ['1', 0x1e, 1], ['2', 0x1f, 2], ['3', 0x20, 3], ['4', 0x21, 4], ['5', 0x22, 5], ['6', 0x23, 6],
      ['7', 0x24, 7], ['8', 0x25, 8], ['9', 0x26, 9], ['0', 0x27, 10], ['-', 0x2d, 11], ['=', 0x2e, 12], ['Backspace', 0x2a, 13, 2],
      ['Ins', 0x49, 14, 1, 15.25], ['Home', 0x4a, 15], ['PgUp', 0x4b, 16],
      ['Num', 0x53, 17, 1, 18.5], ['/', 0x54, 18], ['*', 0x55, 19], ['-', 0x56, 20],
    ],
  },
  {
    y: 2.25,
    keys: [
      ['Tab', 0x2b, 0, 1.5], ['Q', 0x14, 1], ['W', 0x1a, 2], ['E', 0x08, 3], ['R', 0x15, 4], ['T', 0x17, 5], ['Y', 0x1c, 6],
      ['U', 0x18, 7], ['I', 0x0c, 8], ['O', 0x12, 9], ['P', 0x13, 10], ['[', 0x2f, 11], [']', 0x30, 12], ['\\', 0x31, 13, 1.5],
      ['Del', 0x4c, 14, 1, 15.25], ['End', 0x4d, 15], ['PgDn', 0x4e, 16],
      ['7', 0x5f, 17, 1, 18.5], ['8', 0x60, 18], ['9', 0x61, 19], ['+', 0x57, 20, 1, undefined, 2],
    ],
  },
  {
    y: 3.25,
    keys: [
      ['Caps', 0x39, 0, 1.75], ['A', 0x04, 1], ['S', 0x16, 2], ['D', 0x07, 3], ['F', 0x09, 4], ['G', 0x0a, 5], ['H', 0x0b, 6],
      ['J', 0x0d, 7], ['K', 0x0e, 8], ['L', 0x0f, 9], [';', 0x33, 10], ["'", 0x34, 11], ['Enter', 0x28, 13, 2.25],
      ['4', 0x5c, 17, 1, 18.5], ['5', 0x5d, 18], ['6', 0x5e, 19],
    ],
  },
  {
    y: 4.25,
    keys: [
      ['Shift', 0xe1, 0, 2.25], ['Z', 0x1d, 2], ['X', 0x1b, 3], ['C', 0x06, 4], ['V', 0x19, 5], ['B', 0x05, 6], ['N', 0x11, 7],
      ['M', 0x10, 8], [',', 0x36, 9], ['.', 0x37, 10], ['/', 0x38, 11], ['Shift', 0xe5, 13, 2.75],
      ['↑', 0x52, 15, 1, 16.25],
      ['1', 0x59, 17, 1, 18.5], ['2', 0x5a, 18], ['3', 0x5b, 19], ['Enter', 0x58, 20, 1, undefined, 2],
    ],
  },
  {
    y: 5.25,
    keys: [
      ['Ctrl', 0xe0, 0, 1.25], ['Win', 0xe3, 1, 1.25], ['Alt', 0xe2, 2, 1.25], ['Space', 0x2c, 6, 6.25],
      ['Alt', 0xe6, 10, 1.25], ['Fn', 0, 11, 1.25], ['Menu', 0x65, 12, 1.25], ['Ctrl', 0xe4, 13, 1.25],
      ['←', 0x50, 14, 1, 15.25], ['↓', 0x51, 15], ['→', 0x4f, 16],
      ['0', 0x62, 18, 2, 18.5], ['.', 0x63, 19],
    ],
  },
]

function build(rows: typeof FULL_SIZE) {
  const keys: KeyDef[] = []
  const matrix: Record<number, [number, number]> = {}
  rows.forEach(({ y, keys: row }, matrixRow) => {
    let x = 0
    for (const [label, hid, col, w = 1, at, h] of row) {
      if (at !== undefined) x = at
      const id = keys.length
      keys.push({ id, label, hid, x, y, w, ...(h ? { h } : {}) })
      matrix[id] = [matrixRow, col]
      x += w
    }
  })
  return { keys, matrix }
}

const fullSize = build(FULL_SIZE)

export const RAZER_MODELS: RazerModel[] = [
  {
    id: 'razer-huntsman-v2',
    name: 'Razer Huntsman V2',
    productId: 0x026c,
    keys: fullSize.keys,
    razer: { rows: 6, cols: 22, matrix: fullSize.matrix, pollingRates: [125, 250, 500, 1000, 2000, 4000, 8000] },
  },
]
