// Royal Kludge "legacy" protocol (Sinowealth MCU, VID 0x258a), e.g. RK M75.
//
// Written from FCC's own protocol notes (docs/PROTOCOL-RK.md). The keyboard only accepts writes: everything goes out
// as 65-byte HID feature reports with report id 0x0a, and nothing can be read back. FCC therefore keeps the board's
// state on the host (the active profile) and translates its usual regions into RK packets:
//   keys   -> keymap        9 reports, 4 bytes per key slot (big endian firmware code)
//   led    -> lighting      1 report: mode, speed, brightness, colour, random colour, sleep timer
//   colors -> per-key RGB   7 reports, 3 bytes per key slot
// Regions RK boards don't have (rapid trigger, DKS, macros, settings) are kept host-side only.

import { KEYS } from '../data/layout'
import type { DeviceDef } from '../devices/registry'
import { CUSTOM_EFFECT, decodeBinding, decodeLed, encodeLed, type Binding } from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { REGIONS, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

export const RK_REPORT_ID = 0x0a
/** report length without the report id byte */
export const RK_REPORT_LEN = 64

/** A pipe that can send RK feature reports. */
export interface FeatureTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  sendFeature(reportId: number, data: Uint8Array): Promise<void>
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

// ---------- key codes ----------

/** Firmware code of a modifier key on its own (bit in the modifier byte, shifted into byte 2). */
const modifierCode = (hid: number) => (1 << (hid - 0xe0)) << 16
const FN_CODE = 0xb000
const CONSUMER = 0x01000000

/** What a key does when it isn't remapped. */
export function nativeCode(hid: number): number {
  if (hid === 0) return FN_CODE
  if (hid >= 0xe0 && hid <= 0xe7) return modifierCode(hid)
  return hid << 8
}

/** RK firmware code for an FCC binding. Unsupported binding types fall back to the key's own function. */
export function rkCode(b: Binding, hid: number): number {
  switch (b.type) {
    case 'key': {
      // a lone modifier (L-Ctrl …) is its own mask; otherwise modifiers ride in byte 2 next to the key
      if (b.code >= 0xe0 && b.code <= 0xe7) return (b.mods << 16) | modifierCode(b.code)
      return (b.mods << 16) | (b.code << 8)
    }
    case 'media':
      return CONSUMER | (b.usage & 0xffff)
    default:
      return nativeCode(hid)
  }
}

// ---------- packet framing ----------

/**
 * Splits a payload over `count` reports of 65 bytes:
 *   [0x0a, count, index (1-based), …first-report header, …data]
 */
function frame(count: number, firstHeader: number[], payload: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let pos = 0
  for (let i = 0; i < count; i++) {
    const r = new Uint8Array(RK_REPORT_LEN + 1)
    r[0] = RK_REPORT_ID
    r[1] = count
    r[2] = i + 1
    let at = 3
    if (i === 0) for (const b of firstHeader) r[at++] = b
    while (at < r.length && pos < payload.length) r[at++] = payload[pos++]
    out.push(r)
  }
  return out
}

const KEYMAP_REPORTS = 9
const KEYMAP_HEADER = [0x01, 0xf8]
/** usable key slots: (60 + 8 * 62) / 4 */
export const RK_KEY_SLOTS = Math.floor((RK_REPORT_LEN + 1 - 5 + (KEYMAP_REPORTS - 1) * (RK_REPORT_LEN + 1 - 3)) / 4)

/** Full keymap: `codes[slot]` = firmware code (0 = empty slot). */
export function encodeKeymap(codes: Map<number, number>): Uint8Array[] {
  const payload = new Uint8Array(RK_KEY_SLOTS * 4)
  for (const [slot, code] of codes) {
    if (slot < 0 || slot >= RK_KEY_SLOTS) continue
    const o = slot * 4
    payload[o] = (code >>> 24) & 0xff
    payload[o + 1] = (code >>> 16) & 0xff
    payload[o + 2] = (code >>> 8) & 0xff
    payload[o + 3] = code & 0xff
  }
  return frame(KEYMAP_REPORTS, KEYMAP_HEADER, payload)
}

export interface RkLighting {
  mode: number
  speed: number
  brightness: number
  r: number
  g: number
  b: number
  random: boolean
  /** 1 = 5 min, 2 = 10 min, 3 = 20 min, 4 = 30 min, 5 = never */
  sleep: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

export function encodeLighting(l: RkLighting): Uint8Array {
  const r = new Uint8Array(RK_REPORT_LEN + 1)
  r.set([RK_REPORT_ID, 0x01, 0x01, 0x02, 0x29])
  r[5] = clamp(l.mode, 0, 255)
  r[6] = 0
  r[7] = clamp(l.speed, 1, 5)
  r[8] = clamp(l.brightness, 0, 5)
  if (!l.random) {
    r[9] = clamp(l.r, 0, 255)
    r[10] = clamp(l.g, 0, 255)
    r[11] = clamp(l.b, 0, 255)
  }
  r[12] = l.random ? 1 : 0
  r[13] = clamp(l.sleep, 1, 5)
  return r
}

const PERKEY_REPORTS = 7
const PERKEY_HEADER = [0x03, 0x7e, 0x01]
export const RK_RGB_SLOTS = Math.floor((RK_REPORT_LEN + 1 - 6 + (PERKEY_REPORTS - 1) * (RK_REPORT_LEN + 1 - 3)) / 3)

/** Per-key colours: `colors[slot]` = [r, g, b]. */
export function encodePerKey(colors: Map<number, [number, number, number]>): Uint8Array[] {
  const payload = new Uint8Array(RK_RGB_SLOTS * 3)
  for (const [slot, [r, g, b]] of colors) {
    if (slot < 0 || slot >= RK_RGB_SLOTS) continue
    payload.set([r, g, b], slot * 3)
  }
  return frame(PERKEY_REPORTS, PERKEY_HEADER, payload)
}

// ---------- host-side state ----------

/** Byte in FCC's 16-byte LED region where the RK sleep timer is kept (unused by Sonix boards). */
export const RK_SLEEP_BYTE = 12
export const RK_SLEEP_DEFAULT = 2

/** Starting state for a board we can't read: native keymap, the board's default lighting, white per-key colours. */
export function rkDefaults(device: DeviceDef): RegionData {
  const out = Object.fromEntries(Object.entries(REGIONS).map(([k, def]) => [k, new Uint8Array(def.size)])) as RegionData
  const rk = device.rk
  out.led = encodeLed(out.led, {
    effect: rk?.defaultMode ?? 1,
    r: 255,
    g: 255,
    b: 255,
    rainbow: false,
    brightness: rk?.defaultBrightness ?? 5,
    speed: 3,
    direction: 0,
  })
  out.led[RK_SLEEP_BYTE] = RK_SLEEP_DEFAULT
  for (const k of KEYS) if (k.id < 126) out.colors.set([k.id, 255, 255, 255], k.id * 4)
  return out
}

// ---------- driver ----------

export class RkKeyboard implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  private state: RegionData
  private readonly transport: FeatureTransport
  private readonly device: DeviceDef
  private queue: Promise<unknown> = Promise.resolve()
  private unsub: () => void
  /** last per-key colours sent, so a whole-profile write doesn't send them twice */
  private sentColors = ''

  constructor(transport: FeatureTransport, device: DeviceDef) {
    this.transport = transport
    this.device = device
    this.state = rkDefaults(device)
    this.unsub = transport.onDisconnect(() => this.disconnected.emit())
  }

  get name() {
    return this.transport.name
  }

  get identity() {
    return this.transport.identity
  }

  /** The keyboard can't be read, so the app seeds the state (from the active profile) before readAll. */
  seed(regions: Partial<RegionData>) {
    this.state = { ...this.state, ...Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Uint8Array.from(v)])) }
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    onProgress?.('keys', 1, 1)
    return Object.fromEntries(Object.entries(this.state).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  async readRegion(name: RegionName) {
    return this.state[name].slice()
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async send(reports: Uint8Array[]) {
    for (const r of reports) await this.transport.sendFeature(r[0], r.slice(1))
  }

  writeRegion(name: RegionName, data: Uint8Array) {
    return this.run(async () => {
      this.state[name] = data.slice()
      if (name === 'keys') await this.send(this.keymapReports())
      else if (name === 'led') await this.send(this.lightingReports())
      // colours only matter while the per-key mode is on; switching to it sends them
      else if (name === 'colors' && this.customActive()) await this.send(this.perKeyReports())
      // other regions have no RK counterpart; they stay in the profile only
    })
  }

  keymapReports() {
    const codes = new Map<number, number>()
    for (const k of KEYS) codes.set(k.id, rkCode(decodeBinding(this.state.keys, k.id), k.hid))
    return encodeKeymap(codes)
  }

  lightingReports() {
    const led = decodeLed(this.state.led)
    const off = led.effect === 0
    const reports = [
      encodeLighting({
        // "off" keeps the last mode and turns brightness down to zero
        mode: off ? (this.device.rk?.defaultMode ?? 1) : led.effect,
        speed: led.speed || 3,
        brightness: off ? 0 : led.brightness,
        r: led.r,
        g: led.g,
        b: led.b,
        random: led.rainbow,
        sleep: this.state.led[RK_SLEEP_BYTE] || RK_SLEEP_DEFAULT,
      }),
    ]
    // entering the per-key mode also needs the colours
    if (this.customActive()) reports.push(...this.perKeyReports(true))
    return reports
  }

  private customActive() {
    return this.device.caps.perKeyRgb && decodeLed(this.state.led).effect === CUSTOM_EFFECT
  }

  /** Per-key colour reports; empty when nothing changed since the last send (unless forced). */
  perKeyReports(force = false) {
    const key = this.state.colors.join(',')
    if (!force && key === this.sentColors) return []
    this.sentColors = key
    const colors = new Map<number, [number, number, number]>()
    for (const k of KEYS) {
      const o = k.id * 4
      colors.set(k.id, [this.state.colors[o + 1], this.state.colors[o + 2], this.state.colors[o + 3]])
    }
    return encodePerKey(colors)
  }

  async commit() {
    /* RK applies every report immediately */
  }

  async command() {
    /* calibration / reset commands have no RK equivalent */
  }

  async close() {
    this.unsub()
    await this.transport.close()
  }
}

// ---------- transports ----------

/** Browser: WebHID feature reports on the System Control collection. */
export class WebHidRkTransport implements FeatureTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private device: HIDDevice
  private disconnects = new Emitter<void>()
  private onHidDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.disconnects.emit()
  }

  constructor(device: HIDDevice) {
    this.device = device
    this.name = device.productName || 'Royal Kludge keyboard'
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.productName }
    navigator.hid.addEventListener('disconnect', this.onHidDisconnect)
  }

  static async open(device: HIDDevice) {
    if (!device.opened) await device.open()
    return new WebHidRkTransport(device)
  }

  sendFeature(reportId: number, data: Uint8Array) {
    return this.device.sendFeatureReport(reportId, data as Uint8Array<ArrayBuffer>)
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    navigator.hid.removeEventListener('disconnect', this.onHidDisconnect)
    if (this.device.opened) await this.device.close()
  }
}

/** Demo / test: records every report instead of sending it. */
export class MockRkTransport implements FeatureTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()

  constructor(device: DeviceDef) {
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.name }
  }

  async sendFeature(reportId: number, data: Uint8Array) {
    const r = new Uint8Array(data.length + 1)
    r[0] = reportId
    r.set(data, 1)
    this.sent.push(r)
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
