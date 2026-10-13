// Razer keyboards (Huntsman V2 …). Protocol notes: docs/PROTOCOL-RAZER.md.
//
// FCC's own implementation of Razer's documented 90-byte control report (the layout OpenRazer documents): every
// command goes out as feature report 0 on the keyboard's control interface and is answered in the same report.
//   led      -> lighting effect (class 0x0F, id 0x02) + brightness (0x0F 0x04)
//   colors   -> per-key frame, one packet per matrix row (0x0F 0x03), shown by the "custom frame" effect
//   settings -> polling rate (0x00 0x40), game mode (0x03 0x00), keyswitch optimisation (0x02 0x02 + 0x02 0x15)
// The lighting effect can't be read back, so lighting comes from the active profile; settings are read on connect.
// Keymap, macros and rapid trigger have no documented Razer command and stay host-side only.

import { KEYS } from '../data/layout'
import type { DeviceDef } from '../devices/registry'
import { decodeLed, encodeLed } from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { REGIONS, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

/** report length (without the report id) */
export const RAZER_REPORT_LEN = 90
/** what Razer's software uses as transaction id on these boards */
export const RAZER_TRANSACTION = 0x1f

const STATUS = { busy: 0x01, ok: 0x02, failed: 0x03, timeout: 0x04, unsupported: 0x05 } as const
const VARSTORE = 0x01
const NOSTORE = 0x00
const BACKLIGHT_LED = 0x05
const GAME_LED = 0x08

/** A pipe that sends one Razer report and returns the keyboard's answer. */
export interface RazerTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  /** sends a 90-byte report and returns the 90-byte answer */
  request(report: Uint8Array): Promise<Uint8Array>
  /** sends a report without reading an answer (some boards don't answer per-key frames) */
  send(report: Uint8Array): Promise<void>
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

// ---------- packets ----------

/** XOR of bytes 2..87, stored in byte 88. */
export function razerCrc(r: ArrayLike<number>) {
  let crc = 0
  for (let i = 2; i < 88; i++) crc ^= r[i]
  return crc
}

/** [status, transaction, remaining (2, BE), protocol, size, class, id, args (80), crc, 0] */
export function razerPacket(cls: number, id: number, size: number, args: number[] = []): Uint8Array {
  const r = new Uint8Array(RAZER_REPORT_LEN)
  r[1] = RAZER_TRANSACTION
  r[5] = size
  r[6] = cls
  r[7] = id
  r.set(args.slice(0, 80), 8)
  r[88] = razerCrc(r)
  return r
}

/** The same report with another transaction id (each model uses its own per kind of command). */
export function withTransaction(r: Uint8Array, tid: number): Uint8Array {
  const out = r.slice()
  out[1] = tid
  out[88] = razerCrc(out)
  return out
}

const rgb = (c: [number, number, number]) => c.map((v) => Math.min(255, Math.max(0, Math.round(v))))

/** Lighting effect on the whole keyboard ("extended matrix" commands). */
export const effect = {
  none: () => razerPacket(0x0f, 0x02, 0x06, [VARSTORE, BACKLIGHT_LED, 0x00]),
  static: (c: [number, number, number]) => razerPacket(0x0f, 0x02, 0x09, [VARSTORE, BACKLIGHT_LED, 0x01, 0, 0, 0x01, ...rgb(c)]),
  breathingRandom: () => razerPacket(0x0f, 0x02, 0x06, [VARSTORE, BACKLIGHT_LED, 0x02]),
  breathing: (c: [number, number, number]) => razerPacket(0x0f, 0x02, 0x09, [VARSTORE, BACKLIGHT_LED, 0x02, 0x01, 0, 0x01, ...rgb(c)]),
  spectrum: () => razerPacket(0x0f, 0x02, 0x06, [VARSTORE, BACKLIGHT_LED, 0x03]),
  /** direction 1 or 2 */
  wave: (direction: 1 | 2) => razerPacket(0x0f, 0x02, 0x06, [VARSTORE, BACKLIGHT_LED, 0x04, direction, 0x28]),
  /** speed 1–4 */
  reactive: (speed: number, c: [number, number, number]) =>
    razerPacket(0x0f, 0x02, 0x09, [VARSTORE, BACKLIGHT_LED, 0x05, 0, clampInt(speed, 1, 4), 0x01, ...rgb(c)]),
  /** speed 1–3 */
  starlightRandom: (speed: number) => razerPacket(0x0f, 0x02, 0x06, [VARSTORE, BACKLIGHT_LED, 0x07, 0, clampInt(speed, 1, 3)]),
  starlight: (speed: number, c: [number, number, number]) =>
    razerPacket(0x0f, 0x02, 0x09, [VARSTORE, BACKLIGHT_LED, 0x07, 0, clampInt(speed, 1, 3), 0x01, ...rgb(c)]),
  /** shows the colours sent with frameRow */
  custom: () => razerPacket(0x0f, 0x02, 0x0c, [0, 0, 0x08]),
}

/** One row of per-key colours: `colors` holds 3 bytes per column from `start` to `stop`. */
export function frameRow(row: number, start: number, stop: number, colors: ArrayLike<number>) {
  const data = Array.from(colors).slice(0, (stop - start + 1) * 3)
  return razerPacket(0x0f, 0x03, 0x47, [0, 0, row, start, stop, ...data])
}

/** Backlight brightness 0–255. */
export const brightness = (level: number) => razerPacket(0x0f, 0x04, 0x03, [VARSTORE, BACKLIGHT_LED, clampInt(level, 0, 255)])

/** Polling rates the newer boards take, with their codes. */
export const RAZER_POLLING: { value: number; hz: number }[] = [
  { value: 0x40, hz: 125 },
  { value: 0x20, hz: 250 },
  { value: 0x10, hz: 500 },
  { value: 0x08, hz: 1000 },
  { value: 0x04, hz: 2000 },
  { value: 0x02, hz: 4000 },
  { value: 0x01, hz: 8000 },
]

export const settings = {
  getPolling: () => razerPacket(0x00, 0xc0, 0x01),
  setPolling: (code: number) => razerPacket(0x00, 0x40, 0x02, [0x00, code]),
  /** store: 1 on most boards, 0 on the Huntsman V2 / V2 TKL */
  getGameMode: (store = NOSTORE) => razerPacket(0x03, 0x80, 0x03, [store, GAME_LED]),
  setGameMode: (on: boolean, store = NOSTORE) => razerPacket(0x03, 0x00, 0x03, [store, GAME_LED, on ? 1 : 0]),
  getKeyswitch: () => razerPacket(0x02, 0x82, 0x04),
  /** typing = 0, gaming = 1; Razer's software sends both packets */
  setKeyswitch: (gaming: boolean) =>
    gaming
      ? [razerPacket(0x02, 0x02, 0x04), razerPacket(0x02, 0x15, 0x05, [0x01])]
      : [razerPacket(0x02, 0x02, 0x04, [0x00, 0x14, 0x00, 0x28, 0x00]), razerPacket(0x02, 0x15, 0x05, [0x01, 0x00, 0x14, 0x00, 0x28, 0x00])],
}

function clampInt(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, Math.round(v)))
}

/** Checks an answer belongs to the request and succeeded; returns its argument bytes. */
export function checkReply(request: Uint8Array, reply: Uint8Array): Uint8Array {
  if (reply.length < 88) throw new Error(`short Razer reply (${reply.length} bytes)`)
  if (reply[6] !== request[6] || reply[7] !== request[7]) {
    throw new Error(`Razer reply is for command ${hex2(reply[6])} ${hex2(reply[7])}, not ${hex2(request[6])} ${hex2(request[7])}`)
  }
  const status = reply[0]
  if (status !== STATUS.ok && status !== STATUS.busy) {
    const why = status === STATUS.unsupported ? 'not supported' : status === STATUS.timeout ? 'timed out' : status === STATUS.failed ? 'failed' : `status ${hex2(status)}`
    throw new RazerCommandError(`Razer command ${hex2(request[6])} ${hex2(request[7])} ${why}`, status)
  }
  return reply.slice(8, 88)
}

export class RazerCommandError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

const hex2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`

// ---------- host-side state ----------

/** FCC's settings region for Razer boards (host-side layout): */
export const RAZER_SETTING = { polling: 0, gameMode: 1, gaming: 2 } as const

export interface RazerSettings {
  /** polling-rate code (see RAZER_POLLING) */
  polling: number
  gameMode: boolean
  /** keyswitch optimisation: true = gaming, false = typing */
  gaming: boolean
}

export function decodeRazerSettings(s: Uint8Array): RazerSettings {
  return { polling: s[RAZER_SETTING.polling] || 0x08, gameMode: s[RAZER_SETTING.gameMode] === 1, gaming: s[RAZER_SETTING.gaming] === 1 }
}

export function encodeRazerSettings(prev: Uint8Array, v: RazerSettings): Uint8Array {
  const out = prev.slice()
  out[RAZER_SETTING.polling] = v.polling
  out[RAZER_SETTING.gameMode] = v.gameMode ? 1 : 0
  out[RAZER_SETTING.gaming] = v.gaming ? 1 : 0
  return out
}

/** FCC effect ids for Razer boards (FCC keeps 0 for "off"). */
export const RAZER_FX = { static: 1, breathing: 2, spectrum: 3, wave: 4, reactive: 5, starlight: 6, custom: 7 } as const

/** Starting state for a board whose lighting can't be read: spectrum at full brightness, white per-key colours. */
export function razerDefaults(): RegionData {
  const out = Object.fromEntries(Object.entries(REGIONS).map(([k, def]) => [k, new Uint8Array(def.size)])) as RegionData
  out.led = encodeLed(out.led, { effect: RAZER_FX.spectrum, r: 0, g: 255, b: 0, rainbow: false, brightness: 5, speed: 3, direction: 0 })
  for (const k of KEYS) if (k.id < 128) out.colors.set([k.id, 255, 255, 255], k.id * 4)
  out.settings = encodeRazerSettings(out.settings, { polling: 0x08, gameMode: false, gaming: false })
  return out
}

// ---------- driver ----------

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isCustomEffect = (r: Uint8Array) => r[6] === 0x0f && r[7] === 0x02 && r[10] === 0x08 && r[8] === 0 && r[9] === 0

export class RazerKeyboard implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  private state: RegionData = razerDefaults()
  private readonly transport: RazerTransport
  private readonly device: DeviceDef
  private queue: Promise<unknown> = Promise.resolve()
  private unsub: () => void

  constructor(transport: RazerTransport, device: DeviceDef) {
    this.transport = transport
    this.device = device
    this.unsub = transport.onDisconnect(() => this.disconnected.emit())
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

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op)
    this.queue = next.catch(() => undefined)
    return next
  }

  /** Sends one command; retries like Razer's own software when the board is busy or the answer is garbled. */
  async call(raw: Uint8Array): Promise<Uint8Array> {
    const report = this.tag(raw)
    let last: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return checkReply(report, await this.transport.request(report))
      } catch (e) {
        // a definite "no" from the board won't change on retry
        if (e instanceof RazerCommandError && e.status !== STATUS.timeout) throw e
        last = e
        await wait(10)
      }
    }
    throw last
  }

  /** Sends reports in order; per-key frames go without waiting for an answer on boards that don't give one. */
  private async send(reports: Uint8Array[]) {
    const rz = this.device.razer
    for (const r of reports) {
      const frame = (r[6] === 0x0f && r[7] === 0x03) || isCustomEffect(r)
      if (frame && rz?.frameNoAnswer) await this.transport.send(r)
      else await this.call(r)
    }
  }

  /** Stamps a report with the transaction id this model uses for that kind of command. */
  private tag(r: Uint8Array): Uint8Array {
    const t = this.device.razer?.tid
    if (!t) return r
    const [cls, id] = [r[6], r[7]]
    if (cls === 0x0f && id === 0x03) return withTransaction(r, t.frame)
    if (isCustomEffect(r)) return withTransaction(r, t.effect)
    if (cls === 0x0f && (id === 0x04 || id === 0x84)) return withTransaction(r, t.brightness)
    if (cls === 0x0f) return withTransaction(r, t.effect)
    if (cls === 0x03) return withTransaction(r, t.game)
    return r
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    onProgress?.('settings', 1, 2)
    // settings are board-wide and readable; a board that refuses one keeps FCC's default for it
    const s = decodeRazerSettings(this.state.settings)
    const read = async (packet: Uint8Array, apply: (args: Uint8Array) => void) => {
      try {
        apply(await this.call(packet))
      } catch {
        /* keep the default */
      }
    }
    const rz = this.device.razer
    if (rz?.pollingRates.length) {
      await read(settings.getPolling(), (a) => {
        if (RAZER_POLLING.some((p) => p.value === a[1])) s.polling = a[1]
      })
    }
    await read(settings.getGameMode(rz?.gameStore ?? NOSTORE), (a) => (s.gameMode = a[2] === 1))
    if (rz?.keyswitch) await read(settings.getKeyswitch(), (a) => (s.gaming = a[1] !== 0x14))
    this.state.settings = encodeRazerSettings(this.state.settings, s)
    onProgress?.('keys', 2, 2)
    return Object.fromEntries(Object.entries(this.state).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  async readRegion(name: RegionName) {
    return this.state[name].slice()
  }

  writeRegion(name: RegionName, data: Uint8Array) {
    return this.run(async () => {
      const before = this.state[name]
      this.state[name] = data.slice()
      if (name === 'led') await this.send(this.lightingReports())
      else if (name === 'colors' && this.customActive()) await this.send(this.frameReports())
      else if (name === 'settings') await this.send(this.settingsReports(decodeRazerSettings(before), decodeRazerSettings(data)))
      // keymap, macros and the rest have no Razer command FCC knows; they stay in the profile only
    })
  }

  /** Effect + brightness for the current lighting. */
  lightingReports(): Uint8Array[] {
    const led = decodeLed(this.state.led)
    const color: [number, number, number] = [led.r, led.g, led.b]
    // FCC's speed is 1 (slow) … 5 (fast); Razer's reactive and starlight values count the other way
    const reactiveSpeed = 5 - Math.min(4, Math.max(1, led.speed || 3))
    const starSpeed = led.speed >= 4 ? 1 : led.speed >= 2 ? 2 : 3
    const level = Math.round((Math.min(5, Math.max(1, led.brightness || 5)) / 5) * 255)
    switch (led.effect) {
      case 0:
        return [effect.none()]
      case RAZER_FX.static:
        // a "rainbow" static colour is what spectrum cycling is for
        return [led.rainbow ? effect.spectrum() : effect.static(color), brightness(level)]
      case RAZER_FX.breathing:
        return [led.rainbow ? effect.breathingRandom() : effect.breathing(color), brightness(level)]
      case RAZER_FX.spectrum:
        return [effect.spectrum(), brightness(level)]
      case RAZER_FX.wave:
        return [effect.wave(led.direction ? 2 : 1), brightness(level)]
      case RAZER_FX.reactive:
        return [effect.reactive(reactiveSpeed, color), brightness(level)]
      case RAZER_FX.starlight:
        return [led.rainbow ? effect.starlightRandom(starSpeed) : effect.starlight(starSpeed, color), brightness(level)]
      case RAZER_FX.custom:
        return [...this.frameReports(), brightness(level)]
      default:
        return [effect.spectrum(), brightness(level)]
    }
  }

  private customActive() {
    return decodeLed(this.state.led).effect === RAZER_FX.custom
  }

  /** The per-key colours as one packet per matrix row, then the effect that shows them. */
  frameReports(): Uint8Array[] {
    const rz = this.device.razer
    if (!rz) return []
    const grid = Array.from({ length: rz.rows }, () => new Uint8Array(rz.cols * 3))
    for (const k of KEYS) {
      // a key lights one cell; an underglow segment lights each of its cells
      const cells = rz.spans?.[k.id] ?? (rz.matrix[k.id] ? [rz.matrix[k.id]] : [])
      const o = k.id * 4
      for (const [row, col] of cells) grid[row]?.set([this.state.colors[o + 1], this.state.colors[o + 2], this.state.colors[o + 3]], col * 3)
    }
    return [...grid.map((row, i) => frameRow(i, 0, rz.cols - 1, row)), effect.custom()]
  }

  /** Only what changed: each setting is its own command. */
  settingsReports(before: RazerSettings, after: RazerSettings): Uint8Array[] {
    const rz = this.device.razer
    const out: Uint8Array[] = []
    const pollingOk = RAZER_POLLING.some((p) => p.value === after.polling && rz?.pollingRates.includes(p.hz))
    if (after.polling !== before.polling && pollingOk) out.push(settings.setPolling(after.polling))
    if (after.gameMode !== before.gameMode) out.push(settings.setGameMode(after.gameMode, rz?.gameStore ?? NOSTORE))
    if (after.gaming !== before.gaming && rz?.keyswitch) out.push(...settings.setKeyswitch(after.gaming))
    return out
  }

  async commit() {
    /* Razer applies every command immediately */
  }

  async command() {
    /* calibration / factory reset have no documented Razer command */
  }

  async close() {
    this.unsub()
    await this.transport.close()
  }
}

// ---------- demo / tests ----------

/** Answers like a Huntsman V2 and records every report. */
export class MockRazerTransport implements RazerTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()
  private polling = 0x08
  private gameMode = 0
  private typing = true

  constructor(device: DeviceDef) {
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.name }
  }

  async request(report: Uint8Array) {
    this.sent.push(report.slice())
    const reply = report.slice()
    reply[0] = STATUS.ok
    const [cls, id] = [report[6], report[7]]
    if (cls === 0x00 && id === 0x40) this.polling = report[9]
    if (cls === 0x00 && id === 0xc0) reply[9] = this.polling
    if (cls === 0x03 && id === 0x00 && report[9] === GAME_LED) this.gameMode = report[10]
    if (cls === 0x03 && id === 0x80) reply[10] = this.gameMode
    if (cls === 0x02 && id === 0x02) this.typing = report[9] === 0x14
    if (cls === 0x02 && id === 0x82) reply[9] = this.typing ? 0x14 : 0x00
    reply[88] = razerCrc(reply)
    return reply
  }

  async send(report: Uint8Array) {
    this.sent.push(report.slice())
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
