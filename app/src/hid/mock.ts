import dump from './demo-dump.json'
import { CHUNK, Cmd, HEADER_LEN, PACKET_LEN, REGIONS } from './protocol'
import { KEY_IDS } from '../data/layout'
import { Emitter, type Transport } from './transport'

/** In-memory keyboard seeded from a real device dump. Lets the UI run with no hardware attached. */
export class MockTransport implements Transport {
  readonly name = 'Fighting68 HE (demo)'
  readonly identity = { vendorId: 0x0c45, productId: 0x8030, productName: 'Fighting68' }
  private mem = new Map<number, Uint8Array>()
  private reports = new Emitter<Uint8Array>()
  private disconnects = new Emitter<void>()
  private monitor: ReturnType<typeof setInterval> | null = null

  constructor() {
    const d = dump as Record<string, number[]>
    for (const def of Object.values(REGIONS)) {
      const buf = new Uint8Array(def.size)
      buf.set(d[def.read.toString(16)] ?? [])
      this.mem.set(def.read, buf)
      if (def.write !== null) this.mem.set(def.write, buf)
    }
  }

  async send(p: Uint8Array) {
    const cmd = p[1]
    if (cmd === Cmd.CalibrationStart) this.startMonitor()
    if (cmd === Cmd.CalibrationEnd) this.stopMonitor()
    const len = Math.min(p[2], CHUNK)
    const off = p[3] | (p[4] << 8)
    const reply = new Uint8Array(PACKET_LEN)
    reply.set(p.slice(0, HEADER_LEN))
    const region = this.mem.get(cmd)
    if (region) {
      const isWrite = cmd >= 0x20
      if (isWrite) region.set(p.slice(HEADER_LEN, HEADER_LEN + len), off)
      else reply.set(region.slice(off, off + len), HEADER_LEN)
    }
    setTimeout(() => this.reports.emit(reply), 2)
  }

  /** Streams sensor packets for every key like the real board does in calibration mode. */
  private startMonitor() {
    this.stopMonitor()
    const ids = KEY_IDS
    const t0 = performance.now()
    this.monitor = setInterval(() => {
      const t = (performance.now() - t0) / 1000
      for (const id of ids) {
        const phase = { 34: 0, 49: 1.3, 50: 2.6, 51: 3.9, 83: 5 }[id]
        const travel = phase === undefined ? 0 : Math.round(Math.max(0, Math.sin(t * 2.2 + phase)) ** 1.5 * 330)
        const r = new Uint8Array(PACKET_LEN)
        r[0] = 0x55
        r[1] = Cmd.EventCalibration
        r[2] = id
        r[3] = 1
        r[10] = travel & 0xff
        r[11] = travel >> 8
        r[12] = 34
        this.reports.emit(r)
      }
    }, 20)
  }

  private stopMonitor() {
    if (this.monitor) clearInterval(this.monitor)
    this.monitor = null
  }

  onReport(l: (d: Uint8Array) => void) {
    return this.reports.on(l)
  }
  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }
  async close() {
    this.stopMonitor()
  }
}
