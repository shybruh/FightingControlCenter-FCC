// SteelSeries Apex keyboards (Apex Pro Gen 3 …).
//
// FCC's own implementation of the lighting report OpenRGB documents for these boards: feature report 0 on the
// keyboard's command interface, holding a packet id, a count and (key, r, g, b) per key, where "key" is the key's HID
// usage. Gen 3 boards have no lighting effects in firmware: SteelSeries' own software computes every frame and streams
// it, and so does FCC, from the same renderer as the on-screen preview (so the two always match). Brightness scales
// the colours. Effects run while FCC runs; nothing is stored on the keyboard.
//
// Never sent: 0x41 ("onboard lighting"), which OpenRGB uses on exit and which reboots Gen 3 boards.
// Keymap, actuation and rapid trigger have no documented command and aren't offered.

import { KEYS } from '../data/layout'
import type { DeviceDef } from '../devices/registry'
import { renderEffect, type RGB } from '../lighting/preview'
import { SONIX_CUSTOM, decodeLed, encodeLed } from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { REGIONS, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

/** A pipe that sends one feature report 0 (without its id) to the keyboard; these boards don't answer lighting. */
export interface SteelSeriesTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  send(report: Uint8Array): Promise<void>
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

// ---------- packets ----------

export const SS_PACKET = {
  /** Gen 3 (and 2023) wired boards: per-key frame */
  frame: 0x40,
  /** first-generation Apex Pro: per-key frame */
  frameOriginal: 0x3a,
  /** Gen 3: start of a lighting session (harmless where it isn't needed) */
  init: 0x4b,
} as const

/** room in the 642-byte report: id, count, then 4 bytes per key */
export const SS_MAX_KEYS = 160

/** One frame: [packet id, count, (key, r, g, b)…]. */
export function ssFrame(packetId: number, keys: [code: number, rgb: RGB][]) {
  const list = keys.slice(0, SS_MAX_KEYS)
  const out = new Uint8Array(2 + list.length * 4)
  out[0] = packetId
  out[1] = list.length
  list.forEach(([code, [r, g, b]], i) => out.set([code, r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v)))), 2 + i * 4))
  return out
}

/** The LED id of a key: its HID usage; the Fn key (no usage of its own) is 0xF0. */
export const ssLedCode = (k: { hid: number; label: string }) => (k.hid ? k.hid : /^fn$/i.test(k.label) ? 0xf0 : 0)

// ---------- host-side state ----------

/** FCC effect ids for SteelSeries boards (FCC keeps 0 for "off"). */
export const SS_FX = { static: 1, breathing: 2, spectrum: 3, wave: 4, custom: 5 } as const
/** the preview animation that renders each effect */
export const SS_PREVIEW: Record<number, number> = { 1: 0x01, 2: 0x07, 3: 0x08, 4: 0x10, 5: SONIX_CUSTOM }
const ANIMATED = new Set<number>([SS_FX.breathing, SS_FX.spectrum, SS_FX.wave])

/** settings region: [0] = 1 to use the first-generation frame packet */
export const SS_SETTING = { original: 0 } as const

/** Starting state: spectrum cycle at full brightness, white per-key colours. */
export function ssDefaults(): RegionData {
  const out = Object.fromEntries(Object.entries(REGIONS).map(([k, def]) => [k, new Uint8Array(def.size)])) as RegionData
  out.led = encodeLed(out.led, { effect: SS_FX.spectrum, r: 0, g: 255, b: 0, rainbow: false, brightness: 5, speed: 3, direction: 0 })
  for (const k of KEYS) if (k.id < 128) out.colors.set([k.id, 255, 255, 255], k.id * 4)
  return out
}

// ---------- driver ----------

/** ~20 frames a second, close to SteelSeries' own software */
const FRAME_MS = 50
/** a still picture is sent again now and then, so the board never drops back to its own lighting */
const KEEP_ALIVE_MS = 1000

export class SteelSeriesKeyboard implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  private state: RegionData = ssDefaults()
  private readonly transport: SteelSeriesTransport
  private readonly device: DeviceDef
  private timer: ReturnType<typeof setInterval> | null = null
  private sending = false
  private started = performance.now()
  private initialised = false
  private unsub: () => void

  constructor(transport: SteelSeriesTransport, device: DeviceDef) {
    this.transport = transport
    this.device = device
    this.unsub = transport.onDisconnect(() => {
      this.stop()
      this.disconnected.emit()
    })
  }

  get name() {
    return this.transport.name
  }

  get identity() {
    return this.transport.identity
  }

  /** Lighting can't be read, so the app seeds it (from the active profile) before readAll. */
  seed(regions: Partial<RegionData>) {
    this.state = { ...this.state, ...Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Uint8Array.from(v)])) }
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    onProgress?.('keys', 1, 1)
    this.restart()
    return Object.fromEntries(Object.entries(this.state).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  async readRegion(name: RegionName) {
    return this.state[name].slice()
  }

  async writeRegion(name: RegionName, data: Uint8Array) {
    this.state[name] = data.slice()
    if (name === 'settings') this.initialised = false
    if (name === 'led' || name === 'colors' || name === 'settings') this.restart()
    // keymap, macros and the rest have no SteelSeries command FCC knows; they stay in the profile only
  }

  private original() {
    return this.state.settings[SS_SETTING.original] === 1
  }

  /** The frame for time `t` (seconds): the preview's colours, scaled by brightness. */
  frame(t: number): Uint8Array {
    const led = decodeLed(this.state.led)
    const codes = KEYS.map((k) => [k, ssLedCode(k)] as const).filter(([, code]) => code)
    const id = this.original() ? SS_PACKET.frameOriginal : SS_PACKET.frame
    if (led.effect === 0) return ssFrame(id, codes.map(([, code]) => [code, [0, 0, 0]]))
    const colors = this.state.colors
    const shown = renderEffect({ ...led, effect: SS_PREVIEW[led.effect] ?? 0x01, brightness: 5 }, t, [], (kid) => [colors[kid * 4 + 1], colors[kid * 4 + 2], colors[kid * 4 + 3]])
    const level = Math.min(5, Math.max(1, led.brightness || 5)) / 5
    return ssFrame(
      id,
      codes.map(([k, code]) => {
        const [r, g, b] = shown.get(k.id) ?? [0, 0, 0]
        return [code, [r * level, g * level, b * level]]
      }),
    )
  }

  /** (Re)starts drawing: every frame for moving effects, now and then for still ones. */
  private restart() {
    this.stop()
    const animated = ANIMATED.has(decodeLed(this.state.led).effect)
    void this.draw()
    this.timer = setInterval(() => void this.draw(), animated ? FRAME_MS : KEEP_ALIVE_MS)
  }

  private async draw() {
    // a slow frame is skipped, never queued
    if (this.sending) return
    this.sending = true
    try {
      if (!this.initialised && !this.original()) {
        await this.transport.send(Uint8Array.of(SS_PACKET.init))
        this.initialised = true
      }
      await this.transport.send(this.frame((performance.now() - this.started) / 1000))
    } catch {
      // unplugged mid-frame: the disconnect handler stops the loop
    } finally {
      this.sending = false
    }
  }

  private stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async commit() {
    /* frames apply immediately */
  }

  async command() {
    /* calibration / factory reset have no documented command */
  }

  async close() {
    this.stop()
    this.unsub()
    // deliberately no "onboard lighting" (0x41) packet: it reboots Gen 3 boards. The last frame stays.
    await this.transport.close()
  }

  /** for tests: which model this driver serves */
  get model() {
    return this.device
  }
}

// ---------- demo / tests ----------

/** Records every report, like a board that takes everything. */
export class MockSteelSeriesTransport implements SteelSeriesTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()

  constructor(device: DeviceDef) {
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.name }
  }

  async send(report: Uint8Array) {
    // the demo would otherwise collect frames forever
    if (this.sent.length > 500) this.sent.splice(0, 250)
    this.sent.push(report.slice())
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
