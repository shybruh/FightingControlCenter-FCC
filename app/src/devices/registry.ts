// Device registry.
// - Sonix HE boards: every keyboard the official VTER/driveall driver knows (catalog.json). Only the Fighting68 is
//   verified; other wired boards share its protocol and are "untested"; wireless dongles are not supported yet.
// - Royal Kludge "legacy" boards (Sinowealth, VID 0x258a; rk-catalog.json): a different, write-only protocol with
//   keymap and lighting only. Untested.

import { hidFromCode, hidName } from '../data/keycodes'
import { FIGHTING68_KEYS, setLayout, type KeyDef } from '../data/layout'
import { SONIX_CUSTOM, SONIX_EFFECTS, setEffects, setRtLimits, type EffectDef, type RtLimits } from '../hid/codec'
import catalog from './catalog.json'
import rkCatalog from './rk-catalog.json'

export type DeviceStatus = 'verified' | 'untested' | 'unsupported'

/** Which keyboard protocol a board speaks. */
export type Protocol = 'sonix' | 'rk'

/** What the app can do with a board; pages and controls follow these. */
export interface Capabilities {
  /** settings can be read back from the keyboard (backups, "keyboard is the source of truth") */
  readBack: boolean
  /** actuation, rapid trigger, live travel, calibration */
  performance: boolean
  advancedKeys: boolean
  macros: boolean
  /** polling rate, stability, wake, factory reset… */
  keyboardSettings: boolean
  /** the sleep timer travels in the lighting packet (RK) */
  sleepInLighting: boolean
  mouseBindings: boolean
  perKeyRgb: boolean
}

const SONIX_CAPS: Capabilities = {
  readBack: true,
  performance: true,
  advancedKeys: true,
  macros: true,
  keyboardSettings: true,
  sleepInLighting: false,
  mouseBindings: true,
  perKeyRgb: true,
}
const RK_CAPS: Capabilities = {
  readBack: false,
  performance: false,
  advancedKeys: false,
  macros: false,
  keyboardSettings: false,
  sleepInLighting: true,
  mouseBindings: false,
  perKeyRgb: true,
}

export interface RkMode {
  index: number
  name: string
  speed: boolean
  brightness: boolean
  direction: number
  random: boolean
  color: boolean
}

export interface RkInfo {
  modes: RkMode[]
  defaultMode: number
  defaultBrightness: number
  /** mode that shows per-key colours ("Customize") */
  customMode: number
  layers: number
}

export interface DeviceDef {
  id: string
  name: string
  vendorId: number
  productId: number
  layout: string
  fnLayout: string | null
  transport: 'wired' | 'dongle' | 'unknown'
  status: DeviceStatus
  limits: RtLimits
  protocol: Protocol
  caps: Capabilities
  rk?: RkInfo
}

// ---------- Sonix HE ----------

/** [id, label, sub, code, hid, x, y, w, h] */
type CatalogKey = [number, string, string, string, number, number, number, number, number]
type SonixEntry = Omit<DeviceDef, 'limits' | 'protocol' | 'caps' | 'rk'> & { limits: Omit<RtLimits, 'actuationMin' | 'actuationMax'> }

const data = catalog as unknown as { devices: SonixEntry[]; layouts: Record<string, CatalogKey[]> }

const SONIX_DEVICES: DeviceDef[] = data.devices.map((d) => ({
  ...d,
  limits: { ...d.limits, actuationMin: 10, actuationMax: d.limits.travel },
  protocol: 'sonix' as const,
  caps: SONIX_CAPS,
}))

// ---------- Royal Kludge (Sinowealth) ----------

/** [slot, hid, x, y, w, h] */
type RkKey = [number, number, number, number, number, number]
interface RkCatalogDevice {
  id: string
  name: string
  vendorId: number
  productId: number
  rgb: boolean
  layers: number
  keys: RkKey[]
  lighting: { modes: RkMode[]; defaultMode: number; defaultBrightness: number }
}
const RK_DATA = (rkCatalog as unknown as { devices: RkCatalogDevice[] }).devices
const RK_LAYOUTS = new Map(RK_DATA.map((d) => [d.id, d.keys]))

export const RK_DEVICES: DeviceDef[] = RK_DATA.map((d) => ({
  id: d.id,
  name: d.name,
  vendorId: d.vendorId,
  productId: d.productId,
  layout: `rk:${d.id}`,
  fnLayout: null,
  transport: 'wired' as const,
  status: 'untested' as const,
  // not a hall-effect board: travel limits are unused
  limits: { travel: 0, actuationMin: 0, actuationMax: 0, actuationDefault: 0, sensMin: 0, sensMax: 0, sensDefault: 0 },
  protocol: 'rk' as const,
  caps: { ...RK_CAPS, perKeyRgb: d.rgb },
  rk: {
    modes: d.lighting.modes,
    defaultMode: d.lighting.defaultMode,
    defaultBrightness: d.lighting.defaultBrightness,
    customMode: d.lighting.modes.find((m) => /custom/i.test(m.name))?.index ?? 0,
    layers: d.layers,
  },
}))

export const DEVICES: DeviceDef[] = [...SONIX_DEVICES, ...RK_DEVICES]

export const FIGHTING68 = DEVICES.find((d) => d.id === 'fighting68')!

export function deviceById(id: string | null | undefined) {
  return DEVICES.find((d) => d.id === id)
}

/** Short keycap legends for layouts that only carry HID codes. */
const LEGEND: Record<number, string> = {
  0x00: 'Fn', 0x28: 'Enter', 0x29: 'Esc', 0x2a: 'Backspace', 0x2b: 'Tab', 0x2c: 'Space', 0x39: 'Caps',
  0x4c: 'Del', 0x49: 'Ins', 0x4a: 'Home', 0x4d: 'End', 0x4b: 'PgUp', 0x4e: 'PgDn', 0x46: 'PrtSc', 0x48: 'Pause',
  0xe0: 'Ctrl', 0xe1: 'Shift', 0xe2: 'Alt', 0xe3: 'Win', 0xe4: 'Ctrl', 0xe5: 'Shift', 0xe6: 'Alt', 0xe7: 'Win',
}
const SHIFTED: Record<number, string> = {
  0x1e: '!', 0x1f: '@', 0x20: '#', 0x21: '$', 0x22: '%', 0x23: '^', 0x24: '&', 0x25: '*', 0x26: '(', 0x27: ')',
  0x2d: '_', 0x2e: '+', 0x2f: '{', 0x30: '}', 0x31: '|', 0x33: ':', 0x34: '"', 0x35: '~', 0x36: '<', 0x37: '>',
  0x38: '?',
}

/** Key geometry for a device. The official Sonix data's HID codes have a few mistakes, so the browser key code wins. */
export function layoutFor(device: DeviceDef): KeyDef[] {
  if (device.layout === 'fighting68-fcc') return FIGHTING68_KEYS
  if (device.protocol === 'rk') {
    return (RK_LAYOUTS.get(device.id) ?? []).map(([slot, hid, x, y, w, h]) => ({
      id: slot,
      label: LEGEND[hid] ?? hidName(hid),
      sub: SHIFTED[hid],
      hid,
      x,
      y,
      w,
      h,
    }))
  }
  const keys = data.layouts[device.layout] ?? []
  return keys.map(([id, label, sub, code, hid, x, y, w, h]) => ({
    id,
    label,
    sub: sub || undefined,
    hid: hidFromCode(code) ?? hid,
    x,
    y,
    w,
    h,
  }))
}

/** RK lighting modes mapped onto the closest Fighting68 animation for the on-screen preview. */
const RK_PREVIEW: Record<string, number> = {
  steady: 0x01,
  breathing: 0x07,
  'press and destroy': 0x03,
  'neon stream': 0x10,
  streamer: 0x0b,
  ambilight: 0x08,
  'dripping ripples': 0x0f,
  'brilliant point': 0x02,
  'flash away': 0x0d,
  'shadow disappear': 0x03,
  'ripples shining': 0x0f,
  'rich and honored': 0x08,
  marquee: 0x13,
  'rotating storm': 0x09,
  'serpentine race': 0x0c,
  'stars twinkle': 0x04,
  'retro snake': 0x0c,
  'diagonal transformation': 0x12,
  'sine wave': 0x0b,
}

function rkEffects(rk: RkInfo): EffectDef[] {
  return rk.modes
    .filter((m) => m.speed || m.brightness || m.color || m.index === rk.customMode)
    .map((m) => ({
      id: m.index,
      name: m.name,
      color: m.color,
      speed: m.speed,
      direction: m.direction > 0,
      preview: m.index === rk.customMode ? SONIX_CUSTOM : (RK_PREVIEW[m.name.toLowerCase()] ?? 0x01),
    }))
}

/** Makes `device` the active board: layout, switch limits and lighting effects everywhere in the app. */
export function activateDevice(device: DeviceDef) {
  setLayout(layoutFor(device))
  if (device.protocol === 'rk' && device.rk) {
    setEffects(rkEffects(device.rk), device.rk.customMode)
  } else {
    setRtLimits(device.limits)
    setEffects(SONIX_EFFECTS, SONIX_CUSTOM)
  }
}

/** Interfaces the app can talk to: wired Sonix boards on the 0xFF68 config page. */
export const WIRED_IDS = [
  ...new Map(SONIX_DEVICES.filter((d) => d.transport === 'wired').map((d) => [`${d.vendorId}:${d.productId}`, d])).values(),
].map((d) => ({ vendorId: d.vendorId, productId: d.productId }))

/** RK legacy boards take their configuration on the System Control collection. */
export const RK_VENDOR_ID = 0x258a
export const RK_FILTER = { vendorId: RK_VENDOR_ID, usagePage: 0x0001, usage: 0x0080 }
export const RK_PRODUCT_IDS = RK_DEVICES.map((d) => d.productId)

export interface Detection {
  /** best guess (always set when anything matches the product id) */
  device: DeviceDef | null
  /** other boards sharing the product id; the user may need to pick */
  candidates: DeviceDef[]
  /** true when the guess is certain (unique id or exact name match) */
  certain: boolean
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Works out which board is connected from its USB ids and product name. */
export function detect(vendorId: number, productId: number, productName: string): Detection {
  if (vendorId === RK_VENDOR_ID) {
    const rk = RK_DEVICES.find((d) => d.productId === productId) ?? null
    return { device: rk, candidates: rk ? [rk] : [], certain: !!rk }
  }
  const candidates = SONIX_DEVICES.filter((d) => d.productId === productId && d.vendorId === vendorId && d.transport === 'wired')
  if (!candidates.length) return { device: null, candidates: [], certain: false }
  const byName = candidates.filter((d) => norm(d.name) === norm(productName))
  if (byName.length) {
    // prefer the verified entry, then the first match
    const pick = byName.find((d) => d.status === 'verified') ?? byName[0]
    return { device: pick, candidates, certain: true }
  }
  const layouts = new Set(candidates.map((d) => d.layout))
  return { device: candidates[0], candidates, certain: layouts.size === 1 }
}
