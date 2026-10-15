// Sinowealth "010c" keyboards (AULA F99 …). Protocol notes: docs/PROTOCOL-SINOWEALTH.md.
//
// FCC's own implementation of what OpenRGB documents for these boards: feature report 0x06 (520 bytes with the id)
// on a vendor collection. They have no effects FCC can set: like OpenRGB, FCC streams per-key frames (see
// streamed.ts), and the board falls back to its own lighting about a second after the frames stop.
//
// Several brands share this USB id, and commands meant for one Sinowealth board have bricked others. So before
// anything else FCC asks the board which model it is (the request OpenRGB sends), and only a model it knows gets frames.
// Nothing is stored on the keyboard.

import { KEYS, type KeyDef } from '../data/layout'
import type { DeviceDef } from '../devices/registry'
import type { RGB } from '../lighting/preview'
import { StreamedKeyboard, type StreamTransport } from './streamed'
import { Emitter, type DeviceIdentity } from './transport'

/** A pipe to the lighting collection: reports start with their id (0x06). */
export interface SinowealthTransport extends StreamTransport {
  send(report: Uint8Array): Promise<void>
  /** sends a report and reads the same feature report back (id first) */
  request(report: Uint8Array): Promise<Uint8Array>
}

export const SW_REPORT = 0x06
/** whole report, id included */
export const SW_REPORT_LEN = 520
/** "which model are you": the answer's byte 13 is the model id */
export const SW_MODEL_REQUEST = Uint8Array.of(0x06, 0x82, 0x01, 0x00, 0x01, 0x00, 0x06)
export const SW_MODEL_BYTE = 13
/** frame header; colours follow from byte 8, three bytes per LED index */
const FRAME_HEAD = [0x06, 0x08, 0x00, 0x00, 0x01, 0x00, 0x7a, 0x01]

/** One frame: every LED index's colour; indexes FCC has no key for stay dark. */
export function swFrame(colors: Map<number, RGB>) {
  const out = new Uint8Array(SW_REPORT_LEN)
  out.set(FRAME_HEAD)
  for (const [led, rgb] of colors) {
    const o = 8 + led * 3
    if (o + 2 < SW_REPORT_LEN) out.set(rgb.map((v) => Math.min(255, Math.max(0, Math.round(v)))), o)
  }
  return out
}

export class SinowealthModelError extends Error {}

export class SinowealthKeyboard extends StreamedKeyboard<SinowealthTransport> {
  /** the board leaves streamed lighting after about a second without frames */
  protected readonly keepAliveMs = 500
  private readonly device: DeviceDef
  /** model id the board answered with */
  reportedModel: number | null = null

  constructor(transport: SinowealthTransport, device: DeviceDef) {
    super(transport)
    this.device = device
  }

  /** Asks the board which model it is; refuses anything but the expected one. */
  protected async prepare() {
    const want = this.device.sinowealth?.model
    const answer = await this.transport.request(SW_MODEL_REQUEST)
    const got = answer.length > SW_MODEL_BYTE ? answer[SW_MODEL_BYTE] : null
    this.reportedModel = got
    if (want === undefined || got !== want) {
      const hex = (n: number | null | undefined) => (n == null ? '?' : `0x${n.toString(16).padStart(2, '0')}`)
      throw new SinowealthModelError(
        `this keyboard reports model ${hex(got)}, not the ${this.device.name} (${hex(want)}). Other brands share its USB id, so FCC leaves it alone. Please send a support request`,
      )
    }
  }

  protected beforeFrames() {
    return null
  }

  protected frameReport(colors: Map<KeyDef, RGB>) {
    const byLed = new Map<number, RGB>()
    const leds = this.device.sinowealth?.leds
    for (const k of KEYS) {
      const led = leds?.[k.id]
      if (led !== undefined) byLed.set(led, colors.get(k) ?? [0, 0, 0])
    }
    return swFrame(byLed)
  }

  protected send(report: Uint8Array) {
    return this.transport.send(report)
  }

  /** for tests: which model this driver serves */
  get model() {
    return this.device
  }
}

// ---------- demo / tests ----------

/** Answers the model request like a board with model id `model`, and records every report. */
export class MockSinowealthTransport implements SinowealthTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()
  private readonly answersAs: number

  constructor(device: DeviceDef, answersAs = device.sinowealth?.model ?? 0) {
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: 'Gaming Keyboard' }
    this.answersAs = answersAs
  }

  async send(report: Uint8Array) {
    if (this.sent.length > 500) this.sent.splice(0, 250)
    this.sent.push(report.slice())
  }

  async request(report: Uint8Array) {
    this.sent.push(report.slice())
    const answer = new Uint8Array(SW_REPORT_LEN)
    answer[0] = SW_REPORT
    answer[SW_MODEL_BYTE] = this.answersAs
    return answer
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
