// Typed views over raw region bytes. Encoders always start from the current bytes
// so fields we don't understand are preserved untouched.

import { hidName, mediaName, modifierNames } from '../data/keycodes'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const setU16 = (b: Uint8Array, o: number, v: number) => {
  b[o] = v & 0xff
  b[o + 1] = (v >> 8) & 0xff
}

// ---------- Key bindings (4 bytes / key) ----------

export type Binding =
  | { type: 'default' }
  | { type: 'key'; mods: number; code: number }
  | { type: 'media'; usage: number }
  | { type: 'mouse'; button: number }
  | { type: 'wheel'; dir: 1 | 255 }
  | { type: 'macro'; index: number; mode: 0 | 1 | 2; repeat: number }
  | { type: 'dks'; slot: number }
  | { type: 'modtap'; hold: number; tap: number; ms: number }
  | { type: 'toggle'; code: number }
  | { type: 'socd'; mode: number; key1: number; key2: number }
  | { type: 'rs'; key1: number; key2: number }
  | { type: 'unknown'; bytes: number[] }

export function decodeBinding(keys: Uint8Array, id: number): Binding {
  const [t, a, b, c] = keys.subarray(id * 4, id * 4 + 4)
  switch (t) {
    case 0:
      return { type: 'default' }
    case 1:
      return a === 3 ? { type: 'wheel', dir: b === 255 ? 255 : 1 } : { type: 'mouse', button: b }
    case 2:
      return { type: 'key', mods: a, code: b }
    case 3:
      return { type: 'media', usage: a | (b << 8) }
    case 6:
      return { type: 'macro', index: a, mode: (b as 0 | 1 | 2) ?? 0, repeat: c }
    case 8:
      return { type: 'dks', slot: a }
    case 9:
      return { type: 'modtap', hold: a, tap: b, ms: c * 10 }
    case 10:
      return { type: 'toggle', code: a }
    case 11:
      return { type: 'socd', mode: a, key1: b, key2: c }
    case 12:
      return { type: 'rs', key1: b, key2: c }
    default:
      return { type: 'unknown', bytes: [t, a, b, c] }
  }
}

export function encodeBinding(b: Binding): [number, number, number, number] {
  switch (b.type) {
    case 'default':
      return [0, 0, 0, 0]
    case 'key':
      return [2, b.mods & 0xff, b.code & 0xff, 0]
    case 'media':
      return [3, b.usage & 0xff, (b.usage >> 8) & 0xff, 0]
    case 'mouse':
      return [1, 1, b.button & 0xff, 0]
    case 'wheel':
      return [1, 3, b.dir, 0]
    case 'macro':
      return [6, b.index & 0xff, b.mode, b.mode === 1 ? clamp(b.repeat, 1, 255) : 0]
    case 'dks':
      return [8, b.slot & 0xff, 0, 0]
    case 'modtap':
      return [9, b.hold & 0xff, b.tap & 0xff, clamp(b.ms / 10, 1, 255)]
    case 'toggle':
      return [10, b.code & 0xff, 0, 0]
    case 'socd':
      return [11, b.mode & 0xff, b.key1 & 0xff, b.key2 & 0xff]
    case 'rs':
      return [12, 0, b.key1 & 0xff, b.key2 & 0xff]
    case 'unknown':
      return b.bytes as [number, number, number, number]
  }
}

export function withBinding(keys: Uint8Array, ids: number[], b: Binding): Uint8Array {
  const out = keys.slice()
  const bytes = encodeBinding(b)
  ids.forEach((id) => out.set(bytes, id * 4))
  return out
}

export function bindingLabel(b: Binding): string | null {
  switch (b.type) {
    case 'default':
      return null
    case 'key': {
      const mods = modifierNames(b.mods)
      const main = b.code ? hidName(b.code) : ''
      return [...mods, main].filter(Boolean).join('+') || 'None'
    }
    case 'media':
      return mediaName(b.usage)
    case 'mouse':
      return { 1: 'LMB', 2: 'RMB', 4: 'MMB', 8: 'M4', 16: 'M5' }[b.button] ?? `Mouse ${b.button}`
    case 'wheel':
      return b.dir === 1 ? 'Wheel ↑' : 'Wheel ↓'
    case 'macro':
      return `M${b.index + 1}`
    case 'dks':
      return 'DKS'
    case 'modtap':
      return `MT ${hidName(b.hold)}/${hidName(b.tap)}`
    case 'toggle':
      return `TGL ${hidName(b.code)}`
    case 'socd':
      return 'SOCD'
    case 'rs':
      return 'RS'
    case 'unknown':
      return '?'
  }
}

// ---------- Rapid trigger (8 bytes / key) ----------

/** Switch limits of the active board, in 0.01 mm (from the vendor table). */
export interface RtLimits {
  /** full key travel */
  travel: number
  actuationMin: number
  actuationMax: number
  actuationDefault: number
  sensMin: number
  sensMax: number
  sensDefault: number
}

/** Live binding: replaced with the connected board's limits by setRtLimits(). Fighting68 by default. */
export let RT_LIMITS: RtLimits = {
  travel: 330,
  actuationMin: 10,
  actuationMax: 330,
  actuationDefault: 120,
  sensMin: 8,
  sensMax: 240,
  sensDefault: 16,
}

export function setRtLimits(l: RtLimits) {
  RT_LIMITS = l
  DKS_POINT_MAX = Math.round(l.travel / 10)
}

export interface KeyRT {
  switchType: number
  /** bit0 continuous (full-travel) RT, bit1 bottom optimisation, bit2 rampage */
  flags: number
  actuation: number
  press: number
  release: number
}

export const RT_FLAG = { continuous: 1, bottom: 2, rampage: 4 } as const

export function decodeRT(rt: Uint8Array, id: number): KeyRT {
  const o = id * 8
  return {
    switchType: rt[o],
    flags: rt[o + 1],
    actuation: u16(rt, o + 2),
    press: u16(rt, o + 4),
    release: u16(rt, o + 6),
  }
}

export function rtEnabled(k: KeyRT) {
  return k.press > 0 && k.release > 0
}

export function withRT(rt: Uint8Array, ids: number[], patch: Partial<KeyRT>): Uint8Array {
  const out = rt.slice()
  const L = RT_LIMITS
  for (const id of ids) {
    const o = id * 8
    const k = { ...decodeRT(out, id), ...patch }
    out[o] = k.switchType & 0xff
    out[o + 1] = k.flags & 0x07
    setU16(out, o + 2, clamp(k.actuation || L.actuationDefault, L.actuationMin, L.actuationMax))
    setU16(out, o + 4, k.press === 0 ? 0 : clamp(k.press, L.sensMin, L.sensMax))
    setU16(out, o + 6, k.release === 0 ? 0 : clamp(k.release, L.sensMin, L.sensMax))
  }
  return out
}

// ---------- LED (16 bytes) ----------

export interface EffectDef {
  id: number
  name: string
  color: boolean
  speed: boolean
  direction: boolean
  /** Fighting68 effect id used to approximate this effect in the on-screen preview (other boards' modes) */
  preview?: number
}

/** Effect id of the Fighting68's custom per-key mode; the preview always uses this id for per-key colours. */
export const SONIX_CUSTOM = 0x80

export const SONIX_EFFECTS: EffectDef[] = [
  { id: 0x01, name: 'Static', color: true, speed: false, direction: false },
  { id: 0x07, name: 'Breathing', color: true, speed: true, direction: false },
  { id: 0x08, name: 'Spectrum cycle', color: false, speed: true, direction: false },
  { id: 0x06, name: 'Bloom', color: false, speed: true, direction: false },
  { id: 0x0b, name: 'Wave', color: true, speed: true, direction: true },
  { id: 0x10, name: 'Endless flow', color: true, speed: true, direction: true },
  { id: 0x0a, name: 'Crosslines', color: true, speed: true, direction: true },
  { id: 0x0c, name: 'Winding peaks', color: true, speed: true, direction: true },
  { id: 0x12, name: 'Slanted rain', color: true, speed: true, direction: true },
  { id: 0x09, name: 'Fountain', color: true, speed: true, direction: false },
  { id: 0x11, name: 'Layered ridges', color: true, speed: true, direction: false },
  { id: 0x13, name: 'Back & forth', color: true, speed: true, direction: false },
  { id: 0x04, name: 'Starry sky', color: true, speed: true, direction: false },
  { id: 0x05, name: 'Snowfall', color: true, speed: true, direction: false },
  { id: 0x02, name: 'Reactive on', color: true, speed: true, direction: false },
  { id: 0x03, name: 'Reactive off', color: true, speed: true, direction: false },
  { id: 0x0d, name: 'Reactive burst', color: true, speed: true, direction: false },
  { id: 0x0e, name: 'Reactive cross', color: true, speed: true, direction: false },
  { id: 0x0f, name: 'Ripple', color: true, speed: true, direction: false },
  { id: 0x80, name: 'Custom per-key', color: false, speed: false, direction: false },
]

/** Live bindings: the active board's effect list and its per-key mode (set via setEffects). */
export let EFFECTS: EffectDef[] = SONIX_EFFECTS
export let CUSTOM_EFFECT = SONIX_CUSTOM

export function setEffects(list: EffectDef[], customId: number) {
  EFFECTS = list
  CUSTOM_EFFECT = customId
}

export interface Led {
  effect: number
  r: number
  g: number
  b: number
  rainbow: boolean
  brightness: number
  speed: number
  direction: number
}

export function decodeLed(led: Uint8Array): Led {
  return {
    effect: led[0],
    r: led[1],
    g: led[2],
    b: led[3],
    rainbow: led[8] === 1,
    brightness: led[9],
    speed: led[10],
    direction: led[11],
  }
}

export function encodeLed(prev: Uint8Array, l: Led): Uint8Array {
  const out = prev.slice()
  out[0] = l.effect & 0xff
  out[1] = clamp(l.r, 0, 255)
  out[2] = clamp(l.g, 0, 255)
  out[3] = clamp(l.b, 0, 255)
  out[4] = 255
  out[8] = l.rainbow ? 1 : 0
  out[9] = clamp(l.brightness, 1, 5)
  out[10] = clamp(l.speed, 1, 5)
  out[11] = l.direction ? 1 : 0
  out[14] = 0xaa
  out[15] = 0x55
  return out
}

// ---------- Per-key colors (4 bytes / key: index, r, g, b) ----------

export function decodeColor(colors: Uint8Array, id: number): [number, number, number] {
  const o = id * 4
  return [colors[o + 1], colors[o + 2], colors[o + 3]]
}

export function withColor(colors: Uint8Array, ids: number[], rgb: [number, number, number]): Uint8Array {
  const out = colors.slice()
  for (const id of ids) {
    if (id >= 126) continue
    out.set([id, ...rgb.map((v) => clamp(v, 0, 255))], id * 4)
  }
  return out
}

/** Different colour per key in one go. */
export function withColorMap(colors: Uint8Array, map: Map<number, [number, number, number]>): Uint8Array {
  const out = colors.slice()
  for (const [id, rgb] of map) {
    if (id >= 126) continue
    out.set([id, ...rgb.map((v) => clamp(v, 0, 255))], id * 4)
  }
  return out
}

// ---------- Keyboard settings ----------

export const POLLING_RATES = [
  { value: 3, label: '1000 Hz' },
  { value: 5, label: '4000 Hz' },
  { value: 6, label: '8000 Hz' },
]

export interface Settings {
  sleepMinutes: number
  polling: number
  stability: boolean
  adaptiveCalibration: boolean
  allKeyWake: boolean
}

export function decodeSettings(s: Uint8Array): Settings {
  return {
    sleepMinutes: s[3],
    polling: s[5],
    stability: s[11] === 1,
    adaptiveCalibration: s[14] === 1,
    allKeyWake: s[15] === 1,
  }
}

export function encodeSettings(prev: Uint8Array, v: Settings): Uint8Array {
  const out = prev.slice()
  out[3] = clamp(v.sleepMinutes, 0, 30)
  if (POLLING_RATES.some((p) => p.value === v.polling)) out[5] = v.polling
  out[11] = v.stability ? 1 : 0
  out[14] = v.adaptiveCalibration ? 1 : 0
  out[15] = v.allKeyWake ? 1 : 0
  return out
}

// ---------- Device info ----------

export interface DeviceInfo {
  firmware: string
  macroCapacity: number
  battery: number
  vid: number
  pid: number
}

export function decodeInfo(i: Uint8Array): DeviceInfo {
  const v = (i[8] & 0x0f) + 10 * ((i[8] & 0xf0) >> 4) + 100 * i[9]
  return {
    firmware: (v / 100).toFixed(2),
    macroCapacity: i[2] + ((i[3] & 0x7f) << 8),
    battery: i[17],
    vid: u16(i, 4),
    pid: u16(i, 6),
  }
}

// ---------- DKS (16 bytes / slot, slot 0 unused) ----------

export type DksAction = 'none' | 'tap' | 'hold'

export interface DksSlot {
  /** trigger points in 0.1 mm: [press start, bottom, lift from bottom, full release] */
  points: [number, number, number, number]
  /** HID usage per bound key (0 = empty) */
  keys: [number, number, number, number]
  /** actions[key][stage]; 'hold' keeps the key down from this stage until the next one */
  actions: DksAction[][]
}

export const DKS_SLOTS = 64
export const DKS_POINT_MIN = 1
/** in 0.1 mm; follows the active board's travel */
export let DKS_POINT_MAX = 33
export const DKS_DEFAULT_POINTS: DksSlot['points'] = [16, 30, 30, 16]

export function dksSlotUsed(dks: Uint8Array, slot: number) {
  const o = slot * 16
  return dks[o] !== 0 || dks[o + 1] !== 0 || dks[o + 2] !== 0 || dks[o + 3] !== 0
}

export function decodeDks(dks: Uint8Array, slot: number): DksSlot {
  const o = slot * 16
  const actions = [0, 1, 2, 3].map((m) =>
    [0, 1, 2, 3].map((j): DksAction => {
      const b = dks[o + 12 + j]
      return b & (1 << (m + 4)) ? 'hold' : b & (1 << m) ? 'tap' : 'none'
    }),
  )
  return {
    points: [dks[o], dks[o + 1], dks[o + 2], dks[o + 3]],
    keys: [dks[o + 5], dks[o + 7], dks[o + 9], dks[o + 11]],
    actions,
  }
}

export function withDks(dks: Uint8Array, slot: number, s: DksSlot | null): Uint8Array {
  const out = dks.slice()
  const o = slot * 16
  out.fill(0, o, o + 16)
  if (!s) return out
  s.points.forEach((p, i) => (out[o + i] = clamp(p, DKS_POINT_MIN, DKS_POINT_MAX)))
  s.keys.forEach((k, i) => (out[o + 5 + i * 2] = k & 0xff))
  s.actions.forEach((row, m) =>
    row.forEach((a, j) => {
      if (!s.keys[m]) return
      // the last stage can only tap — there is no "next stage" to release on
      if (a === 'hold' && j < 3) out[o + 12 + j] |= 1 << (m + 4)
      else if (a !== 'none') out[o + 12 + j] |= 1 << m
    }),
  )
  return out
}

export function freeDksSlot(dks: Uint8Array): number | null {
  for (let s = 1; s < DKS_SLOTS; s++) if (!dksSlotUsed(dks, s)) return s
  return null
}

// ---------- Macros ----------

export const MACRO_REGION = 4008
export const MACRO_INDEX_BYTES = 400
export const MACRO_MAX = 100

export interface MacroEvent {
  /** HID usage for keys, button mask (1 L, 2 R, 4 M) for mouse */
  code: number
  down: boolean
  mouse: boolean
  /** delay after this event, ms */
  delay: number
}

export function decodeMacros(buf: Uint8Array): MacroEvent[][] {
  const out: MacroEvent[][] = []
  for (let i = 0; i < MACRO_MAX; i++) {
    const p = i * 4
    const addr = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16) | (buf[p + 3] << 24)
    if (!addr) break
    if (addr + 4 > buf.length) break
    const count = (buf[addr] | (buf[addr + 1] << 8)) / 2
    const events: MacroEvent[] = []
    for (let r = 0; r < count; r++) {
      const o = addr + 4 + r * 4
      if (o + 4 > buf.length) break
      const flags = buf[o + 3]
      events.push({
        delay: buf[o] | (buf[o + 1] << 8),
        code: buf[o + 2],
        down: !!(flags & 0x80),
        mouse: !(flags & 0x20),
      })
    }
    out.push(events)
  }
  return out
}

export function macroBytes(macros: MacroEvent[][]): number {
  return MACRO_INDEX_BYTES + macros.reduce((n, m) => n + 4 + m.length * 4, 0)
}

/** Throws if the macros don't fit in device memory. */
export function encodeMacros(macros: MacroEvent[][], capacity = MACRO_REGION): Uint8Array {
  const limit = Math.min(capacity, MACRO_REGION)
  if (macros.length > MACRO_MAX) throw new Error(`At most ${MACRO_MAX} macros`)
  if (macroBytes(macros) > limit) throw new Error('Not enough macro memory on the keyboard')
  const out = new Uint8Array(MACRO_REGION)
  let addr = MACRO_INDEX_BYTES
  macros.forEach((events, i) => {
    out.set([addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff, (addr >> 24) & 0xff], i * 4)
    setU16(out, addr, events.length * 2)
    events.forEach((e, r) => {
      const o = addr + 4 + r * 4
      setU16(out, o, clamp(e.delay, 0, 65535))
      out[o + 2] = e.code & 0xff
      out[o + 3] = (e.down ? 0x80 : 0) | (e.mouse ? 0x10 : 0x30)
    })
    addr += 4 + events.length * 4
  })
  return out
}

/** After deleting/moving macros, fix the macro indices stored in key bindings. */
export function remapMacroBindings(keys: Uint8Array, map: (index: number) => number | null): Uint8Array {
  const out = keys.slice()
  for (let id = 0; id < 128; id++) {
    const o = id * 4
    if (out[o] !== 6) continue
    const next = map(out[o + 1])
    if (next === null) out.fill(0, o, o + 4)
    else out[o + 1] = next
  }
  return out
}
