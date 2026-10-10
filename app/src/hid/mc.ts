// MCHOSE first-generation ("glw") magnetic keyboards: ACE 60 / 68 / 75, JET75, MIX87, …  Notes: docs/PROTOCOL-MC.md.
//
// The board exposes memory areas (key map, key triggers, function config, colours, macros …). Every message is a
// 64-byte output report:  [0x55, command, 0, checksum, length, offset lo, offset hi, 0, data…]  and every one is
// answered by an input report  [0xAA, command, …, length, offset lo, offset hi, …, data from byte 8].
// Reads and writes move up to 56 bytes at a time.
//
// FCC's pages speak the Sonix region format, so this driver translates both ways and writes only what changed.
// Things FCC can't show yet (DKS, SOCD, other macro play modes, combo keys …) read back as "?" and are left alone.

import { KEYS } from '../data/layout'
import { mcEffectId, type DeviceDef } from '../devices/registry'
import {
  MACRO_REGION,
  decodeBinding,
  decodeLed,
  decodeMacros,
  decodeRT,
  encodeBinding,
  encodeLed,
  encodeMacros,
  type Binding,
  type MacroEvent,
} from './codec'
import type { KeyboardDriver, RegionData, SensorEvent } from './device'
import { Cmd, REGIONS, ResetArg, type RegionName } from './protocol'
import { Emitter, type DeviceIdentity } from './transport'

export const MC_REPORT_LEN = 64
const CHUNK = 56
const REQUEST = 0x55
const REPLY = 0xaa

export const MC = {
  INFO: 3,
  BASE: 4,
  FUNC_GET: 5,
  FUNC_SET: 6,
  KEYS_DEFAULT: 7,
  KEYS_GET: 8,
  KEYS_SET: 9,
  COLORS_GET: 10,
  COLORS_SET: 11,
  MACROS_GET: 12,
  MACROS_SET: 13,
  TRIGGER_GET: 160,
  TRIGGER_SET: 161,
  MT_GET: 164,
  MT_SET: 165,
  TGL_GET: 166,
  TGL_SET: 167,
  RESET: 238,
} as const

/** The only commands FCC sends; boot mode, ROM erase / write and firmware commands are refused. */
const ALLOWED = new Set<number>(Object.values(MC))

const MAX_LAYER = 4
const MAX_MACROS = 16
const MIN_MACRO_DELAY = 5
const KEY_AREA = 512
const LIGHT_AREA = 512
const MT_SLOTS = 32
const TGL_SLOTS = 32
const PLACEHOLDER: [number, number, number, number] = [0xfe, 0, 0, 0]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((v, i) => v === b[i])

export interface McExpect {
  cmd: number
  len: number
  lo: number
  hi: number
}

/** A pipe that sends MC requests and returns the matching reply (64 bytes). */
export interface McTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  request(packet: Uint8Array, expect: McExpect): Promise<Uint8Array>
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

/** One request packet: [0x55, cmd, 0, checksum, len, lo, hi, 0, data…]; the checksum covers bytes 4 onward. */
export function mcPacket(cmd: number, offset: number, data: ArrayLike<number> | { size: number }) {
  if (offset < 0 || offset > 0xffff) throw new Error('offset out of range')
  const payload = 'size' in data ? [] : Array.from(data as ArrayLike<number>, (v) => v & 0xff)
  const len = 'size' in data ? data.size : payload.length
  if (len > CHUNK) throw new Error('packet too long')
  const h = [len, offset & 0xff, offset >> 8, 0, ...payload]
  const out = new Uint8Array(MC_REPORT_LEN)
  out.set([REQUEST, cmd, 0, h.reduce((a, b) => a + b, 0) & 0xff, ...h])
  return out
}

/** True when `r` answers `e` (the reply may carry fewer bytes than asked for). */
export function mcMatches(r: ArrayLike<number>, e: McExpect) {
  return r[0] === REPLY && r[1] === e.cmd && r[4] <= e.len && r[5] === e.lo && r[6] === e.hi
}

class Link {
  private queue: Promise<unknown> = Promise.resolve()
  readonly transport: McTransport
  constructor(transport: McTransport) {
    this.transport = transport
  }

  run<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op)
    this.queue = next.catch(() => undefined)
    return next
  }

  private async exchange(cmd: number, offset: number, data: ArrayLike<number> | { size: number }) {
    if (!ALLOWED.has(cmd)) throw new Error(`refusing to send command ${cmd}`)
    const pkt = mcPacket(cmd, offset, data)
    const expect = { cmd, len: pkt[4], lo: pkt[5], hi: pkt[6] }
    let last: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.transport.request(pkt, expect)
      } catch (e) {
        last = e
        await sleep(20)
      }
    }
    throw last instanceof Error ? last : new Error(`no answer to command ${cmd}`)
  }

  /** Reads `size` bytes of an area. */
  async get(cmd: number, offset: number, size: number) {
    const out: number[] = []
    for (let i = 0; i < size; i += CHUNK) {
      const n = Math.min(CHUNK, size - i)
      const r = await this.exchange(cmd, offset + i, { size: n })
      out.push(...r.slice(8, 8 + n))
    }
    return Uint8Array.from(out)
  }

  /** Writes `bytes` at `offset`; a short last packet is moved back so every packet stays 56 bytes. */
  async set(cmd: number, offset: number, bytes: ArrayLike<number>) {
    const a = Array.from(bytes)
    if (!a.length) return
    for (let p = 0; p < a.length; p += CHUNK) {
      let start = p
      if (a.length - p < CHUNK && p > 0) start = a.length - CHUNK
      await this.exchange(cmd, offset + start, a.slice(start, start + CHUNK))
    }
  }

  /** Writes only the records (`record` bytes each) that differ, grouped into packets. */
  async setChanged(cmd: number, offset: number, prev: Uint8Array, next: Uint8Array, record: number) {
    const per = Math.floor(CHUNK / record) * record
    const changed: number[] = []
    for (let r = 0; r * record < next.length; r++) {
      const o = r * record
      if (!same(prev.slice(o, o + record), next.slice(o, o + record))) changed.push(o)
    }
    let i = 0
    while (i < changed.length) {
      const start = changed[i]
      let end = start + record
      while (i + 1 < changed.length && changed[i + 1] + record - start <= per) end = changed[++i] + record
      i++
      await this.exchange(cmd, offset + start, next.slice(start, end))
    }
  }
}

// ---------- key entries (3 bytes) ----------

type Entry = [number, number, number]
const MOUSE_MASKS = [1, 2, 4, 8, 16]

const plainHid = (e: ArrayLike<number>) => (e[0] === 16 && e[1] === 0 ? e[2] : null)

// ---------- macros ----------

/** MC macro records (4 bytes): [delay lo, delay hi, flags, code]; flags: bit7 last, bit6 down, low 6 bits kind. */
export function encodeMcMacro(events: MacroEvent[]): number[] {
  if (!events.length) return [0, 0, 128, 0]
  const out: number[] = []
  events.forEach((e, i) => {
    const delay = e.delay < MIN_MACRO_DELAY ? MIN_MACRO_DELAY - 1 : clamp(e.delay, 0, 65535)
    const modifier = !e.mouse && e.code >= 224 && e.code <= 231
    const kind = e.mouse ? 3 : modifier ? 1 : 2
    const flags = kind | (e.down ? 64 : 0) | (i === events.length - 1 ? 128 : 0)
    out.push(delay & 0xff, delay >> 8, flags, modifier ? 1 << (e.code & 0x0f) : e.code & 0xff)
  })
  return out
}

export function decodeMcMacro(buf: ArrayLike<number>, at: number): { events: MacroEvent[]; ended: boolean } {
  const events: MacroEvent[] = []
  for (let o = at; o + 4 <= buf.length; o += 4) {
    const delay = buf[o] | (buf[o + 1] << 8)
    const flags = buf[o + 2]
    const kind = flags & 63
    const down = (flags & 64) !== 0
    const code = buf[o + 3]
    if (kind === 2 || kind === 1 || kind === 3) {
      const real = kind === 1 ? 224 + Math.max(0, Math.log2(code & -code)) : code
      if (real || kind === 3) events.push({ code: real, down, mouse: kind === 3, delay })
      else if (events.length) events[events.length - 1].delay += delay // a lone delay
    }
    if (flags & 128) return { events, ended: true }
  }
  return { events, ended: false }
}

// ---------- settings (FCC's 32-byte settings region, MC layout) ----------

export interface McSettings {
  lockWin: boolean
  bottomRapidTrigger: boolean
  /** "tachyon" (berserk) mode */
  tachyon: boolean
  debounce: boolean
  /** minutes before sleeping; 0 = never */
  sleepMinutes: number
}
const SETTINGS_MAGIC = 0x4d

export function decodeMcSettings(s: Uint8Array): McSettings {
  return { lockWin: s[1] === 1, bottomRapidTrigger: s[2] === 1, debounce: s[3] >= 1, sleepMinutes: s[4], tachyon: s[6] === 1 }
}

export function encodeMcSettings(prev: Uint8Array, v: McSettings): Uint8Array {
  const out = prev.slice()
  out[0] = SETTINGS_MAGIC
  out[1] = v.lockWin ? 1 : 0
  out[2] = v.bottomRapidTrigger ? 1 : 0
  out[3] = v.debounce ? Math.max(1, prev[3]) : 0
  out[4] = clamp(v.sleepMinutes, 0, 120)
  out[6] = v.tachyon ? 1 : 0
  return out
}

// ---------- driver ----------

interface McState {
  profile: number
  macroOffset: number
  macroSize: number
  unitsOk: boolean
  info: Uint8Array
  func: Uint8Array
  defaults: Uint8Array
  keys: Uint8Array
  trig: Uint8Array
  mt: Uint8Array
  tgl: Uint8Array
  colors: Uint8Array
  macros: Uint8Array
}

export class McKeyboard implements KeyboardDriver {
  readonly sensor = new Emitter<SensorEvent>()
  readonly disconnected = new Emitter<void>()
  private link: Link
  private device: DeviceDef
  private st!: McState
  private fcc!: RegionData
  private pending = new Map<RegionName, Uint8Array>()
  private unsub: () => void

  constructor(transport: McTransport, device: DeviceDef) {
    if (!device.mc) throw new Error('not an MCHOSE board')
    this.link = new Link(transport)
    this.device = device
    this.unsub = transport.onDisconnect(() => this.disconnected.emit())
  }

  get name() {
    return this.link.transport.name
  }
  get identity() {
    return this.link.transport.identity
  }
  get model() {
    return this.device
  }
  private get mc() {
    return this.device.mc!
  }
  private get count() {
    return Math.min(this.mc.maxKeyCount, 128)
  }
  private keyIds() {
    return KEYS.map((k) => k.id).filter((id) => id < this.count)
  }

  /** Same connection, translated for another model. */
  forDevice(device: DeviceDef) {
    this.unsub()
    return new McKeyboard(this.link.transport, device)
  }

  // ---------- reading ----------

  async readAll(onProgress?: (region: RegionName, index: number, total: number) => void) {
    return this.link.run(async () => {
      const steps = 9
      let step = 0
      const tick = (r: RegionName) => onProgress?.(r, ++step, steps)
      const L = this.link
      const info = await L.get(MC.INFO, 0, CHUNK)
      const base = await L.get(MC.BASE, 0, CHUNK)
      // base: [order index, profile count, order…]; the active profile is order[base[0]]
      const order = [base[2], base[3], base[4], base[5]]
      const ordered = [...order].sort().join() === '0,1,2,3'
      const valid = base[0] < MAX_LAYER && base[1] <= MAX_LAYER
      const profile = valid && ordered ? order[base[0]] : valid ? base[0] : 0
      // shared 4 KB macro area on boards with ordered profiles (2 KB per profile otherwise)
      const shared = valid && ordered
      const macroSize = shared ? ([101, 130, 131, 132].includes(this.mc.type) ? 4096 : 8192) : 2048
      tick('info')

      const n = this.count
      const st: McState = {
        profile,
        macroOffset: shared ? 0 : profile * macroSize,
        macroSize,
        unitsOk: true,
        info,
        func: await L.get(MC.FUNC_GET, 64 * profile, 64),
        defaults: new Uint8Array(0),
        keys: new Uint8Array(0),
        trig: new Uint8Array(0),
        mt: new Uint8Array(0),
        tgl: new Uint8Array(0),
        colors: new Uint8Array(0),
        macros: new Uint8Array(0),
      }
      tick('settings')
      st.defaults = await L.get(MC.KEYS_DEFAULT, KEY_AREA * (MAX_LAYER * profile), 3 * n)
      st.keys = await L.get(MC.KEYS_GET, KEY_AREA * (MAX_LAYER * profile), 3 * n)
      tick('keys')
      st.trig = await L.get(MC.TRIGGER_GET, 1024 * profile, 8 * n)
      tick('rt')
      st.mt = await L.get(MC.MT_GET, 256 * profile, 6 * MT_SLOTS)
      st.tgl = await L.get(MC.TGL_GET, 128 * profile, 3 * TGL_SLOTS)
      tick('dks')
      st.colors = await L.get(MC.COLORS_GET, LIGHT_AREA * profile, 3 * n)
      tick('colors')
      st.macros = await this.readMacros(st)
      tick('macros')

      // actuation must make sense in the board's units before FCC writes any
      st.unitsOk = this.keyIds().every((id) => {
        const mm = this.actuationRaw(st.trig, id) / this.mc.step
        return mm > 0 && mm <= this.mc.maxTravel + 0.3
      })
      this.st = st
      this.fcc = this.toFcc()
      tick('led')
      return this.copy(this.fcc)
    })
  }

  private async readMacros(st: McState) {
    const L = this.link
    let buf = Array.from(await L.get(MC.MACROS_GET, st.macroOffset, CHUNK))
    const offsets = Array.from({ length: MAX_MACROS }, (_, i) => buf[2 * i] | (buf[2 * i + 1] << 8))
    const done = () => offsets.every((o) => o === 0 || o >= st.macroSize || decodeMcMacro(buf, o).ended)
    while (!done() && buf.length < st.macroSize) {
      buf = buf.concat(Array.from(await L.get(MC.MACROS_GET, st.macroOffset + buf.length, Math.min(CHUNK, st.macroSize - buf.length))))
    }
    return Uint8Array.from(buf)
  }

  async readRegion(name: RegionName) {
    return this.fcc[name].slice()
  }

  private copy(r: RegionData) {
    return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.slice()])) as RegionData
  }

  // ---------- units ----------

  private actuationRaw(trig: Uint8Array, id: number) {
    const o = id * 8
    return (trig[o + 2] | ((trig[o + 3] & 1) << 8)) + 1
  }
  private rtBase(code: number) {
    return code === 1 ? 200 : code === 2 ? 1000 : Math.round(1 / this.mc.precision)
  }

  // ---------- MC -> FCC ----------

  private entry(table: Uint8Array, id: number): Entry {
    return [table[id * 3], table[id * 3 + 1], table[id * 3 + 2]]
  }

  private toBinding(id: number, e: Entry): Binding | null {
    const def = this.entry(this.st.defaults, id)
    if (same(e, def) || e[0] === 255) return { type: 'default' }
    const [t, a, b] = e
    if (t === 16) return { type: 'key', mods: a, code: b }
    if (t === 48) return { type: 'media', usage: a | (b << 8) }
    if (t === 32 && MOUSE_MASKS.includes(a)) return { type: 'mouse', button: a }
    if (t === 33 && a === 0 && (b === 1 || b === 255)) return { type: 'wheel', dir: b as 1 | 255 }
    if (t === 112 && b === 0 && a < MAX_MACROS) return { type: 'macro', index: a, mode: 0, repeat: 0 }
    if (t === 146 && a < MT_SLOTS) {
      const s = this.st.mt.slice(a * 6, a * 6 + 6)
      const tap = plainHid(s.slice(0, 3))
      const hold = plainHid(s.slice(3, 6))
      if (tap !== null && hold !== null) return { type: 'modtap', hold, tap, ms: b * 10 }
    }
    if (t === 145 && a < TGL_SLOTS) {
      const code = plainHid(this.st.tgl.slice(a * 3, a * 3 + 3))
      if (code !== null) return { type: 'toggle', code }
    }
    return null
  }

  private toFcc(): RegionData {
    const st = this.st
    const out = Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, new Uint8Array(r.size)])) as RegionData
    out.info.set([MACRO_REGION & 0xff, (MACRO_REGION >> 8) & 0x7f], 2)
    out.info.set([this.identity.vendorId & 0xff, this.identity.vendorId >> 8, this.identity.productId & 0xff, this.identity.productId >> 8], 4)
    out.info[8] = st.info[0]
    out.info[9] = st.info[1]

    const f = st.func
    out.settings.set(
      encodeMcSettings(out.settings, {
        lockWin: (f[6] & 1) === 1,
        bottomRapidTrigger: ((f[7] >> 1) & 1) === 1,
        tachyon: (f[7] & 1) === 1,
        debounce: ((f[7] >> 5) & 7) >= 1,
        sleepMinutes: Math.round((f[35] * 30) / 60),
      }),
    )
    out.settings[3] = (f[7] >> 5) & 7

    for (const id of this.keyIds()) {
      const b = this.toBinding(id, this.entry(st.keys, id))
      out.keys.set(b ? encodeBinding(b) : PLACEHOLDER, id * 4)

      const o = id * 8
      const t = st.trig.slice(o, o + 8)
      const act = Math.round((this.actuationRaw(st.trig, id) / this.mc.step) * 100)
      out.rt[o + 2] = act & 0xff
      out.rt[o + 3] = act >> 8
      if ((t[1] & 15) === 1) {
        const press = Math.max(1, Math.round((((t[4] | ((t[5] & 1) << 8)) + 1) / this.rtBase((t[3] >> 3) & 3)) * 100))
        const release = Math.max(1, Math.round((((t[6] | ((t[7] & 1) << 8)) + 1) / this.rtBase((t[3] >> 1) & 3)) * 100))
        out.rt.set([press & 0xff, press >> 8, release & 0xff, release >> 8], o + 4)
      }
      if (id < 126) out.colors.set([id, st.colors[id * 3], st.colors[id * 3 + 1], st.colors[id * 3 + 2]], id * 4)
    }

    out.led.set(this.ledToFcc())

    const list: MacroEvent[][] = []
    for (let i = 0; i < MAX_MACROS; i++) {
      const at = st.macros[2 * i] | (st.macros[2 * i + 1] << 8)
      list.push(at >= 64 && at < st.macros.length ? decodeMcMacro(st.macros, at).events : [])
    }
    while (list.length && !list[list.length - 1].length) list.pop()
    for (let n = list.length; n >= 0; n--) {
      try {
        out.macros.set(encodeMacros(list.slice(0, n)))
        break
      } catch {
        /* too big for FCC's view: drop the last one */
      }
    }
    return out
  }

  private ledToFcc() {
    const f = this.st.func
    const value = f[8]
    const off = value === 255 || f[9] === 0
    return encodeLed(new Uint8Array(16), {
      effect: off ? 0 : mcEffectId(value),
      r: f[14],
      g: f[15],
      b: f[16],
      rainbow: f[12] === 1,
      brightness: clamp(f[9] / 20, 1, 5),
      speed: clamp(4 - f[10], 0, 4) + 1,
      direction: f[11] ? 1 : 0,
    })
  }

  // ---------- FCC -> MC ----------

  writeRegion(name: RegionName, data: Uint8Array) {
    this.pending.set(name, data.slice())
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
    if (changed('rt') && !this.st.unitsOk)
      throw new Error("FCC couldn't confirm this keyboard's travel units, so actuation changes are disabled. Please send a board report.")

    if (changed('macros')) await this.writeMacros(next.macros)
    if (changed('keys')) await this.writeKeys(old.keys, next.keys)
    if (changed('rt')) await this.writeTriggers(old.rt, next.rt)
    if (changed('led') || changed('settings')) await this.writeFunc(next.led, next.settings)
    if (changed('colors')) await this.writeColors(next.colors)
    this.fcc = next
  }

  private async writeMacros(next: Uint8Array) {
    const list = decodeMacros(next)
    if (list.length > MAX_MACROS) throw new Error(`This keyboard holds ${MAX_MACROS} macros at most`)
    const st = this.st
    const header = new Array(64).fill(0)
    header[32] = 129
    header[33] = 126
    for (let i = 0; i < MAX_MACROS; i++) header[34 + i] = st.macros[34 + i] ?? 0 // keep each macro's play type
    const stream: number[] = encodeMcMacro([]) // the shared empty macro
    for (let i = 0; i < MAX_MACROS; i++) {
      const ev = list[i] ?? []
      const at = ev.length ? 64 + stream.length : 64
      if (ev.length) stream.push(...encodeMcMacro(ev))
      header[2 * i] = at & 0xff
      header[2 * i + 1] = at >> 8
    }
    const block = [...header, ...stream]
    if (block.length > st.macroSize) throw new Error('Not enough macro memory on the keyboard')
    await this.link.set(MC.MACROS_SET, st.macroOffset, block)
    st.macros = Uint8Array.from(block)
  }

  private async writeKeys(prevF: Uint8Array, nextF: Uint8Array) {
    const st = this.st
    const keys = st.keys.slice()
    const mt = st.mt.slice()
    const tgl = st.tgl.slice()
    const usedSlots = (t: number) => new Set(this.keyIds().filter((id) => keys[id * 3] === t).map((id) => keys[id * 3 + 1]))

    for (const id of this.keyIds()) {
      if (same(prevF.slice(id * 4, id * 4 + 4), nextF.slice(id * 4, id * 4 + 4))) continue
      const b = decodeBinding(nextF, id)
      if (b.type === 'unknown') continue
      const cur = this.entry(keys, id)
      let e: Entry | null = null
      switch (b.type) {
        case 'default':
          e = this.entry(st.defaults, id)
          break
        case 'key':
          e = [16, b.mods & 0xff, b.code & 0xff]
          break
        case 'media':
          e = [48, b.usage & 0xff, (b.usage >> 8) & 0xff]
          break
        case 'mouse':
          e = MOUSE_MASKS.includes(b.button) ? [32, b.button, 0] : null
          break
        case 'wheel':
          e = [33, 0, b.dir === 1 ? 1 : 255]
          break
        case 'macro':
          if (b.mode !== 0) throw new Error('This keyboard only plays macros once from FCC so far')
          e = b.index < MAX_MACROS ? [112, b.index, 0] : null
          break
        case 'modtap': {
          const slot = cur[0] === 146 ? cur[1] : [...Array(MT_SLOTS).keys()].find((s) => !usedSlots(146).has(s))
          if (slot === undefined) throw new Error('No free mod-tap slots on this keyboard')
          mt.set([16, 0, b.tap, 16, 0, b.hold], slot * 6)
          e = [146, slot, clamp(b.ms / 10, 1, 255)]
          break
        }
        case 'toggle': {
          const slot = cur[0] === 145 ? cur[1] : [...Array(TGL_SLOTS).keys()].find((s) => !usedSlots(145).has(s))
          if (slot === undefined) throw new Error('No free toggle slots on this keyboard')
          tgl.set([16, 0, b.code], slot * 3)
          e = [145, slot, 0]
          break
        }
        default:
          e = null
      }
      if (!e) continue
      // free the slot a key leaves behind
      if (cur[0] === 146 && e[0] !== 146) mt.fill(0, cur[1] * 6, cur[1] * 6 + 6)
      if (cur[0] === 145 && e[0] !== 145) tgl.fill(0, cur[1] * 3, cur[1] * 3 + 3)
      keys.set(e, id * 3)
    }

    const base = KEY_AREA * (MAX_LAYER * st.profile)
    await this.link.setChanged(MC.MT_SET, 256 * st.profile, st.mt, mt, 6)
    await this.link.setChanged(MC.TGL_SET, 128 * st.profile, st.tgl, tgl, 3)
    await this.link.setChanged(MC.KEYS_SET, base, st.keys, keys, 3)
    st.keys = keys
    st.mt = mt
    st.tgl = tgl
  }

  private async writeTriggers(prevF: Uint8Array, nextF: Uint8Array) {
    const st = this.st
    const trig = st.trig.slice()
    const maxAct = Math.round(this.mc.maxTravel * this.mc.step) - this.mc.minTravel
    for (const id of this.keyIds()) {
      const a = decodeRT(prevF, id)
      const b = decodeRT(nextF, id)
      if (JSON.stringify(a) === JSON.stringify(b)) continue
      const o = id * 8
      if (a.actuation !== b.actuation) {
        const act = clamp((b.actuation / 100) * this.mc.step, 1, maxAct) - 1
        trig[o + 2] = act & 0xff
        trig[o + 3] = (trig[o + 3] & ~1) | ((act >> 8) & 1)
      }
      const on = b.press > 0 && b.release > 0
      const mode = trig[o + 1] & 15
      // only switch between normal (0) and rapid trigger (1); other modes stay as the board has them
      if (mode === 0 || mode === 1) trig[o + 1] = (trig[o + 1] & 0xf0) | (on ? 1 : 0)
      if (on) {
        const pBase = this.rtBase((trig[o + 3] >> 3) & 3)
        const rBase = this.rtBase((trig[o + 3] >> 1) & 3)
        const press = clamp((b.press / 100) * pBase, 2, this.mc.maxTravel * pBase) - 1
        const release = clamp((b.release / 100) * rBase, 2, this.mc.maxTravel * rBase) - 1
        trig[o + 4] = press & 0xff
        trig[o + 5] = (trig[o + 5] & ~1) | ((press >> 8) & 1)
        trig[o + 6] = release & 0xff
        trig[o + 7] = (trig[o + 7] & ~1) | ((release >> 8) & 1)
      }
    }
    await this.link.setChanged(MC.TRIGGER_SET, 1024 * st.profile, st.trig, trig, 8)
    st.trig = trig
  }

  private async writeFunc(led: Uint8Array, settings: Uint8Array) {
    const st = this.st
    const f = st.func.slice()
    const l = decodeLed(led)
    if (l.effect === 0) {
      if (this.mc.effects.includes(255)) f[8] = 255
      else f[9] = 0
    } else {
      f[8] = l.effect - 1
      f[9] = clamp(l.brightness * 20, 0, 100)
      f[10] = 4 - clamp(l.speed - 1, 0, 4)
      f[11] = l.direction ? 1 : 0
      f[12] = l.rainbow ? 1 : 0
      f[14] = l.r
      f[15] = l.g
      f[16] = l.b
    }
    if (settings[0] === SETTINGS_MAGIC) {
      const s = decodeMcSettings(settings)
      f[6] = (f[6] & ~1) | (s.lockWin ? 1 : 0)
      f[7] = (f[7] & ~0xe3) | ((s.debounce ? Math.max(1, settings[3]) : 0) << 5) | ((s.bottomRapidTrigger ? 1 : 0) << 1) | (s.tachyon ? 1 : 0)
      f[35] = clamp((s.sleepMinutes * 60) / 30, 0, 255)
    }
    if (same(f, st.func)) return
    await this.link.set(MC.FUNC_SET, 64 * st.profile, f)
    st.func = f
  }

  private async writeColors(next: Uint8Array) {
    const st = this.st
    const colors = st.colors.slice()
    for (const id of this.keyIds()) if (id < 126) colors.set([next[id * 4 + 1], next[id * 4 + 2], next[id * 4 + 3]], id * 3)
    await this.link.setChanged(MC.COLORS_SET, LIGHT_AREA * st.profile, st.colors, colors, 3)
    st.colors = colors
  }

  async commit() {
    /* every write is saved by the keyboard */
  }

  async command(cmd: number, args: number[] = []) {
    if (cmd === Cmd.Reset && args[0] === ResetArg.FactoryAll) await this.link.run(() => this.link.set(MC.RESET, 0, [255]))
    // live travel and calibration aren't wired up for these boards yet
  }

  async close() {
    this.unsub()
    await this.link.transport.close()
  }
}

// ---------- transports ----------

/** Browser: output report 0 out, matching input report back. */
export class WebHidMcTransport implements McTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private device: HIDDevice
  private disconnects = new Emitter<void>()
  private onHidDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.disconnects.emit()
  }

  constructor(device: HIDDevice) {
    this.device = device
    this.name = device.productName || 'MCHOSE keyboard'
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.productName }
    navigator.hid.addEventListener('disconnect', this.onHidDisconnect)
  }

  static async open(device: HIDDevice) {
    if (!device.opened) await device.open()
    return new WebHidMcTransport(device)
  }

  request(packet: Uint8Array, expect: McExpect) {
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.device.removeEventListener('inputreport', onReport)
        reject(new Error('the keyboard did not answer'))
      }, 1000)
      const onReport = (e: HIDInputReportEvent) => {
        const r = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)
        if (!mcMatches(r, expect)) return
        clearTimeout(timer)
        this.device.removeEventListener('inputreport', onReport)
        resolve(r.slice())
      }
      this.device.addEventListener('inputreport', onReport)
      this.device.sendReport(0, packet as Uint8Array<ArrayBuffer>).catch((err) => {
        clearTimeout(timer)
        this.device.removeEventListener('inputreport', onReport)
        reject(err)
      })
    })
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    navigator.hid.removeEventListener('disconnect', this.onHidDisconnect)
    if (this.device.opened) await this.device.close()
  }
}

/** Demo / test: a simulated MCHOSE board with the memory areas FCC uses; checks every checksum, records requests. */
export class MockMcTransport implements McTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  readonly sent: Uint8Array[] = []
  private disconnects = new Emitter<void>()
  readonly areas = new Map<number, Uint8Array>()

  constructor(device: DeviceDef) {
    if (!device.mc) throw new Error('not an MCHOSE board')
    this.name = `${device.name} (demo)`
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.name }
    const mc = device.mc
    const a = (cmds: number[], size: number) => {
      const buf = new Uint8Array(size)
      cmds.forEach((c) => this.areas.set(c, buf))
      return buf
    }
    a([MC.INFO], 64).set([0x20, 0x01])
    a([MC.BASE], 64).set([0, 4, 0, 1, 2, 3])
    const func = a([MC.FUNC_GET, MC.FUNC_SET], 64 * 4)
    func.set([3, 80, 2, 0, 0, 0, 255, 255, 255], 8) // static, 80 %, white
    const defaults = a([MC.KEYS_DEFAULT], KEY_AREA * 16)
    const keys = a([MC.KEYS_GET, MC.KEYS_SET], KEY_AREA * 16)
    for (const [i, t, c1, c2] of mc.defaults) {
      defaults.set([t, c1, c2], i * 3)
      keys.set([t, c1, c2], i * 3)
    }
    const trig = a([MC.TRIGGER_GET, MC.TRIGGER_SET], 1024 * 4)
    const act = Math.round(1.5 * mc.step) - 1
    for (let i = 0; i < 128; i++) trig.set([0xa0, 0, act & 0xff, (act >> 8) & 1, 29, 0, 29, 0], i * 8)
    a([MC.MT_GET, MC.MT_SET], 256 * 4)
    a([MC.TGL_GET, MC.TGL_SET], 128 * 4)
    const colors = a([MC.COLORS_GET, MC.COLORS_SET], LIGHT_AREA * 4)
    for (let i = 0; i < 128; i++) colors.set([0, 229, 255], i * 3)
    const macros = a([MC.MACROS_GET, MC.MACROS_SET], 8192)
    macros.set([...Array.from({ length: 16 }, () => [64, 0]).flat(), 129, 126], 0)
    macros.set([0, 0, 128, 0], 64)
    a([MC.RESET], 64)
  }

  async request(packet: Uint8Array, expect: McExpect) {
    if (packet.length !== MC_REPORT_LEN || packet[0] !== REQUEST) throw new Error('bad request')
    const len = packet[4]
    const offset = packet[5] | (packet[6] << 8)
    const isWrite = [MC.FUNC_SET, MC.KEYS_SET, MC.COLORS_SET, MC.MACROS_SET, MC.TRIGGER_SET, MC.MT_SET, MC.TGL_SET, MC.RESET].includes(packet[1] as 6)
    const payload = isWrite ? packet.slice(8, 8 + len) : new Uint8Array(0)
    const sum = [len, packet[5], packet[6], 0, ...payload].reduce((x, y) => x + y, 0) & 0xff
    if (packet[3] !== sum) throw new Error(`bad checksum on command ${packet[1]}`)
    this.sent.push(packet.slice())
    const area = this.areas.get(packet[1])
    if (!area) throw new Error(`mock: unexpected command ${packet[1]}`)
    const out = new Uint8Array(MC_REPORT_LEN)
    out.set([REPLY, expect.cmd, 0, 0, len, expect.lo, expect.hi, 0])
    if (isWrite) area.set(payload, offset)
    else out.set(area.slice(offset, offset + len), 8)
    return out
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {}
}
