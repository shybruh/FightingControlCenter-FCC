// Keyboards without lighting effects of their own (SteelSeries Gen 3, Sinowealth "010c" boards …): FCC draws every
// frame with the on-screen preview's renderer and streams it, as the makers' own apps do. Moving effects are sent ~20
// times a second, still pictures again now and then so the board doesn't fall back to its own lighting. Brightness
// scales the colours. Nothing is stored on the keyboard.

import { KEYS, type KeyDef } from '../data/layout'
import { renderEffect, type RGB } from '../lighting/preview'
import { SONIX_CUSTOM, decodeLed, encodeLed } from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { REGIONS, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

/** FCC effect ids on these boards (FCC keeps 0 for "off"). */
export const STREAM_FX = { static: 1, breathing: 2, spectrum: 3, wave: 4, custom: 5 } as const
/** the preview animation that renders each effect */
export const STREAM_PREVIEW: Record<number, number> = { 1: 0x01, 2: 0x07, 3: 0x08, 4: 0x10, 5: SONIX_CUSTOM }
const ANIMATED = new Set<number>([STREAM_FX.breathing, STREAM_FX.spectrum, STREAM_FX.wave])

/** ~20 frames a second, close to the makers' own software */
const FRAME_MS = 50

/** Starting state: spectrum cycle at full brightness, white per-key colours. */
export function streamedDefaults(): RegionData {
  const out = Object.fromEntries(Object.entries(REGIONS).map(([k, def]) => [k, new Uint8Array(def.size)])) as RegionData
  out.led = encodeLed(out.led, { effect: STREAM_FX.spectrum, r: 0, g: 255, b: 0, rainbow: false, brightness: 5, speed: 3, direction: 0 })
  for (const k of KEYS) if (k.id < 128) out.colors.set([k.id, 255, 255, 255], k.id * 4)
  return out
}

/** The pipe a streamed board needs: send a report, hear about unplugging, close. */
export interface StreamTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

export abstract class StreamedKeyboard<T extends StreamTransport> implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  protected state: RegionData = streamedDefaults()
  protected readonly transport: T
  private timer: ReturnType<typeof setInterval> | null = null
  private sending = false
  private readonly started = performance.now()
  private unsub: () => void
  /** how often a still picture is sent again */
  protected abstract readonly keepAliveMs: number

  constructor(transport: T) {
    this.transport = transport
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

  /** The report for one frame: each key with its colour (already scaled by brightness; black when off). */
  protected abstract frameReport(colors: Map<KeyDef, RGB>): Uint8Array
  /** Sent before frames when needed (e.g. the start of a lighting session); `null` when nothing is needed. */
  protected abstract beforeFrames(): Uint8Array | null
  protected abstract send(report: Uint8Array): Promise<void>
  /** Board-specific checks before anything is drawn (e.g. which model answered). */
  protected async prepare(): Promise<void> {}

  /** Lighting can't be read, so the app seeds it (from the active profile) before readAll. */
  seed(regions: Partial<RegionData>) {
    this.state = { ...this.state, ...Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Uint8Array.from(v)])) }
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    onProgress?.('keys', 1, 1)
    await this.prepare()
    this.restart()
    return Object.fromEntries(Object.entries(this.state).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  async readRegion(name: RegionName) {
    return this.state[name].slice()
  }

  async writeRegion(name: RegionName, data: Uint8Array) {
    this.state[name] = data.slice()
    if (name === 'led' || name === 'colors' || name === 'settings') this.restart()
    // keymap, macros and the rest have no command here; they stay in the profile only
  }

  /** Every key's colour at time `t` (seconds): the preview's colours, scaled by brightness. */
  colorsAt(t: number): Map<KeyDef, RGB> {
    const led = decodeLed(this.state.led)
    const out = new Map<KeyDef, RGB>()
    if (led.effect === 0) {
      for (const k of KEYS) out.set(k, [0, 0, 0])
      return out
    }
    const colors = this.state.colors
    const shown = renderEffect({ ...led, effect: STREAM_PREVIEW[led.effect] ?? 0x01, brightness: 5 }, t, [], (id) => [colors[id * 4 + 1], colors[id * 4 + 2], colors[id * 4 + 3]])
    const level = Math.min(5, Math.max(1, led.brightness || 5)) / 5
    for (const k of KEYS) {
      const [r, g, b] = shown.get(k.id) ?? [0, 0, 0]
      out.set(k, [Math.round(r * level), Math.round(g * level), Math.round(b * level)])
    }
    return out
  }

  /** The report for time `t`. */
  frame(t: number) {
    return this.frameReport(this.colorsAt(t))
  }

  /** (Re)starts drawing: every frame for moving effects, now and then for still ones. */
  protected restart() {
    this.stop()
    const animated = ANIMATED.has(decodeLed(this.state.led).effect)
    void this.draw()
    this.timer = setInterval(() => void this.draw(), animated ? FRAME_MS : this.keepAliveMs)
  }

  /** Forget that the session was started (e.g. after a setting that changes the packets). */
  protected resetSession() {
    this.sessionStarted = false
  }
  private sessionStarted = false

  private async draw() {
    // a slow frame is skipped, never queued
    if (this.sending) return
    this.sending = true
    try {
      if (!this.sessionStarted) {
        const first = this.beforeFrames()
        if (first) await this.send(first)
        this.sessionStarted = true
      }
      await this.send(this.frame((performance.now() - this.started) / 1000))
    } catch {
      // unplugged mid-frame: the disconnect handler stops the loop
    } finally {
      this.sending = false
    }
  }

  protected stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async commit() {
    /* frames apply immediately */
  }

  async command() {
    /* calibration / factory reset have no command here */
  }

  async close() {
    this.stop()
    this.unsub()
    await this.transport.close()
  }
}
