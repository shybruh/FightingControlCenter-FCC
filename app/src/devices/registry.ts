// Device registry.
// - Sonix HE boards: every keyboard the official VTER/driveall driver knows (catalog.json). Only the Fighting68 is
//   verified on real hardware so far (verified.json lists confirmed boards); other wired boards share its protocol and are "untested"; wireless dongles are not supported yet.
// - Royal Kludge "legacy" boards (Sinowealth, VID 0x258a; rk-catalog.json): a different, write-only protocol with
//   keymap and lighting only. Untested.

import { hidFromCode, hidName } from '../data/keycodes'
import { FIGHTING68_KEYS, setLayout, type KeyDef } from '../data/layout'
import { SONIX_CUSTOM, SONIX_EFFECTS, setEffects, setRtLimits, type EffectDef, type RtLimits } from '../hid/codec'
import catalog from './catalog.json'
import rkCatalog from './rk-catalog.json'
import ryCatalog from './ry-catalog.json'
import verifiedList from './verified.json'

/** boards confirmed working through board reports */
const VERIFIED = new Set(verifiedList.verified)
const statusOf = (id: string, status: DeviceStatus): DeviceStatus => (VERIFIED.has(id) ? 'verified' : status)

export type DeviceStatus = 'verified' | 'untested' | 'unsupported'

/** Which keyboard protocol a board speaks. */
export type Protocol = 'sonix' | 'rk' | 'ry'

export type AdvancedKind = 'rs' | 'socd' | 'dks' | 'modtap' | 'toggle'

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
  /** continuous RT, bottom optimisation and rampage switches */
  rtFlags: boolean
  /** advanced key types the firmware has */
  advanced: AdvancedKind[]
  /** SOCD resolution modes (see SOCD_MODES) */
  socdModes: number[]
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
  rtFlags: true,
  advanced: ['rs', 'socd', 'dks', 'modtap', 'toggle'],
  socdModes: [3, 1, 2, 4],
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
  rtFlags: false,
  advanced: [],
  socdModes: [],
}
const RY_CAPS: Capabilities = {
  readBack: true,
  performance: true,
  advancedKeys: true,
  macros: true,
  // the RY settings live on their own card
  keyboardSettings: false,
  sleepInLighting: false,
  mouseBindings: true,
  perKeyRgb: true,
  rtFlags: false,
  // snap tap is "last input wins"; there's no rappy-snappy
  advanced: ['socd', 'dks', 'modtap', 'toggle'],
  socdModes: [3],
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
  ry?: RyInfo
}

/** Lighting constants of an RY5088 model (they differ between model classes). */
export interface RyLight {
  /** mode index -> official mode name */
  list: Record<string, string> | null
  maxSpeed: number
  /** option low nibble for rainbow ("dazzle") and single colour */
  dazzle: number
  normal: number
  types: { type: string; options: number; rgb: boolean; dazzle: boolean; speed: boolean }[] | null
}

export interface RyInfo {
  /** model id the board reports (command 0x8F) */
  deviceId: number
  /** key matrix positions */
  positions: number
  /** factory key matrix, 4 bytes per position */
  matrix: Uint8Array
  light: RyLight
  maxMacro: number
  /** onboard profiles */
  profiles: number
}

// ---------- Sonix HE ----------

/** [id, label, sub, code, hid, x, y, w, h] */
type CatalogKey = [number, string, string, string, number, number, number, number, number]
type SonixEntry = Omit<DeviceDef, 'limits' | 'protocol' | 'caps' | 'rk'> & { limits: Omit<RtLimits, 'actuationMin' | 'actuationMax'> }

const data = catalog as unknown as { devices: SonixEntry[]; layouts: Record<string, CatalogKey[]> }

const SONIX_DEVICES: DeviceDef[] = data.devices.map((d) => ({
  ...d,
  status: statusOf(d.id, d.status),
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
  status: statusOf(d.id, 'untested'),
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

// ---------- RongYuan RY5088 (MonsGeek FUN60 / FUN68 / M1 V5 HE, Akko …) ----------

interface RyCatalog {
  devices: {
    id: number
    name: string
    displayName: string
    company?: string
    vendorId: number
    productId: number
    magnetism: boolean
    layers: number
    maxMacro?: number
    travel?: { max?: number; min?: number; def?: number; step?: number; rtMin?: number; rtMax?: number }
    matrix: number
    positions: number
    keys: number
    light: number
  }[]
  /** sparse factory matrices: [position, b0, b1, b2, b3] */
  matrices: [number, number, number, number, number][][]
  /** [position, hid, x, y, w, h] */
  layouts: RkKey[][]
  lights: RyLight[]
}
const RY_DATA = ryCatalog as unknown as RyCatalog
const RY_LAYOUTS = new Map<string, RkKey[]>()

const ryMatrix = (sparse: [number, number, number, number, number][], positions: number) => {
  const m = new Uint8Array(positions * 4)
  for (const [p, a, b, c, d] of sparse) m.set([a, b, c, d], p * 4)
  return m
}

export const RY_DEVICES: DeviceDef[] = RY_DATA.devices
  .filter((d) => d.magnetism)
  .map((d) => {
    const id = `ry-${d.id}`
    RY_LAYOUTS.set(id, RY_DATA.layouts[d.keys])
    const t = d.travel ?? {}
    const travel = Math.round((t.max ?? 3.4) * 100)
    return {
      id,
      name: d.displayName,
      vendorId: d.vendorId,
      productId: d.productId,
      layout: id,
      fnLayout: null,
      transport: 'wired' as const,
      status: statusOf(id, 'untested'),
      limits: {
        travel,
        actuationMin: Math.round((t.min ?? 0.1) * 100),
        actuationMax: travel,
        actuationDefault: Math.round((t.def ?? 2) * 100),
        sensMin: Math.max(1, Math.round((t.rtMin ?? 0.01) * 100)),
        sensMax: Math.round((t.rtMax ?? 2) * 100),
        sensDefault: 30,
      },
      protocol: 'ry' as const,
      caps: RY_CAPS,
      ry: {
        deviceId: d.id,
        positions: d.positions,
        matrix: ryMatrix(RY_DATA.matrices[d.matrix], d.positions),
        light: RY_DATA.lights[d.light],
        maxMacro: d.maxMacro ?? 50,
        profiles: Math.max(1, d.layers),
      },
    }
  })

export const DEVICES: DeviceDef[] = [...SONIX_DEVICES, ...RK_DEVICES, ...RY_DEVICES]

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
  if (device.protocol === 'rk' || device.protocol === 'ry') {
    return ((device.protocol === 'rk' ? RK_LAYOUTS : RY_LAYOUTS).get(device.id) ?? []).map(([slot, hid, x, y, w, h]) => ({
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

/** RY5088 lighting modes: friendly name and the closest Fighting68 animation for the preview. */
const RY_MODES: Record<string, [string, number]> = {
  LightAlwaysOn: ['Static', 0x01],
  LightBreath: ['Breathing', 0x07],
  LightNeon: ['Neon', 0x08],
  LightWave: ['Wave', 0x0b],
  LightRipple: ['Ripple', 0x0f],
  LightRaindrop: ['Raindrop', 0x05],
  LightSnake: ['Snake', 0x0c],
  LightPressAction: ['Reactive', 0x02],
  LightConverage: ['Converge', 0x09],
  LightSineWave: ['Sine wave', 0x0b],
  LightKaleidoscope: ['Kaleidoscope', 0x06],
  LightLineWave: ['Line wave', 0x10],
  LightUserPicture: ['Custom per-key', SONIX_CUSTOM],
  LightLaser: ['Laser', 0x0a],
  LightCircleWave: ['Circle wave', 0x06],
  LightDazzing: ['Rainbow', 0x08],
  LightRainDown: ['Rain down', 0x12],
  LightMeteor: ['Meteor', 0x12],
  LightPressActionOff: ['Reactive off', 0x03],
  LightTrain: ['Train', 0x13],
  LightFireWorks: ['Fireworks', 0x0d],
}
/** RY5088 default mode list (models can override it). */
const RY_LIGHT_LIST: Record<string, string> = Object.fromEntries(
  ['LightOff', 'LightAlwaysOn', 'LightBreath', 'LightNeon', 'LightWave', 'LightRipple', 'LightRaindrop', 'LightSnake', 'LightPressAction',
    'LightConverage', 'LightSineWave', 'LightKaleidoscope', 'LightLineWave', 'LightUserPicture', 'LightLaser', 'LightCircleWave', 'LightDazzing',
    'LightRainDown', 'LightMeteor', 'LightPressActionOff'].map((n, i) => [String(i), n]),
)

/** Mode index of a named RY lighting type on this model. */
export function ryModeIndex(light: RyLight, type: string) {
  const list = light.list ?? RY_LIGHT_LIST
  const hit = Object.entries(list).find(([, n]) => n === type)
  return hit ? Number(hit[0]) : undefined
}

function ryEffects(light: RyLight): EffectDef[] {
  const list = light.list ?? RY_LIGHT_LIST
  // modes this model lists, else every mode we know a name for (music / screen sync need the host, so they're left out)
  const types = light.types ?? Object.values(list).filter((t) => RY_MODES[t]).map((type) => ({ type, options: 0, rgb: true, dazzle: true, speed: true }))
  return types.flatMap((t) => {
    const id = ryModeIndex(light, t.type)
    const known = RY_MODES[t.type]
    if (id === undefined || !known) return []
    const custom = t.type === 'LightUserPicture'
    return [{ id, name: known[0], color: !custom && t.rgb, speed: !custom && t.speed, direction: t.options >= 2, preview: known[1] }]
  })
}

/** Makes `device` the active board: layout, switch limits and lighting effects everywhere in the app. */
export function activateDevice(device: DeviceDef) {
  setLayout(layoutFor(device))
  if (device.protocol === 'rk' && device.rk) {
    setEffects(rkEffects(device.rk), device.rk.customMode)
  } else if (device.protocol === 'ry' && device.ry) {
    setRtLimits(device.limits)
    setEffects(ryEffects(device.ry.light), ryModeIndex(device.ry.light, 'LightUserPicture') ?? 13)
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

/** RY5088 boards take configuration on a vendor collection (usage page 0xFFFF, usage 2). */
export const RY_USAGE_PAGE = 0xffff
export const RY_USAGE = 0x02
export const RY_VENDOR_IDS = [...new Set(RY_DEVICES.map((d) => d.vendorId))]
export const RY_FILTERS = RY_VENDOR_IDS.map((vendorId) => ({ vendorId, usagePage: RY_USAGE_PAGE, usage: RY_USAGE }))

/** The exact RY model from the id the board reports. */
export function ryDeviceById(deviceId: number) {
  return RY_DEVICES.find((d) => d.ry?.deviceId === deviceId) ?? null
}

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
export function detect(vendorId: number, productId: number, productName: string, ryDeviceId?: number): Detection {
  if (ryDeviceId !== undefined) {
    // RY boards report their model id; the USB ids are shared by many models
    const exact = ryDeviceById(ryDeviceId)
    const candidates = RY_DEVICES.filter((d) => d.vendorId === vendorId && d.productId === productId)
    return { device: exact ?? candidates[0] ?? null, candidates: exact ? [exact] : candidates, certain: !!exact }
  }
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
