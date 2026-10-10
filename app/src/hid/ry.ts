// RongYuan RY5088 boards (MonsGeek FUN60 / FUN68 / M1 V5 HE, Akko, …). Protocol notes: docs/PROTOCOL-RY.md.
//
// Every message is a 64-byte feature report (report id 0): [cmd, params…, checksum at byte 7 (lighting: byte 8), data…].
// GET commands echo their command byte; paged reads (key matrix, macros, per-key tables, user picture) answer with raw
// 64-byte pages. Settings live per onboard profile; FCC works on the profile that is active when the board connects.
//
// FCC's pages speak the Sonix region format, so this driver translates both ways. Writes are diffed against what the
// app last saw and batched per tick, so one edit sends only the commands for the keys that changed. Anything FCC can't
// show (combo keys, "while held" macros, rapid-fire toggles) reads back as "?" and is left untouched on the keyboard.

import { KEYS } from '../data/layout'
import { ryModeIndex, type DeviceDef } from '../devices/registry'
import {
  CUSTOM_EFFECT,
  DKS_POINT_MAX,
  DKS_POINT_MIN,
  MACRO_REGION,
  RT_LIMITS,
  decodeBinding,
  decodeDks,
  decodeLed,
  decodeMacros,
  decodeRT,
  encodeBinding,
  encodeLed,
  encodeMacros,
  withDks,
  type Binding,
  type DksAction,
  type DksSlot,
  type MacroEvent,
} from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { Cmd, REGIONS, ResetArg, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

// ---------- wire ----------

export const RY_REPORT_LEN = 64

export const C = {
  SET_RESET: 0x01,
  SET_REPORT: 0x03,
  SET_DEBOUNCE: 0x06,
  SET_LEDPARAM: 0x07,
  SET_KBOPTION: 0x09,
  SET_KEYMATRIX: 0x0a,
  SET_MACRO: 0x0b,
  SET_USERPIC: 0x0c,
  SET_SLEEPTIME: 0x11,
  SET_MULTI_MAGNETISM: 0x65,
  GET_REPORT: 0x83,
  GET_PROFILE: 0x84,
  GET_DEBOUNCE: 0x86,
  GET_LEDPARAM: 0x87,
  GET_KBOPTION: 0x89,
  GET_KEYMATRIX: 0x8a,
  GET_MACRO: 0x8b,
  GET_USERPIC: 0x8c,
  GET_USB_VERSION: 0x8f,
  GET_SLEEPTIME: 0x91,
  GET_MULTI_MAGNETISM: 0xe5,
  GET_FEATURE_LIST: 0xe6,
} as const

/** The only commands FCC ever sends. Bootloader, flash erase, SKU, screen and firmware-update commands are refused. */
const ALLOWED = new Set<number>(Object.values(C))

/** Per-key table ids for SET/GET_MULTI_MAGNETISM. */
export const MAG = {
  PRESS: 0,
  LIFT: 1,
  RT_PRESS: 2,
  RT_LIFT: 3,
  DKS_TRAVEL: 4,
  MT_TIME: 5,
  MODE: 7,
  DKS_MODES_SET: 8,
  SNAP: 9,
  DKS_MODES_GET: 10,
  LIVE_TRAVEL: 254,
} as const

export const MODE = { NORMAL: 0, DKS: 2, MT: 3, TGL_HOLD: 4, TGL_DOTS: 5, SNAP: 7, RT: 0x80 } as const

const MAX_POSITIONS = 128
const MAX_LAYERS = 4
const USERPIC_BYTES = 126 * 3
const MACRO_BYTES = 256
const SNAP_NONE = 0xff
/** Sonix-format placeholder for a key FCC can't show: decodes as "unknown" and is never written. */
const PLACEHOLDER: [number, number, number, number] = [0xfe, 0, 0, 0]

export type Checksum = 'bit7' | 'bit8' | 'none'

/** Builds a 64-byte command: bytes from index 0, checksum at 7 (bit7) or 8 (bit8). */
export function frame(bytes: ArrayLike<number>, sum: Checksum = 'bit7'): Uint8Array {
  const out = new Uint8Array(RY_REPORT_LEN)
  out.set(Array.from(bytes).slice(0, RY_REPORT_LEN))
  if (sum === 'bit7') out[7] = 255 - (out.slice(0, 7).reduce((a, b) => a + b, 0) & 0xff)
  if (sum === 'bit8') out[8] = 255 - (out.slice(0, 8).reduce((a, b) => a + b, 0) & 0xff)
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
const u16le = (b: ArrayLike<number>, o: number) => b[o] | (b[o + 1] << 8)
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i])

/** A pipe that carries RY feature reports. */
export interface RyTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  /** sends 64 bytes as feature report 0 */
  sendReport(data: Uint8Array): Promise<void>
  /** reads feature report 0 (64 bytes) */
  receiveReport(): Promise<Uint8Array>
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

/** Send/receive with the official app's pacing; one exchange at a time. */
class Link {
  private queue: Promise<unknown> = Promise.resolve()
  readonly transport: RyTransport
  constructor(transport: RyTransport) {
    this.transport = transport
  }

  run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op)
    this.queue = next.catch(() => undefined)
    return next
  }

  async send(bytes: ArrayLike<number>, sum: Checksum = 'bit7', gap = 10) {
    if (!ALLOWED.has(bytes[0])) throw new Error(`refusing to send command 0x${bytes[0].toString(16)}`)
    if (gap) await sleep(gap)
    await this.transport.sendReport(frame(bytes, sum))
  }

  private async read(gap: number) {
    if (gap) await sleep(gap)
    const r = await this.transport.receiveReport()
    // some stacks hand back the report id as well
    return r.length === RY_REPORT_LEN + 1 ? r.slice(1) : r
  }

  /** GET with command echo; retried when an old answer comes back first. */
  async query(bytes: ArrayLike<number>, gap = 10) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.send(bytes, 'bit7', gap)
      const r = await this.read(gap)
      if (r[0] === bytes[0]) return r
    }
    throw new Error(`no answer to command 0x${bytes[0].toString(16)}`)
  }

  /** One page of a paged read (no echo: the page is the data). */
  async page(bytes: ArrayLike<number>, gap = 10) {
    for (let attempt = 0; attempt < 4; attempt++) {
      await this.send(bytes, 'bit7', gap)
      const r = await this.read(gap)
      if (r.length === RY_REPORT_LEN) return r
    }
    throw new Error(`paged read of 0x${bytes[0].toString(16)} failed`)
  }
}

// ---------- key entries (4 bytes per matrix position) ----------

type Entry = [number, number, number, number]
const ZERO: Entry = [0, 0, 0, 0]
const MOUSE_BUTTONS = [1, 2, 4, 8, 16] // FCC masks for RY 240..244 (left, right, middle, back, forward)

/** HID usage of a plain key entry, 0 for "nothing", null for anything else. */
function plainHid(e: ArrayLike<number>) {
  if (e[0] === 0 && e[1] === 0 && e[3] === 0) return e[2]
  return null
}

// ---------- macros ----------

interface RyMacro {
  repeat: number
  events: MacroEvent[]
  /** mouse moves etc. FCC can't show; the macro is only rewritten when the user edits it */
  lossy: boolean
}

export function decodeRyMacro(buf: Uint8Array): RyMacro {
  const repeat = u16le(buf, 0)
  const events: MacroEvent[] = []
  let lossy = false
  let i = 2
  while (i + 2 <= buf.length) {
    const s = buf.slice(i, i + 4)
    if (s.length < 2 || (s[0] === 0 && s[1] === 0 && (s[2] ?? 0) === 0 && (s[3] ?? 0) === 0)) break
    if (s[0] === 0xf9) {
      // mouse move: [F9, delay>>1 | 0, dx, dy, (delay u16)]
      lossy = true
      i += s[1] ? 4 : 6
      continue
    }
    const down = s[1] > 127
    let delay: number
    if (s[1] & 0x7f) {
      delay = s[1] & 0x7f
      i += 2
    } else {
      delay = u16le(s, 2)
      i += 4
    }
    if (s[0] >= 240 && s[0] <= 244) events.push({ code: MOUSE_BUTTONS[s[0] - 240], down, mouse: true, delay })
    else if (s[0] >= 4 && s[0] <= 239) events.push({ code: s[0], down, mouse: false, delay })
    else lossy = true
  }
  return { repeat, events, lossy }
}

/** RY macro bytes (without padding). Throws when it doesn't fit a slot. */
export function encodeRyMacro(events: MacroEvent[], repeat: number): Uint8Array {
  const out: number[] = [repeat & 0xff, (repeat >> 8) & 0xff]
  for (const e of events) {
    const code = e.mouse ? 240 + Math.max(0, MOUSE_BUTTONS.indexOf(e.code)) : e.code & 0xff
    // a zero delay would make the firmware read the next event's bytes as a delay
    const delay = clamp(e.delay, 1, 65535)
    if (delay <= 127) out.push(code, (e.down ? 0x80 : 0) | delay)
    else out.push(code, e.down ? 0x80 : 0, delay & 0xff, delay >> 8)
  }
  // keep 4 zero bytes for the terminator
  if (out.length + 4 > MACRO_BYTES) throw new Error('This macro is too long for the keyboard (about 60 key presses at most)')
  return Uint8Array.from(out)
}

// ---------- driver ----------

interface RyState {
  profile: number
  /** precision: raw units per mm */
  factor: number
  /** travel values looked sane; performance writes are blocked otherwise */
  unitsOk: boolean
  /** key matrix sub-layers (null = not read) */
  km: (Uint8Array | null)[]
  mode: Uint8Array
  press: Uint16Array
  lift: Uint16Array
  rtPress: Uint16Array
  rtLift: Uint16Array
  dksTravel: Uint16Array
  mtTime: Uint8Array
  snap: Uint8Array
  /** [binding row][position] */
  dksModes: Uint8Array[]
  led: Uint8Array
  pic: Uint8Array
  macros: (Uint8Array | null)[]
  polling: number
  debounce: number
  kbOption: Uint8Array
  sleep: Uint8Array
}

export interface RyProbe {
  deviceId: number
  version: number
}

/** RY settings, kept in FCC's 32-byte settings region in this layout. */
export interface RySettings {
  /** 0 = 8000 Hz … 6 = 125 Hz */
  polling: number
  debounce: number
  /** RT stability level 0-5 (25 ms steps) */
  rtStability: number
  antiMistouch: boolean
  wasdSwap: boolean
}
const SETTINGS_MAGIC = 0xa5

export function decodeRySettings(s: Uint8Array): RySettings {
  return { polling: s[1], debounce: s[2], rtStability: s[3], antiMistouch: s[4] === 1, wasdSwap: s[5] === 1 }
}

export function encodeRySettings(prev: Uint8Array, v: RySettings): Uint8Array {
  const out = prev.slice()
  out[0] = SETTINGS_MAGIC
  out[1] = clamp(v.polling, 0, 6)
  out[2] = clamp(v.debounce, 0, 50)
  out[3] = clamp(v.rtStability, 0, 5)
  out[4] = v.antiMistouch ? 1 : 0
  out[5] = v.wasdSwap ? 1 : 0
  return out
}

export const RY_POLLING = [
  { value: 6, label: '125 Hz' },
  { value: 4, label: '500 Hz' },
  { value: 3, label: '1000 Hz' },
  { value: 2, label: '2000 Hz' },
  { value: 1, label: '4000 Hz' },
  { value: 0, label: '8000 Hz' },
]

export class RyKeyboard implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  private link: Link
  private device: DeviceDef
  private probeInfo: RyProbe
  private st!: RyState
  /** regions as the app last saw them (what writes are diffed against) */
  private fcc!: RegionData
  private pending = new Map<RegionName, Uint8Array>()
  private live = false
  private unsub: () => void

  constructor(transport: RyTransport, device: DeviceDef, probe: RyProbe) {
    if (!device.ry) throw new Error('not an RY5088 board')
    this.link = new Link(transport)
    this.device = device
    this.probeInfo = probe
    this.unsub = transport.onDisconnect(() => {
      this.live = false
      this.disconnected.emit()
    })
  }

  /** Asks the board which model it is (command 0x8F). */
  static async probe(transport: RyTransport): Promise<RyProbe> {
    const link = new Link(transport)
    const r = await link.query([C.GET_USB_VERSION])
    return { deviceId: (r[1] | (r[2] << 8) | (r[3] << 16) | (r[4] << 24)) >>> 0, version: u16le(r, 7) }
  }

  get name() {
    return this.link.transport.name
  }

  /** what the board said about itself when it connected */
  get probe() {
    return this.probeInfo
  }

  /** the model this driver translates for */
  get model() {
    return this.device
  }

  /** Same connection, translated for another model (when the user corrects the detected one). */
  forDevice(device: DeviceDef) {
    this.live = false
    this.unsub()
    return new RyKeyboard(this.link.transport, device, this.probeInfo)
  }

  get identity() {
    return this.link.transport.identity
  }

  private get ry() {
    return this.device.ry!
  }

  private get positions() {
    return Math.min(this.ry.positions, MAX_POSITIONS)
  }

  private defaultEntry(pos: number): Entry {
    return Array.from(this.ry.matrix.slice(pos * 4, pos * 4 + 4)) as Entry
  }

  /** Positions that carry a key on this model. */
  private keyPositions() {
    const out: number[] = []
    for (let p = 0; p < this.positions; p++) if (this.defaultEntry(p).some((b) => b)) out.push(p)
    return out
  }

  // ---------- reading ----------

  private async magTable(sub: number, pages: number) {
    const out: number[] = []
    for (let page = 0; page < pages; page++) out.push(...(await this.link.page([C.GET_MULTI_MAGNETISM, sub, 1, page])))
    return Uint8Array.from(out)
  }

  private async u16Table(sub: number) {
    const raw = await this.magTable(sub, 4)
    const out = new Uint16Array(MAX_POSITIONS)
    for (let p = 0; p < MAX_POSITIONS; p++) out[p] = u16le(raw, p * 2)
    return out
  }

  private async keyLayer(layer: number) {
    const out: number[] = []
    for (let page = 0; page < 8; page++) out.push(...(await this.link.page([C.GET_KEYMATRIX, this.st.profile, 0xff, page, layer])))
    return Uint8Array.from(out.slice(0, MAX_POSITIONS * 4))
  }

  private async readMacro(index: number) {
    const out: number[] = []
    for (let page = 0; page < 4; page++) {
      out.push(...(await this.link.page([C.GET_MACRO, index, page])))
      // stop once the event list has ended
      if (endsWithin(Uint8Array.from(out))) break
    }
    return Uint8Array.from(out.slice(0, MACRO_BYTES))
  }

  private precision(features: Uint8Array | null) {
    if (features && features[1] === 0xaa) return { 0: 100, 1: 200, 2: 1000 }[features[2]] ?? 100
    const v = this.probeInfo.version
    return v >= 1280 ? 200 : v >= 768 ? 100 : 10
  }

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    return this.link.run(async () => {
      const steps = 12
      let step = 0
      const tick = (r: RegionName) => onProgress?.(r, ++step, steps)

      let features: Uint8Array | null = null
      try {
        features = await this.link.query([C.GET_FEATURE_LIST])
      } catch {
        features = null
      }
      const profile = (await this.link.query([C.GET_PROFILE]))[1]
      const st: RyState = {
        profile: profile < this.ry.profiles ? profile : 0,
        factor: this.precision(features),
        unitsOk: true,
        km: [null, null, null, null],
        mode: new Uint8Array(MAX_POSITIONS),
        press: new Uint16Array(MAX_POSITIONS),
        lift: new Uint16Array(MAX_POSITIONS),
        rtPress: new Uint16Array(MAX_POSITIONS),
        rtLift: new Uint16Array(MAX_POSITIONS),
        dksTravel: new Uint16Array(MAX_POSITIONS),
        mtTime: new Uint8Array(MAX_POSITIONS),
        snap: new Uint8Array(MAX_POSITIONS).fill(SNAP_NONE),
        dksModes: [0, 1, 2, 3].map(() => new Uint8Array(MAX_POSITIONS)),
        led: new Uint8Array(8),
        pic: new Uint8Array(USERPIC_BYTES),
        macros: [],
        polling: 3,
        debounce: 0,
        kbOption: new Uint8Array(6),
        sleep: new Uint8Array(8),
      }
      this.st = st
      tick('info')

      st.mode = (await this.magTable(MAG.MODE, 2)).slice(0, MAX_POSITIONS)
      const base = (p: number) => st.mode[p] & 0x7f
      const has = (m: number) => this.keyPositions().some((p) => base(p) === m)
      tick('keys')
      st.km[0] = await this.keyLayer(0)
      if (has(MODE.DKS) || has(MODE.MT)) for (let l = 1; l < MAX_LAYERS; l++) st.km[l] = await this.keyLayer(l)
      tick('keys')

      st.press = await this.u16Table(MAG.PRESS)
      st.lift = await this.u16Table(MAG.LIFT)
      if (this.keyPositions().some((p) => st.mode[p] & MODE.RT)) {
        st.rtPress = await this.u16Table(MAG.RT_PRESS)
        st.rtLift = await this.u16Table(MAG.RT_LIFT)
      }
      tick('rt')
      if (has(MODE.DKS)) {
        st.dksTravel = await this.u16Table(MAG.DKS_TRAVEL)
        const modes = await this.magTable(MAG.DKS_MODES_GET, 8)
        st.dksModes = [0, 1, 2, 3].map((g) => modes.slice(g * MAX_POSITIONS, (g + 1) * MAX_POSITIONS))
      }
      if (has(MODE.MT)) st.mtTime = (await this.magTable(MAG.MT_TIME, 2)).slice(0, MAX_POSITIONS)
      if (has(MODE.SNAP)) st.snap = (await this.magTable(MAG.SNAP, 2)).slice(0, MAX_POSITIONS)
      tick('dks')

      // the travel units must make sense before FCC writes any (a wrong factor would be off by 2-10x)
      const travelMm = RT_LIMITS.travel / 100
      st.unitsOk = this.keyPositions().every((p) => {
        const mm = st.press[p] / st.factor
        return mm > 0 && mm <= travelMm * 1.25
      })

      st.led = (await this.link.query([C.GET_LEDPARAM])).slice(0, 8)
      tick('led')
      const pic: number[] = []
      for (let page = 0; page < 6; page++) pic.push(...(await this.link.page([C.GET_USERPIC, 0, 0xff, page])))
      st.pic = Uint8Array.from(pic.slice(0, USERPIC_BYTES))
      tick('colors')

      // macros: every slot a key points at, plus the run of slots from 0
      const wanted = new Set<number>()
      for (const layer of st.km) {
        if (!layer) continue
        for (let p = 0; p < MAX_POSITIONS; p++) if (layer[p * 4] === 9 && layer[p * 4 + 2] < this.ry.maxMacro) wanted.add(layer[p * 4 + 2])
      }
      for (let i = 0; i < this.ry.maxMacro; i++) {
        const m = await this.readMacro(i)
        st.macros[i] = m
        if (!decodeRyMacro(m).events.length && ![...wanted].some((w) => w > i)) break
      }
      for (const i of wanted) if (!st.macros[i]) st.macros[i] = await this.readMacro(i)
      tick('macros')

      st.polling = (await this.link.query([C.GET_REPORT]))[2]
      st.debounce = (await this.link.query([C.GET_DEBOUNCE]))[1]
      st.kbOption = (await this.link.query([C.GET_KBOPTION])).slice(0, 6)
      st.sleep = (await this.link.query([C.GET_SLEEPTIME])).slice(8, 16)
      tick('settings')

      this.fcc = this.toFcc()
      return this.copy(this.fcc)
    })
  }

  async readRegion(name: RegionName) {
    return this.fcc[name].slice()
  }

  private copy(r: RegionData) {
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  // ---------- RY -> FCC ----------

  private mm100(raw: number) {
    return Math.round((raw / this.st.factor) * 100)
  }
  private raw100(v: number) {
    return Math.round((v / 100) * this.st.factor)
  }
  private mm10(raw: number) {
    return Math.round((raw / this.st.factor) * 10)
  }
  private raw10(v: number) {
    return Math.round((v / 10) * this.st.factor)
  }

  private entry(layer: number, pos: number): Entry | null {
    const l = this.st.km[layer]
    return l ? (Array.from(l.slice(pos * 4, pos * 4 + 4)) as Entry) : null
  }

  private macroRepeat(index: number) {
    const m = this.st.macros[index]
    return m ? u16le(m, 0) : 1
  }

  /** A normal key entry as an FCC binding; null when FCC can't show it. */
  private toBinding(pos: number, e: Entry): Binding | null {
    if (same(e, this.defaultEntry(pos))) return { type: 'default' }
    const [t, a, b, c] = e
    if (t === 0 && c === 0) return { type: 'key', mods: a, code: b }
    if (t === 3 && a === 0) return { type: 'media', usage: b | (c << 8) }
    if (t === 1 && a === 0 && b >= 240 && b <= 244 && c === 0) return { type: 'mouse', button: MOUSE_BUTTONS[b - 240] }
    if (t === 1 && a === 0 && b === 245 && (c === 1 || c === 255)) return { type: 'wheel', dir: c as 1 | 255 }
    if (t === 9 && c === 0 && b < this.ry.maxMacro) {
      if (a === 1) return { type: 'macro', index: b, mode: 2, repeat: 0 }
      if (a === 0) {
        const r = this.macroRepeat(b)
        return r > 1 ? { type: 'macro', index: b, mode: 1, repeat: Math.min(r, 255) } : { type: 'macro', index: b, mode: 0, repeat: 0 }
      }
    }
    return null
  }

  private toFcc(): RegionData {
    const st = this.st
    const out = Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, new Uint8Array(r.size)])) as RegionData

    // info: macro "capacity" is per macro on RY, so FCC's total check is switched off; the driver checks each macro
    const info = out.info
    info.set([MACRO_REGION & 0xff, (MACRO_REGION >> 8) & 0x7f], 2)
    info.set([this.identity.vendorId & 0xff, this.identity.vendorId >> 8, this.identity.productId & 0xff, this.identity.productId >> 8], 4)
    info[8] = this.probeInfo.version & 0xff
    info[9] = this.probeInfo.version >> 8

    out.settings.set(
      encodeRySettings(out.settings, {
        polling: st.polling,
        debounce: st.debounce,
        rtStability: st.kbOption[4] > 5 ? 0 : st.kbOption[4],
        antiMistouch: st.kbOption[3] === 1,
        wasdSwap: st.kbOption[5] === 1,
      }),
    )

    // keys, DKS and snap pairs
    let slot = 1
    for (const pos of this.keyPositions()) {
      const base = st.mode[pos] & 0x7f
      const l0 = this.entry(0, pos) ?? this.defaultEntry(pos)
      let b: Binding | null = null
      if (base === MODE.DKS && slot < 64) {
        const keys = [0, 1, 2, 3].map((l) => plainHid(this.entry(l, pos) ?? ZERO) ?? 0) as DksSlot['keys']
        const actions = [0, 1, 2, 3].map((m) =>
          [0, 1, 2, 3].map((j): DksAction => {
            const v = (st.dksModes[m][pos] >> (j * 2)) & 3
            return v === 0 ? 'none' : v === 1 ? 'tap' : 'hold'
          }),
        )
        const pt = (raw: number) => clamp(this.mm10(raw), DKS_POINT_MIN, DKS_POINT_MAX)
        const dks: DksSlot = { points: [pt(st.dksTravel[pos]), pt(st.press[pos]), pt(st.press[pos]), pt(st.dksTravel[pos])], keys, actions }
        out.dks = withDks(out.dks, slot, dks)
        b = { type: 'dks', slot: slot++ }
      } else if (base === MODE.MT) {
        const hold = plainHid(l0)
        const tap = plainHid(this.entry(1, pos) ?? ZERO)
        if (hold !== null && tap !== null) b = { type: 'modtap', hold, tap, ms: st.mtTime[pos] * 10 }
      } else if (base === MODE.TGL_HOLD) {
        const code = plainHid(l0)
        if (code !== null) b = { type: 'toggle', code }
      } else if (base === MODE.SNAP) {
        const partner = st.snap[pos]
        if (partner < this.positions && (st.mode[partner] & 0x7f) === MODE.SNAP && st.snap[partner] === pos) {
          const [a, c] = pos < partner ? [pos, partner] : [partner, pos]
          b = { type: 'socd', mode: 3, key1: this.hidAt(a), key2: this.hidAt(c) }
        } else b = this.toBinding(pos, l0)
      } else if (base === MODE.NORMAL) b = this.toBinding(pos, l0)
      out.keys.set(b ? encodeBinding(b) : PLACEHOLDER, pos * 4)

      // rapid trigger, in FCC's 0.01 mm
      const o = pos * 8
      const act = this.mm100(st.press[pos])
      const rt = (st.mode[pos] & MODE.RT) !== 0
      out.rt[o + 2] = act & 0xff
      out.rt[o + 3] = act >> 8
      if (rt) {
        const p = Math.max(1, this.mm100(st.rtPress[pos]))
        const r = Math.max(1, this.mm100(st.rtLift[pos]))
        out.rt.set([p & 0xff, p >> 8, r & 0xff, r >> 8], o + 4)
      }

      // per-key colour
      if (pos < 126) out.colors.set([pos, st.pic[pos * 3], st.pic[pos * 3 + 1], st.pic[pos * 3 + 2]], pos * 4)
    }

    out.led.set(this.ledToFcc())

    // macros (FCC's region has a total size; anything past it is left off the list but kept on the keyboard)
    const list = st.macros.map((m) => (m ? decodeRyMacro(m).events : []))
    while (list.length && !list[list.length - 1].length) list.pop()
    for (let n = list.length; n >= 0; n--) {
      try {
        out.macros.set(encodeMacros(list.slice(0, n)))
        break
      } catch {
        /* drop the last one and retry */
      }
    }
    return out
  }

  private hidAt(pos: number) {
    return plainHid(this.defaultEntry(pos)) ?? 0
  }

  private ledToFcc() {
    const [, mode, speedWire, bright, option, r, g, b] = this.st.led
    const L = this.ry.light
    const white = r === 0xfa && g === 0xfa && b === 0xfa
    return encodeLed(new Uint8Array(16), {
      effect: mode,
      r: white ? 255 : r,
      g: white ? 255 : g,
      b: white ? 255 : b,
      rainbow: (option & 0x0f) === L.dazzle,
      brightness: clamp(bright, 0, 4) + 1,
      speed: clamp(L.maxSpeed - speedWire, 0, L.maxSpeed) + 1,
      direction: option >> 4 ? 1 : 0,
    })
  }

  // ---------- FCC -> RY ----------

  writeRegion(name: RegionName, data: Uint8Array) {
    this.pending.set(name, data.slice())
    // regions changed together (keys + dks, …) arrive back to back; translate them as one batch
    return this.link.run(async () => {
      await sleep(0)
      await this.flush()
    })
  }

  private async flush() {
    if (!this.pending.size) return
    const p = new Map(this.pending)
    this.pending.clear()
    const old = this.fcc
    const next = { ...old, ...Object.fromEntries(p) } as RegionData
    const changed = (r: RegionName) => p.has(r) && !same(p.get(r)!, old[r])

    if ((changed('rt') || changed('dks')) && !this.st.unitsOk)
      throw new Error("FCC couldn't confirm this keyboard's travel units, so actuation and DKS changes are disabled. Please send a board report.")

    if (changed('macros')) await this.writeMacros(old.macros, next.macros)
    if (changed('keys') || changed('dks') || changed('rt')) await this.writeKeys(old, next)
    if (changed('led')) await this.writeLed(next.led)
    if (changed('colors')) await this.writeColors(next.colors)
    if (changed('settings')) await this.writeSettings(old.settings, next.settings)
    this.fcc = next
  }

  private async writeMacros(prev: Uint8Array, next: Uint8Array) {
    const a = decodeMacros(prev)
    const b = decodeMacros(next)
    if (b.length > this.ry.maxMacro) throw new Error(`This keyboard holds ${this.ry.maxMacro} macros at most`)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (JSON.stringify(a[i] ?? []) === JSON.stringify(b[i] ?? [])) continue
      await this.sendMacro(i, encodeRyMacro(b[i] ?? [], b[i]?.length ? Math.max(1, this.macroRepeat(i)) : 0))
    }
  }

  private async sendMacro(index: number, bytes: Uint8Array) {
    if (index < 0 || index >= Math.min(this.ry.maxMacro, 64)) throw new Error('macro slot out of range')
    const buf = new Uint8Array(Math.ceil((bytes.length + 4) / 56) * 56)
    buf.set(bytes)
    const pages = buf.length / 56
    for (let page = 0; page < pages; page++) {
      await this.link.send([C.SET_MACRO, index, page, 56, page === pages - 1 ? 1 : 0, 0, 0, 0, ...buf.slice(page * 56, page * 56 + 56)])
    }
    await sleep(100)
    const stored = new Uint8Array(MACRO_BYTES)
    stored.set(bytes)
    this.st.macros[index] = stored
  }

  private async writeKeys(old: RegionData, next: RegionData) {
    const st = this.st
    const km: Map<string, Entry> = new Map() // "layer:pos" -> entry
    const mag = new Map<number, Map<number, number[]>>() // table -> pos -> bytes
    const put = (sub: number, pos: number, bytes: number[]) => {
      if (!mag.has(sub)) mag.set(sub, new Map())
      mag.get(sub)!.set(pos, bytes)
    }
    const setEntry = (layer: number, pos: number, e: Entry) => {
      const cur = this.entry(layer, pos)
      if (!cur || !same(cur, e)) km.set(`${layer}:${pos}`, e)
    }
    const setU16 = (sub: number, arr: Uint16Array, pos: number, v: number) => {
      v = clamp(v, 0, 0xffff)
      if (arr[pos] !== v) put(sub, pos, [v & 0xff, v >> 8])
    }
    const repeats = new Map<number, number>()

    for (const pos of this.keyPositions()) {
      const bOld = decodeBinding(old.keys, pos)
      const bNew = decodeBinding(next.keys, pos)
      const dksOld = bOld.type === 'dks' ? decodeDks(old.dks, bOld.slot) : null
      const dksNew = bNew.type === 'dks' ? decodeDks(next.dks, bNew.slot) : null
      const keyChanged = !same(old.keys.slice(pos * 4, pos * 4 + 4), next.keys.slice(pos * 4, pos * 4 + 4)) || JSON.stringify(dksOld) !== JSON.stringify(dksNew)
      const rtOld = decodeRT(old.rt, pos)
      const rtNew = decodeRT(next.rt, pos)
      const rtChanged = JSON.stringify(rtOld) !== JSON.stringify(rtNew)
      if (!keyChanged && !rtChanged) continue

      const curBase = st.mode[pos] & 0x7f
      let base = curBase
      if (keyChanged && bNew.type !== 'unknown') {
        const leaving = curBase !== MODE.NORMAL && curBase !== MODE.SNAP
        switch (bNew.type) {
          case 'dks': {
            base = MODE.DKS
            const s = dksNew!
            for (let l = 0; l < MAX_LAYERS; l++) setEntry(l, pos, s.keys[l] ? [0, 0, s.keys[l], 0] : ZERO)
            const modes = s.actions.map((row) => row.reduce((acc, a, j) => acc | ((a === 'tap' ? 1 : a === 'hold' ? 2 : 0) << (j * 2)), 0))
            const curModes = st.dksModes.map((m) => m[pos])
            if (!same(modes, curModes)) put(MAG.DKS_MODES_SET, pos, modes)
            setU16(MAG.DKS_TRAVEL, st.dksTravel, pos, this.raw10(s.points[0]))
            setU16(MAG.PRESS, st.press, pos, this.raw10(s.points[1]))
            break
          }
          case 'modtap':
            base = MODE.MT
            setEntry(0, pos, [0, 0, bNew.hold, 0])
            setEntry(1, pos, [0, 0, bNew.tap, 0])
            if (st.mtTime[pos] !== clamp(bNew.ms / 10, 1, 255)) put(MAG.MT_TIME, pos, [clamp(bNew.ms / 10, 1, 255)])
            break
          case 'toggle':
            base = MODE.TGL_HOLD
            setEntry(0, pos, [0, 0, bNew.code, 0])
            break
          case 'socd': {
            base = MODE.SNAP
            const partner = this.keyPositions().find((o) => o !== pos && same(next.keys.slice(o * 4, o * 4 + 4), next.keys.slice(pos * 4, pos * 4 + 4)))
            if (partner === undefined) {
              base = MODE.NORMAL
              break
            }
            if (st.snap[pos] !== partner) put(MAG.SNAP, pos, [partner])
            if (leaving) for (let l = 0; l < MAX_LAYERS; l++) setEntry(l, pos, l === 0 ? this.defaultEntry(pos) : ZERO)
            break
          }
          default: {
            base = MODE.NORMAL
            const e = this.fromBinding(pos, bNew)
            if (!e) break
            setEntry(0, pos, e)
            if (leaving) for (let l = 1; l < MAX_LAYERS; l++) setEntry(l, pos, ZERO)
            if (bNew.type === 'macro' && bNew.mode !== 2) repeats.set(bNew.index, bNew.mode === 1 ? clamp(bNew.repeat, 1, 255) : 1)
          }
        }
        if (curBase === MODE.SNAP && base !== MODE.SNAP && st.snap[pos] !== SNAP_NONE) put(MAG.SNAP, pos, [SNAP_NONE])
      }

      // rapid trigger (actuation of DKS keys comes from their trigger points above)
      if (rtChanged) {
        if (rtNew.actuation !== rtOld.actuation && base !== MODE.DKS) {
          setU16(MAG.PRESS, st.press, pos, this.raw100(rtNew.actuation))
          setU16(MAG.LIFT, st.lift, pos, this.raw100(rtNew.actuation))
        }
        const on = rtNew.press > 0 && rtNew.release > 0
        if (on) {
          setU16(MAG.RT_PRESS, st.rtPress, pos, Math.max(1, this.raw100(rtNew.press)))
          setU16(MAG.RT_LIFT, st.rtLift, pos, Math.max(1, this.raw100(rtNew.release)))
        }
      }
      const rtOn = rtNew.press > 0 && rtNew.release > 0
      const mode = base | (rtOn ? MODE.RT : 0)
      if (mode !== st.mode[pos]) put(MAG.MODE, pos, [mode])
    }

    // key matrix
    const byLayer = [0, 1, 2, 3].map((l) => [...km].filter(([k]) => k.startsWith(`${l}:`)).map(([k, e]) => [Number(k.split(':')[1]), e] as const))
    for (let layer = 0; layer < MAX_LAYERS; layer++) {
      const list = byLayer[layer]
      if (!list.length) continue
      if (!st.km[layer]) st.km[layer] = await this.keyLayer(layer)
      const table = st.km[layer]!
      for (const [pos, e] of list) table.set(e, pos * 4)
      if (list.length > 6) await this.sendKeyLayer(layer, table)
      else for (const [pos, e] of list) await this.sendKey(layer, pos, e)
    }

    // macro repeat counts live in the macros themselves
    for (const [index, repeat] of repeats) {
      const m = st.macros[index]
      if (!m || u16le(m, 0) === repeat) continue
      const ev = decodeRyMacro(m)
      if (ev.lossy) continue
      await this.sendMacro(index, encodeRyMacro(ev.events, repeat))
    }

    await this.sendMagnetism(mag)
  }

  private fromBinding(pos: number, b: Binding): Entry | null {
    switch (b.type) {
      case 'default':
        return this.defaultEntry(pos)
      case 'key':
        return [0, b.mods & 0xff, b.code & 0xff, 0]
      case 'media':
        return [3, 0, b.usage & 0xff, (b.usage >> 8) & 0xff]
      case 'mouse': {
        const i = MOUSE_BUTTONS.indexOf(b.button)
        return i < 0 ? null : [1, 0, 240 + i, 0]
      }
      case 'wheel':
        return [1, 0, 245, b.dir === 1 ? 1 : 255]
      case 'macro':
        return b.index < this.ry.maxMacro ? [9, b.mode === 2 ? 1 : 0, b.index, 0] : null
      default:
        return null
    }
  }

  private async sendKey(layer: number, pos: number, e: Entry) {
    if (pos >= MAX_POSITIONS || layer >= MAX_LAYERS) throw new Error('key out of range')
    await this.link.send([C.SET_KEYMATRIX, this.st.profile, pos, 0, 0, 1, layer, 0, ...e])
    await sleep(100)
  }

  /** A whole sub-layer in 56-byte pages (512 bytes -> 10 pages). */
  private async sendKeyLayer(layer: number, table: Uint8Array) {
    const pages = Math.ceil(table.length / 56)
    if (pages > 10 || layer >= MAX_LAYERS) throw new Error('key layer out of range')
    for (let page = 0; page < pages; page++) {
      const chunk = table.slice(page * 56, page * 56 + 56)
      const data = new Uint8Array(56)
      data.set(chunk)
      await this.link.send([C.SET_KEYMATRIX, this.st.profile, 0xff, page, chunk.length, page === pages - 1 ? 1 : 0, layer, 0, ...data])
    }
    await sleep(100)
  }

  /** Per-key table writes, single keys or whole tables, with one commit at the very end. */
  private async sendMagnetism(mag: Map<number, Map<number, number[]>>) {
    if (!mag.size) return
    const st = this.st
    const order = [MAG.MODE, MAG.PRESS, MAG.LIFT, MAG.RT_PRESS, MAG.RT_LIFT, MAG.DKS_TRAVEL, MAG.MT_TIME, MAG.SNAP, MAG.DKS_MODES_SET].filter((s) => mag.has(s))
    const u16 = new Map<number, Uint16Array>([
      [MAG.PRESS, st.press],
      [MAG.LIFT, st.lift],
      [MAG.RT_PRESS, st.rtPress],
      [MAG.RT_LIFT, st.rtLift],
      [MAG.DKS_TRAVEL, st.dksTravel],
    ])
    const u8 = new Map<number, Uint8Array>([
      [MAG.MODE, st.mode],
      [MAG.MT_TIME, st.mtTime],
      [MAG.SNAP, st.snap],
    ])
    // apply to the local copy first; bulk writes send the whole updated table
    for (const [sub, keys] of mag) {
      for (const [pos, bytes] of keys) {
        if (u16.has(sub)) u16.get(sub)![pos] = bytes[0] | (bytes[1] << 8)
        else if (u8.has(sub)) u8.get(sub)![pos] = bytes[0]
        else if (sub === MAG.DKS_MODES_SET) bytes.forEach((v, g) => (st.dksModes[g][pos] = v))
      }
    }
    const packets: number[][] = []
    for (const sub of order) {
      const keys = mag.get(sub)!
      const bulk = keys.size > 12 && sub !== MAG.DKS_MODES_SET
      if (!bulk) {
        for (const [pos, bytes] of keys) packets.push([sub, 0, pos, 0, 0, 0, 0, ...bytes])
        continue
      }
      const table: number[] = u16.has(sub) ? Array.from(u16.get(sub)!).flatMap((v) => [v & 0xff, v >> 8]) : Array.from(u8.get(sub)!)
      const pages = Math.ceil(table.length / 56)
      for (let page = 0; page < pages; page++) {
        const data = table.slice(page * 56, page * 56 + 56)
        packets.push([sub, 1, page, 0, 0, 0, 0, ...data, ...new Array(56 - data.length).fill(0)])
      }
    }
    for (let i = 0; i < packets.length; i++) {
      const pk = packets[i]
      pk[3] = i === packets.length - 1 ? 1 : 0 // commit with the last packet
      await this.link.send([C.SET_MULTI_MAGNETISM, ...pk])
    }
    // the firmware saves after a commit; reads too soon come back shifted
    await sleep(300)
  }

  private async writeLed(next: Uint8Array) {
    const l = decodeLed(next)
    const L = this.ry.light
    const custom = l.effect === CUSTOM_EFFECT || l.effect === ryModeIndex(L, 'LightUserPicture')
    const speed = L.maxSpeed - clamp(l.speed - 1, 0, L.maxSpeed)
    const bright = clamp(l.brightness - 1, 0, 4)
    let option = ((l.direction ? 1 : 0) << 4) | (l.rainbow ? L.dazzle : L.normal)
    let [r, g, b] = [l.r, l.g, l.b]
    if (r === 255 && g === 255 && b === 255) [r, g, b] = [0xfa, 0xfa, 0xfa] // as the official app sends white
    if (custom) {
      option = 0 // picture slot 0
      ;[r, g, b] = [0, 200, 200]
    }
    const pkt = [C.SET_LEDPARAM, l.effect & 0xff, speed, bright, option, r, g, b]
    await this.link.send(pkt, 'bit8')
    this.st.led = Uint8Array.from([C.GET_LEDPARAM, ...pkt.slice(1)])
    await sleep(100)
  }

  private async writeColors(next: Uint8Array) {
    const pic = new Uint8Array(7 * 56)
    pic.set(this.st.pic)
    for (const pos of this.keyPositions()) if (pos < 126) pic.set([next[pos * 4 + 1], next[pos * 4 + 2], next[pos * 4 + 3]], pos * 3)
    for (let page = 0; page < 7; page++) {
      const size = page === 6 ? USERPIC_BYTES - 56 * 6 : 56
      await this.link.send([C.SET_USERPIC, 0, 0xff, page, size, page === 6 ? 1 : 0, 0, 0, ...pic.slice(page * 56, page * 56 + 56)])
    }
    this.st.pic = pic.slice(0, USERPIC_BYTES)
    await sleep(100)
  }

  private async writeSettings(prev: Uint8Array, next: Uint8Array) {
    const a = decodeRySettings(prev)
    const b = decodeRySettings(next)
    const st = this.st
    if (a.polling !== b.polling) {
      await this.link.send([C.SET_REPORT, 0, clamp(b.polling, 0, 6)])
      st.polling = b.polling
      await sleep(100)
    }
    if (a.debounce !== b.debounce) {
      await this.link.send([C.SET_DEBOUNCE, clamp(b.debounce, 0, 50)])
      st.debounce = b.debounce
      await sleep(100)
    }
    if (a.rtStability !== b.rtStability || a.antiMistouch !== b.antiMistouch || a.wasdSwap !== b.wasdSwap) {
      const o = st.kbOption
      await this.link.send([C.SET_KBOPTION, 0, o[2], b.antiMistouch ? 1 : 0, clamp(b.rtStability, 0, 5), b.wasdSwap ? 1 : 0])
      st.kbOption = Uint8Array.from([C.GET_KBOPTION, o[1], o[2], b.antiMistouch ? 1 : 0, b.rtStability, b.wasdSwap ? 1 : 0])
      await sleep(100)
    }
  }

  async commit() {
    /* every RY write is saved by the keyboard */
  }

  // ---------- live travel ----------

  private async pollTravel() {
    const keys = this.keyPositions().filter((p) => KEYS.some((k) => k.id === p))
    const last = new Map<number, number>()
    while (this.live) {
      try {
        const raw = await this.link.run(async () => {
          const out: number[] = []
          for (let page = 0; page < 4; page++) out.push(...(await this.link.page([C.GET_MULTI_MAGNETISM, MAG.LIVE_TRAVEL, 1, page], 1)))
          return out
        })
        for (const p of keys) {
          const v = u16le(raw, p * 2)
          if (last.get(p) === v) continue
          last.set(p, v)
          this.sensor.emit({ key: p, state: 0, rest: 0, bottom: 0, adc: v, travel: this.mm100(v), full: RT_LIMITS.travel })
        }
      } catch {
        /* a missed frame is fine */
      }
      await sleep(30)
    }
  }

  async command(cmd: number, args: number[] = []) {
    if (cmd === Cmd.CalibrationStart) {
      // RY shows travel without entering calibration (which needs every key released first)
      if (!this.live) {
        this.live = true
        void this.pollTravel()
      }
    } else if (cmd === Cmd.CalibrationEnd) {
      this.live = false
    } else if (cmd === Cmd.Reset && args[0] === ResetArg.FactoryAll) {
      await this.link.run(async () => {
        await this.link.send([C.SET_RESET])
        await sleep(2000)
      })
    }
  }

  async close() {
    this.live = false
    this.unsub()
    await this.link.transport.close()
  }
}

/** True when a macro buffer contains its terminating zeros. */
function endsWithin(buf: Uint8Array) {
  let i = 2
  while (i + 4 <= buf.length) {
    const s = buf.slice(i, i + 4)
    if (s[0] === 0 && s[1] === 0 && s[2] === 0 && s[3] === 0) return true
    i += s[0] === 0xf9 ? (s[1] ? 4 : 6) : s[1] & 0x7f ? 2 : 4
  }
  return false
}

// ---------- transports ----------

/** Browser: WebHID feature reports on the vendor collection. */
export class WebHidRyTransport implements RyTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private device: HIDDevice
  private disconnects = new Emitter<void>()
  private onHidDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.disconnects.emit()
  }

  constructor(device: HIDDevice) {
    this.device = device
    this.name = device.productName || 'Keyboard'
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.productName }
    navigator.hid.addEventListener('disconnect', this.onHidDisconnect)
  }

  static async open(device: HIDDevice) {
    if (!device.opened) await device.open()
    return new WebHidRyTransport(device)
  }

  sendReport(data: Uint8Array) {
    return this.device.sendFeatureReport(0, data as Uint8Array<ArrayBuffer>)
  }

  async receiveReport() {
    const v = await this.device.receiveFeatureReport(0)
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength).slice()
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    navigator.hid.removeEventListener('disconnect', this.onHidDisconnect)
    if (this.device.opened) await this.device.close()
  }
}

/**
 * Demo / test: a simulated RY5088 board. It answers like the firmware does (as far as FCC uses it), checks every
 * checksum, and records each report it receives in `sent`.
 */
export class MockRyTransport implements RyTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()
  private answer: Uint8Array = new Uint8Array(RY_REPORT_LEN)
  private deviceId: number
  private state = {
    profile: 0,
    km: [0, 1, 2, 3].map(() => new Uint8Array(512)),
    mag: new Map<number, Uint8Array>(),
    led: [1, 2, 4, 0x07, 0x00, 0xe5, 0xff],
    pic: new Uint8Array(USERPIC_BYTES),
    macros: new Map<number, Uint8Array>(),
    polling: 0,
    debounce: 2,
    kbOption: [0, 0, 0, 0, 0],
    sleep: new Uint8Array(8),
  }

  constructor(device: DeviceDef) {
    if (!device.ry) throw new Error('not an RY5088 board')
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.name }
    this.deviceId = device.ry.deviceId
    const s = this.state
    s.km[0].set(device.ry.matrix.slice(0, 512))
    const u16 = (v: number) => {
      const t = new Uint8Array(256)
      for (let p = 0; p < 128; p++) t.set([v & 0xff, v >> 8], p * 2)
      return t
    }
    s.mag.set(MAG.PRESS, u16(200)) // 2.0 mm at 0.01 mm units
    s.mag.set(MAG.LIFT, u16(200))
    s.mag.set(MAG.RT_PRESS, u16(30))
    s.mag.set(MAG.RT_LIFT, u16(30))
    s.mag.set(MAG.DKS_TRAVEL, u16(100))
    s.mag.set(MAG.MODE, new Uint8Array(128))
    s.mag.set(MAG.MT_TIME, new Uint8Array(128).fill(20))
    s.mag.set(MAG.SNAP, new Uint8Array(128).fill(SNAP_NONE))
    s.mag.set(MAG.DKS_MODES_GET, new Uint8Array(512))
    for (let p = 0; p < 126; p++) s.pic.set([0, 229, 255], p * 3)
  }

  async sendReport(data: Uint8Array) {
    if (data.length !== RY_REPORT_LEN) throw new Error('report must be 64 bytes')
    const cmd = data[0]
    const ok7 = data[7] === 255 - (data.slice(0, 7).reduce((a, b) => a + b, 0) & 0xff)
    const ok8 = data[8] === 255 - (data.slice(0, 8).reduce((a, b) => a + b, 0) & 0xff)
    if (!(cmd === C.SET_LEDPARAM ? ok8 : ok7)) throw new Error(`bad checksum on 0x${cmd.toString(16)}`)
    this.sent.push(data.slice())
    this.answer = this.handle(data)
  }

  async receiveReport() {
    return this.answer.slice()
  }

  private handle(d: Uint8Array): Uint8Array {
    const s = this.state
    const out = new Uint8Array(RY_REPORT_LEN)
    const echo = (...bytes: number[]) => {
      out.set([d[0], ...bytes])
      return out
    }
    const pageOf = (buf: Uint8Array, page: number) => {
      out.set(buf.slice(page * 64, page * 64 + 64))
      return out
    }
    switch (d[0]) {
      case C.GET_USB_VERSION:
        return echo(this.deviceId & 0xff, (this.deviceId >> 8) & 0xff, (this.deviceId >> 16) & 0xff, this.deviceId >>> 24, 0, 0, 0x08, 0x04)
      case C.GET_FEATURE_LIST:
        return echo(0xaa, 0)
      case C.GET_PROFILE:
        return echo(s.profile)
      case C.GET_REPORT:
        return echo(0, s.polling)
      case C.GET_DEBOUNCE:
        return echo(s.debounce)
      case C.GET_KBOPTION:
        return echo(...s.kbOption)
      case C.GET_SLEEPTIME:
        out.set([d[0]])
        out.set(s.sleep, 8)
        return out
      case C.GET_LEDPARAM:
        return echo(...s.led)
      case C.GET_KEYMATRIX:
        return pageOf(s.km[d[4]] ?? new Uint8Array(512), d[3])
      case C.GET_USERPIC:
        return pageOf(s.pic, d[3])
      case C.GET_MACRO:
        return pageOf(s.macros.get(d[1]) ?? new Uint8Array(256), d[2])
      case C.GET_MULTI_MAGNETISM: {
        if (d[1] === MAG.LIVE_TRAVEL) {
          const t = new Uint8Array(256)
          const p = Math.floor(performance.now() / 700) % 60
          const v = Math.round((Math.sin(performance.now() / 300) + 1) * 170)
          t.set([v & 0xff, v >> 8], (p + 6) * 2)
          return pageOf(t, d[3])
        }
        return pageOf(s.mag.get(d[1]) ?? new Uint8Array(512), d[3])
      }
      case C.SET_REPORT:
        s.polling = d[2]
        return out
      case C.SET_DEBOUNCE:
        s.debounce = d[1]
        return out
      case C.SET_KBOPTION:
        s.kbOption = [0, d[2], d[3], d[4], d[5]]
        return out
      case C.SET_LEDPARAM:
        s.led = Array.from(d.slice(1, 8))
        return out
      case C.SET_KEYMATRIX: {
        const layer = d[6]
        if (d[2] === 0xff) s.km[layer].set(d.slice(8, 8 + d[4]), d[3] * 56)
        else s.km[layer].set(d.slice(8, 12), d[2] * 4)
        return out
      }
      case C.SET_USERPIC:
        s.pic.set(d.slice(8, 8 + d[4]), d[3] * 56)
        return out
      case C.SET_MACRO: {
        const buf = s.macros.get(d[1]) ?? new Uint8Array(256)
        if (d[2] === 0) buf.fill(0)
        buf.set(d.slice(8, 8 + Math.min(56, 256 - d[2] * 56)), d[2] * 56)
        s.macros.set(d[1], buf)
        return out
      }
      case C.SET_MULTI_MAGNETISM: {
        const [, sub, paged, idx] = d
        const getSub = sub === MAG.DKS_MODES_SET ? MAG.DKS_MODES_GET : sub
        const table = s.mag.get(getSub) ?? new Uint8Array(512)
        const width = [MAG.PRESS, MAG.LIFT, MAG.RT_PRESS, MAG.RT_LIFT, MAG.DKS_TRAVEL].includes(sub as 0) ? 2 : 1
        if (paged) table.set(d.slice(8, 64).slice(0, Math.max(0, table.length - idx * 56)), idx * 56)
        else if (sub === MAG.DKS_MODES_SET) for (let g = 0; g < 4; g++) table[g * 128 + idx] = d[8 + g]
        else table.set(d.slice(8, 8 + width), idx * width)
        s.mag.set(getSub, table)
        return out
      }
      case C.SET_SLEEPTIME:
        s.sleep = d.slice(8, 16)
        return out
      case C.SET_RESET:
        return out
      default:
        throw new Error(`mock: unexpected command 0x${d[0].toString(16)}`)
    }
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
