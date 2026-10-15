// Sinowealth "010c" keyboards (USB id 258a:010c, shared by several brands). They all answer the same model request,
// and only models listed here are driven: the USB id alone doesn't say which board it is. Per-key colours go by LED
// index (column × 6 + row on the F99). Model ids and LED positions are the facts OpenRGB's Sinowealth 010c driver
// lists; the on-screen geometry is FCC's own.

export const SINOWEALTH_VENDOR_ID = 0x258a
export const SINOWEALTH_010C_PID = 0x010c

export interface SinowealthInfo {
  /** USB interface the board takes lighting on */
  iface: number
  /** the model id the board answers with (byte 13 of the model request) */
  model: number
}

/** [HID usage (0: Fn), LED index, x, y, width, height] */
export type SinowealthKey = [hid: number, led: number, x: number, y: number, w: number, h: number]

export interface SinowealthModel {
  id: string
  name: string
  productId: number
  keys: SinowealthKey[]
  sinowealth: SinowealthInfo
}

const ROW = [0, 1.25, 2.25, 3.25, 4.25, 5.25]

/** A row of 1-unit keys from `x`: [hid, led] each. */
const run = (row: number, x: number, keys: [number, number][]): SinowealthKey[] => keys.map(([hid, led], i) => [hid, led, x + i, ROW[row], 1, 1])
const key = (row: number, x: number, hid: number, led: number, w = 1, h = 1): SinowealthKey => [hid, led, x, ROW[row], w, h]

/** AULA F99: 96% (99 keys), numpad on the right, Del / Home / End / PgUp / PgDn on the function row. */
const AULA_F99: SinowealthKey[] = [
  // Esc, F1–F12, Del, Home, End, PgUp, PgDn
  key(0, 0, 0x29, 0),
  ...run(0, 1.25, [[0x3a, 6], [0x3b, 12], [0x3c, 18], [0x3d, 24]]),
  ...run(0, 5.5, [[0x3e, 30], [0x3f, 36], [0x40, 42], [0x41, 48]]),
  ...run(0, 9.75, [[0x42, 54], [0x43, 60], [0x44, 66], [0x45, 72]]),
  ...run(0, 14.25, [[0x4c, 78], [0x4a, 90], [0x4d, 96], [0x4b, 102], [0x4e, 108]]),
  // ` 1–0 - = Backspace, Num Lock / * -
  ...run(1, 0, [[0x35, 1], [0x1e, 7], [0x1f, 13], [0x20, 19], [0x21, 25], [0x22, 31], [0x23, 37], [0x24, 43], [0x25, 49], [0x26, 55], [0x27, 61], [0x2d, 67], [0x2e, 73]]),
  key(1, 13, 0x2a, 79, 2),
  ...run(1, 15.25, [[0x53, 91], [0x54, 97], [0x55, 103], [0x56, 109]]),
  // Tab Q–] \, 7 8 9 +
  key(2, 0, 0x2b, 2, 1.5),
  ...run(2, 1.5, [[0x14, 8], [0x1a, 14], [0x08, 20], [0x15, 26], [0x17, 32], [0x1c, 38], [0x18, 44], [0x0c, 50], [0x12, 56], [0x13, 62], [0x2f, 68], [0x30, 74]]),
  key(2, 13.5, 0x31, 80, 1.5),
  ...run(2, 15.25, [[0x5f, 92], [0x60, 98], [0x61, 104]]),
  key(2, 18.25, 0x57, 110, 1, 2),
  // Caps A–' Enter, 4 5 6
  key(3, 0, 0x39, 3, 1.75),
  ...run(3, 1.75, [[0x04, 9], [0x16, 15], [0x07, 21], [0x09, 27], [0x0a, 33], [0x0b, 39], [0x0d, 45], [0x0e, 51], [0x0f, 57], [0x33, 63], [0x34, 69]]),
  key(3, 12.75, 0x28, 81, 2.25),
  ...run(3, 15.25, [[0x5c, 93], [0x5d, 99], [0x5e, 105]]),
  // Shift Z–/ Shift, Up, 1 2 3 Enter
  key(4, 0, 0xe1, 4, 2.25),
  ...run(4, 2.25, [[0x1d, 10], [0x1b, 16], [0x06, 22], [0x19, 28], [0x05, 34], [0x11, 40], [0x10, 46], [0x36, 52], [0x37, 58], [0x38, 64]]),
  key(4, 12.25, 0xe5, 82, 1.75),
  key(4, 14.25, 0x52, 88),
  ...run(4, 15.25, [[0x59, 94], [0x5a, 100], [0x5b, 106]]),
  key(4, 18.25, 0x58, 112, 1, 2),
  // Ctrl Win Alt Space Alt Fn Ctrl, arrows, 0 .
  key(5, 0, 0xe0, 5, 1.25),
  key(5, 1.25, 0xe3, 11, 1.25),
  key(5, 2.5, 0xe2, 17, 1.25),
  key(5, 3.75, 0x2c, 35, 6.25),
  ...run(5, 10, [[0xe6, 53], [0x00, 59], [0xe4, 65]]),
  ...run(5, 13.25, [[0x50, 83], [0x51, 89], [0x4f, 95]]),
  ...run(5, 16.25, [[0x62, 101], [0x63, 107]]),
]

export const SINOWEALTH_MODELS: SinowealthModel[] = [
  { id: 'aula-f99', name: 'AULA F99', productId: SINOWEALTH_010C_PID, keys: AULA_F99, sinowealth: { iface: 1, model: 0xa4 } },
]
