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

import { KEYS, type KeyDef } from '../data/layout'
import type { DeviceDef } from '../devices/registry'
import type { RGB } from '../lighting/preview'
import { STREAM_FX, STREAM_PREVIEW, StreamedKeyboard, streamedDefaults, type StreamTransport } from './streamed'
import { Emitter, type DeviceIdentity } from './transport'

/** A pipe that sends one feature report 0 (without its id) to the keyboard; these boards don't answer lighting. */
export interface SteelSeriesTransport extends StreamTransport {
  send(report: Uint8Array): Promise<void>
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
export const SS_FX = STREAM_FX
/** the preview animation that renders each effect */
export const SS_PREVIEW = STREAM_PREVIEW

/** settings region: [0] = 1 to use the first-generation frame packet */
export const SS_SETTING = { original: 0 } as const

/** Starting state: spectrum cycle at full brightness, white per-key colours. */
export const ssDefaults = streamedDefaults

// ---------- driver ----------

export class SteelSeriesKeyboard extends StreamedKeyboard<SteelSeriesTransport> {
  /** a still picture is sent again once a second, so the board never drops back to its own lighting */
  protected readonly keepAliveMs = 1000
  private readonly device: DeviceDef

  constructor(transport: SteelSeriesTransport, device: DeviceDef) {
    super(transport)
    this.device = device
  }

  private original() {
    return this.state.settings[SS_SETTING.original] === 1
  }

  async writeRegion(name: Parameters<StreamedKeyboard<SteelSeriesTransport>['writeRegion']>[0], data: Uint8Array) {
    // switching between Gen 3 and original packets starts a new session
    if (name === 'settings') this.resetSession()
    return super.writeRegion(name, data)
  }

  protected beforeFrames() {
    return this.original() ? null : Uint8Array.of(SS_PACKET.init)
  }

  protected frameReport(colors: Map<KeyDef, RGB>) {
    const keys: [number, RGB][] = []
    for (const k of KEYS) {
      const code = ssLedCode(k)
      if (code) keys.push([code, colors.get(k) ?? [0, 0, 0]])
    }
    return ssFrame(this.original() ? SS_PACKET.frameOriginal : SS_PACKET.frame, keys)
  }

  protected send(report: Uint8Array) {
    return this.transport.send(report)
  }

  // deliberately no "onboard lighting" (0x41) packet on close: it reboots Gen 3 boards. The last frame stays.

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
