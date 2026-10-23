import {
  CHUNK,
  Cmd,
  READ_ORDER,
  REGIONS,
  SETTINGS_WRITE_LEN,
  buildCommand,
  buildPacket,
  parseReply,
  type ParsedReply,
  type RegionName,
} from './protocol'
import { log } from '../diag/log'
import { Emitter, type DeviceIdentity, type Transport } from './transport'

export type RegionData = Record<RegionName, Uint8Array>

const REPLY_TIMEOUT_MS = 1500
const MAX_ATTEMPTS = 3

/**
 * 0xFB packet streamed continuously (~3.6k/s, one per key) while calibration mode is on.
 * Verified on fw 1.25: [4..5] rest reading, [6..7] calibrated bottom (bit 15 flag),
 * [8..9] live sensor reading, [10..11] live travel in 0.01 mm, [12] full travel in 0.1 mm.
 */
export interface SensorEvent {
  key: number
  state: number
  rest: number
  bottom: number
  adc: number
  /** live travel, 0.01 mm */
  travel: number
  /** full travel, 0.01 mm */
  full: number
}

/**
 * High-level, serialized access to the keyboard.
 * Every transfer waits for the device to echo the command before the next chunk is sent,
 * and only one operation runs at a time, so writes can never interleave.
 */
/** What the app needs from a connected keyboard, whatever protocol it speaks. */
export interface KeyboardDriver {
  readonly name: string
  readonly identity: DeviceIdentity
  /** live sensor packets (calibration mode); never fires on boards without a sensor stream */
  readonly sensor: Emitter<SensorEvent>
  readonly disconnected: Emitter<void>
  readAll(onProgress?: (region: RegionName, index: number, total: number) => void): Promise<RegionData>
  readRegion(name: RegionName): Promise<Uint8Array>
  writeRegion(name: RegionName, data: Uint8Array): Promise<void>
  commit(): Promise<unknown>
  command(cmd: number, args?: number[]): Promise<void>
  close(): Promise<void>
}

/** Sonix HE driver (Fighting68 family). */
export class Keyboard implements KeyboardDriver {
  private queue: Promise<unknown> = Promise.resolve()
  private waiter: { cmd: number; offset: number; resolve: (r: ParsedReply) => void } | null = null
  private unsubs: Array<() => void> = []
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()

  readonly transport: Transport

  constructor(transport: Transport) {
    this.transport = transport
    this.unsubs.push(
      transport.onReport((raw) => this.handleReport(raw)),
      transport.onDisconnect(() => this.disconnected.emit()),
    )
  }

  get identity() {
    return this.transport.identity
  }

  get name() {
    return this.transport.name
  }

  /** FCC asked for calibration mode (live key travel) and hasn't ended it */
  private calibrating = false
  private strayStopped = 0
  private endedAt = 0

  private handleReport(raw: Uint8Array) {
    const reply = parseReply(raw)
    if (reply.cmd === Cmd.EventCalibration) {
      // a calibration stream FCC didn't start (left running by an earlier session, a crash, another app): the board
      // re-learns keys from every press while it's on, so stop it (at most once every few seconds)
      if (!this.calibrating) {
        // packets already on their way when FCC itself ended it aren't stray
        if (performance.now() - this.strayStopped > 3000 && performance.now() - this.endedAt > 1500) {
          this.strayStopped = performance.now()
          log.warn('sonix', 'the keyboard was in calibration mode without FCC asking: ending it')
          void this.transport.send(buildCommand(Cmd.CalibrationEnd)).catch(() => undefined)
        }
        return
      }
      this.sensor.emit({
        key: raw[2],
        state: raw[3],
        rest: raw[4] | (raw[5] << 8),
        bottom: (raw[6] | (raw[7] << 8)) & 0x7fff,
        adc: raw[8] | (raw[9] << 8),
        travel: raw[10] | (raw[11] << 8),
        full: (raw[12] || 34) * 10,
      })
      return
    }
    if (reply.cmd === Cmd.EventLink && raw[2] === 4) {
      this.disconnected.emit()
      return
    }
    // a reply echoes the request's command, length and offset (seen on a Fighting68, fw 1.25): matching the offset too
    // keeps a late reply to an earlier chunk (after a retry) from being taken for the next chunk's, which shifted a
    // whole region by one chunk
    if (this.waiter && this.waiter.cmd === reply.cmd && this.waiter.offset === reply.offset) {
      const w = this.waiter
      this.waiter = null
      w.resolve(reply)
    }
  }

  /** Send a packet and wait for an echo of its command byte, retrying like the official driver. */
  private async exchange(packet: Uint8Array): Promise<ParsedReply> {
    const cmd = packet[1]
    const offset = packet[3] | (packet[4] << 8)
    let lastErr: unknown
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const reply = new Promise<ParsedReply>((resolve, reject) => {
          const t = setTimeout(() => {
            this.waiter = null
            reject(new Error(`No reply to command 0x${cmd.toString(16)}`))
          }, REPLY_TIMEOUT_MS)
          this.waiter = {
            cmd,
            offset,
            resolve: (r) => {
              clearTimeout(t)
              resolve(r)
            },
          }
        })
        await this.transport.send(packet)
        return await reply
      } catch (e) {
        lastErr = e
      }
    }
    throw lastErr
  }

  private run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op)
    this.queue = next.catch(() => undefined)
    return next
  }

  readRegion(name: RegionName, onProgress?: (done: number, total: number) => void) {
    return this.run(async () => {
      const { read, size } = REGIONS[name]
      const buf = new Uint8Array(size)
      for (let off = 0; off < size; off += CHUNK) {
        const len = Math.min(CHUNK, size - off)
        const r = await this.exchange(buildPacket(read, off, new Uint8Array(len)))
        buf.set(r.payload.slice(0, len), off)
        onProgress?.(off + len, size)
        // Official driver stops reading macros at the first empty chunk past the 400-byte index.
        if (name === 'macros' && off + len > 400 && r.payload.every((b) => b === 0)) break
      }
      return buf
    })
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    const out = {} as RegionData
    for (const [i, name] of READ_ORDER.entries()) {
      onProgress?.(name, i, READ_ORDER.length)
      out[name] = await this.readRegion(name)
    }
    return out
  }

  writeRegion(name: RegionName, data: Uint8Array) {
    return this.run(async () => {
      const { write, size } = REGIONS[name]
      if (write === null) throw new Error(`${name} is read-only`)
      const len = name === 'settings' ? SETTINGS_WRITE_LEN : size
      if (data.length < len) throw new Error(`${name}: expected ${len} bytes, got ${data.length}`)
      for (let off = 0; off < len; off += CHUNK) {
        const chunk = data.slice(off, Math.min(off + CHUNK, len))
        await this.exchange(buildPacket(write, off, chunk))
      }
    })
  }

  /** "Apply" packet the official driver sends after RT / profile writes. */
  commit() {
    return this.run(() => this.exchange(buildPacket(Cmd.Commit, 0, [0, 0, 0, 0])))
  }

  /** Fire-and-forget single command (calibration, monitor toggles, reset). */
  command(cmd: number, args: number[] = []) {
    if (cmd === Cmd.CalibrationStart) this.calibrating = true
    if (cmd === Cmd.CalibrationEnd) {
      this.calibrating = false
      this.endedAt = performance.now()
    }
    return this.run(() => this.transport.send(buildCommand(cmd, args)))
  }

  /**
   * Which keys have a calibration (the stream's status flag), from a short calibration session: start, about a second
   * of the stream, end. Ending saves, but only what was pressed during it, and a press only ever deepens a key's bottom
   * (fw 1.25), so a check changes nothing. null while FCC already has calibration mode on (live travel).
   */
  async readCalibration(ms = 1000): Promise<Map<number, boolean> | null> {
    if (this.calibrating) return null
    const flags = new Map<number, boolean>()
    const off = this.sensor.on((e) => flags.set(e.key, e.state === 1))
    try {
      await this.command(Cmd.CalibrationStart)
      await new Promise((r) => setTimeout(r, ms))
    } finally {
      off()
      await this.command(Cmd.CalibrationEnd)
    }
    return flags
  }

  async close() {
    this.unsubs.forEach((u) => u())
    await this.transport.close()
  }
}
