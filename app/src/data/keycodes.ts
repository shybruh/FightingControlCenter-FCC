// HID usage tables for the remap picker.

export interface KeyOption {
  label: string
  value: number
}

export interface KeyGroup {
  name: string
  kind: 'key' | 'modifier' | 'media' | 'mouse' | 'wheel'
  keys: KeyOption[]
}

const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c, i) => ({ label: c, value: 0x04 + i }))
const digits = '1234567890'.split('').map((c, i) => ({ label: c, value: 0x1e + i }))
const fkeys = Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 1}`, value: 0x3a + i }))
const fkeysHigh = Array.from({ length: 12 }, (_, i) => ({ label: `F${i + 13}`, value: 0x68 + i }))

export const KEY_GROUPS: KeyGroup[] = [
  { name: 'Letters', kind: 'key', keys: letters },
  { name: 'Numbers', kind: 'key', keys: digits },
  {
    name: 'Symbols',
    kind: 'key',
    keys: [
      { label: '-', value: 0x2d },
      { label: '=', value: 0x2e },
      { label: '[', value: 0x2f },
      { label: ']', value: 0x30 },
      { label: '\\', value: 0x31 },
      { label: ';', value: 0x33 },
      { label: "'", value: 0x34 },
      { label: '`', value: 0x35 },
      { label: ',', value: 0x36 },
      { label: '.', value: 0x37 },
      { label: '/', value: 0x38 },
      { label: 'ISO \\', value: 0x64 },
    ],
  },
  {
    name: 'Editing',
    kind: 'key',
    keys: [
      { label: 'Esc', value: 0x29 },
      { label: 'Tab', value: 0x2b },
      { label: 'Caps', value: 0x39 },
      { label: 'Enter', value: 0x28 },
      { label: 'Bksp', value: 0x2a },
      { label: 'Space', value: 0x2c },
      { label: 'Ins', value: 0x49 },
      { label: 'Del', value: 0x4c },
      { label: 'Home', value: 0x4a },
      { label: 'End', value: 0x4d },
      { label: 'PgUp', value: 0x4b },
      { label: 'PgDn', value: 0x4e },
      { label: '↑', value: 0x52 },
      { label: '↓', value: 0x51 },
      { label: '←', value: 0x50 },
      { label: '→', value: 0x4f },
      { label: 'PrtSc', value: 0x46 },
      { label: 'ScrLk', value: 0x47 },
      { label: 'Pause', value: 0x48 },
      { label: 'Menu', value: 0x65 },
    ],
  },
  { name: 'Function', kind: 'key', keys: [...fkeys, ...fkeysHigh] },
  {
    name: 'Numpad',
    kind: 'key',
    keys: [
      { label: 'NumLk', value: 0x53 },
      { label: 'N/', value: 0x54 },
      { label: 'N*', value: 0x55 },
      { label: 'N-', value: 0x56 },
      { label: 'N+', value: 0x57 },
      { label: 'NEnter', value: 0x58 },
      ...Array.from({ length: 9 }, (_, i) => ({ label: `N${i + 1}`, value: 0x59 + i })),
      { label: 'N0', value: 0x62 },
      { label: 'N.', value: 0x63 },
    ],
  },
  {
    name: 'Modifiers',
    kind: 'modifier',
    keys: [
      { label: 'L-Ctrl', value: 0x01 },
      { label: 'L-Shift', value: 0x02 },
      { label: 'L-Alt', value: 0x04 },
      { label: 'L-Win', value: 0x08 },
      { label: 'R-Ctrl', value: 0x10 },
      { label: 'R-Shift', value: 0x20 },
      { label: 'R-Alt', value: 0x40 },
      { label: 'R-Win', value: 0x80 },
    ],
  },
  {
    name: 'Media',
    kind: 'media',
    keys: [
      { label: 'Play/Pause', value: 0xcd },
      { label: 'Stop', value: 0xb7 },
      { label: 'Prev', value: 0xb6 },
      { label: 'Next', value: 0xb5 },
      { label: 'Vol +', value: 0xe9 },
      { label: 'Vol −', value: 0xea },
      { label: 'Mute', value: 0xe2 },
      { label: 'Media', value: 0x183 },
      { label: 'Mail', value: 0x18a },
      { label: 'Calc', value: 0x192 },
      { label: 'My PC', value: 0x194 },
      { label: 'Search', value: 0x221 },
      { label: 'Web Home', value: 0x223 },
      { label: 'Web Back', value: 0x224 },
      { label: 'Web Fwd', value: 0x225 },
      { label: 'Refresh', value: 0x227 },
      { label: 'Favorites', value: 0x22a },
    ],
  },
  {
    name: 'Mouse',
    kind: 'mouse',
    keys: [
      { label: 'Left click', value: 1 },
      { label: 'Right click', value: 2 },
      { label: 'Middle click', value: 4 },
      { label: 'Back', value: 8 },
      { label: 'Forward', value: 16 },
    ],
  },
  {
    name: 'Wheel',
    kind: 'wheel',
    keys: [
      { label: 'Wheel up', value: 1 },
      { label: 'Wheel down', value: 255 },
    ],
  },
]

const HID_NAMES = new Map<number, string>()
const MEDIA_NAMES = new Map<number, string>()
for (const g of KEY_GROUPS) {
  if (g.kind === 'key') g.keys.forEach((k) => HID_NAMES.set(k.value, k.label))
  if (g.kind === 'media') g.keys.forEach((k) => MEDIA_NAMES.set(k.value, k.label))
}
const MODIFIER_HID: Record<number, string> = {
  0xe0: 'L-Ctrl', 0xe1: 'L-Shift', 0xe2: 'L-Alt', 0xe3: 'L-Win',
  0xe4: 'R-Ctrl', 0xe5: 'R-Shift', 0xe6: 'R-Alt', 0xe7: 'R-Win',
}

export function hidName(code: number): string {
  return HID_NAMES.get(code) ?? MODIFIER_HID[code] ?? `0x${code.toString(16).padStart(2, '0')}`
}

export function mediaName(code: number): string {
  return MEDIA_NAMES.get(code) ?? `Media 0x${code.toString(16)}`
}

const MOD_SHORT = ['Ctrl', 'Shift', 'Alt', 'Win', 'RCtrl', 'RShift', 'RAlt', 'RWin']
export function modifierNames(mask: number): string[] {
  return MOD_SHORT.filter((_, i) => mask & (1 << i))
}

/** Single-usage picker groups (modifiers as 0xE0–0xE7) for advanced keys and macros. */
export const HID_GROUPS: KeyGroup[] = [
  ...KEY_GROUPS.filter((g) => g.kind === 'key'),
  {
    name: 'Modifiers',
    kind: 'key',
    keys: Object.entries(MODIFIER_HID).map(([v, label]) => ({ label, value: Number(v) })),
  },
]

const CODE_TO_HID: Record<string, number> = {
  Escape: 0x29, Tab: 0x2b, CapsLock: 0x39, Enter: 0x28, Backspace: 0x2a, Space: 0x2c,
  Insert: 0x49, Delete: 0x4c, Home: 0x4a, End: 0x4d, PageUp: 0x4b, PageDown: 0x4e,
  ArrowUp: 0x52, ArrowDown: 0x51, ArrowLeft: 0x50, ArrowRight: 0x4f,
  PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48, ContextMenu: 0x65,
  Minus: 0x2d, Equal: 0x2e, BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31,
  Semicolon: 0x33, Quote: 0x34, Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38, IntlBackslash: 0x64,
  NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57,
  NumpadEnter: 0x58, NumpadDecimal: 0x63, Numpad0: 0x62,
  ControlLeft: 0xe0, ShiftLeft: 0xe1, AltLeft: 0xe2, MetaLeft: 0xe3,
  ControlRight: 0xe4, ShiftRight: 0xe5, AltRight: 0xe6, MetaRight: 0xe7,
}
for (let i = 0; i < 26; i++) CODE_TO_HID[`Key${String.fromCharCode(65 + i)}`] = 0x04 + i
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Digit${i}`] = 0x1d + i
CODE_TO_HID.Digit0 = 0x27
for (let i = 1; i <= 9; i++) CODE_TO_HID[`Numpad${i}`] = 0x58 + i
for (let i = 1; i <= 24; i++) CODE_TO_HID[`F${i}`] = i <= 12 ? 0x39 + i : 0x5b + i

export function hidFromCode(code: string): number | null {
  return CODE_TO_HID[code] ?? null
}
