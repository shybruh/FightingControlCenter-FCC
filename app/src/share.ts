// Share codes: a profile's lighting and rapid-trigger settings as one line of text ("FCC1-…") that works on other
// keyboards too. Nothing board-specific travels: effects go by name, keys by what they are (their HID usage, or the
// name of a light that isn't a key), travel in 0.01 mm. Importing maps all of it onto the connected board, keeps its
// limits, and says what didn't fit. Macros, DKS, SOCD and the keymap stay out: they only make sense on one model.
//
// Reading a code never trusts it: size caps on the text and on what it unpacks to, and every value is checked
// before anything is built from it.

import type { Capabilities } from './devices/registry'
import { KEYS, type KeyDef } from './data/layout'
import { CUSTOM_EFFECT, EFFECTS, RT_LIMITS, decodeColor, decodeLed, decodeRT, encodeLed, withColorMap, withRT } from './hid/codec'
import type { RegionName } from './hid/protocol'

const PREFIX = 'FCC1-'
/** longest code accepted (a full per-key lighting + RT code for a full-size board is ~3 kB) */
const MAX_CODE = 16_000
/** most a code may unpack to */
const MAX_JSON = 200_000
const MAX_KEYS = 300

type RGB = [number, number, number]

export interface SharedSettings {
  v: 1
  name: string
  /** the keyboard it was made on, for the import summary */
  from: string
  lighting?: {
    effect: string
    color: RGB
    rainbow: boolean
    brightness: number
    speed: number
    direction: number
    /** per-key colours: [key, r, g, b] */
    keys: [string, number, number, number][]
  }
  rt?: {
    /** [key, actuation, press, release, flags], travel in 0.01 mm (press / release 0 = rapid trigger off) */
    keys: [string, number, number, number, number][]
  }
}

/** What a key is, independent of the board: its HID usage, or the name of a light that isn't a key. */
export const keyName = (k: KeyDef) => (k.hid > 0 ? `h${k.hid.toString(16)}` : `l:${k.label}`)

// ---------- making a code ----------

export interface ShareSource {
  name: string
  from: string
  led: ArrayLike<number>
  colors: ArrayLike<number>
  rt: ArrayLike<number>
  caps: Capabilities | undefined
}

export function sharedFrom(src: ShareSource, parts: { lighting: boolean; rt: boolean }): SharedSettings {
  const out: SharedSettings = { v: 1, name: src.name.slice(0, 60), from: src.from.slice(0, 80) }
  const named = new Map<string, KeyDef>()
  for (const k of KEYS) if (!named.has(keyName(k))) named.set(keyName(k), k)
  if (parts.lighting) {
    const led = decodeLed(Uint8Array.from(src.led))
    const colors = Uint8Array.from(src.colors)
    out.lighting = {
      effect: led.effect === 0 ? 'Off' : (EFFECTS.find((e) => e.id === led.effect)?.name ?? 'Static'),
      color: [led.r, led.g, led.b],
      rainbow: led.rainbow,
      brightness: led.brightness,
      speed: led.speed,
      direction: led.direction,
      keys: src.caps?.perKeyRgb === false ? [] : [...named].filter(([, k]) => k.id < 126).map(([n, k]) => [n, ...(decodeColor(colors, k.id) as RGB)]),
    }
  }
  if (parts.rt && src.caps?.performance !== false) {
    const rt = Uint8Array.from(src.rt)
    out.rt = {
      keys: [...named].map(([n, k]) => {
        const r = decodeRT(rt, k.id)
        return [n, r.actuation, r.press, r.release, r.flags & 7]
      }),
    }
  }
  return out
}

function toBase64Url(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  const b = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > limit) {
      await reader.cancel()
      throw new Error('the code unpacks to more than a profile can hold')
    }
    chunks.push(value)
  }
  const out = new Uint8Array(size)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export async function encodeShareCode(s: SharedSettings) {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(s)), new CompressionStream('deflate-raw'))
  return PREFIX + toBase64Url(packed)
}

// ---------- reading a code ----------

const int = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const keyOk = (k: unknown) => str(k, 40) && /^(h[0-9a-f]{1,2}|l:.+)$/.test(k as string)

/** The settings in a share code, checked; throws with a readable reason when it isn't one. */
export async function decodeShareCode(text: string): Promise<SharedSettings> {
  const code = text.replace(/\s+/g, '')
  if (!code.startsWith(PREFIX)) throw new Error("that isn't an FCC share code (they start with FCC1-)")
  if (code.length > MAX_CODE) throw new Error('the code is too long')
  const body = code.slice(PREFIX.length)
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error('the code is damaged (unexpected characters)')
  let data: unknown
  try {
    data = JSON.parse(new TextDecoder().decode(await pipe(fromBase64Url(body), new DecompressionStream('deflate-raw'), MAX_JSON)))
  } catch (e) {
    throw new Error(e instanceof Error && /unpacks/.test(e.message) ? e.message : 'the code is damaged or incomplete')
  }
  const d = data as Partial<SharedSettings>
  if (!d || typeof d !== 'object' || d.v !== 1) throw new Error('this code is from a newer FCC: update the app first')
  if (!str(d.name, 60) || !str(d.from, 80)) throw new Error('the code is damaged (name)')
  const out: SharedSettings = { v: 1, name: d.name, from: d.from }
  if (d.lighting !== undefined) {
    const l = d.lighting
    const ok =
      l && str(l.effect, 40) && Array.isArray(l.color) && l.color.length === 3 && l.color.every((c) => int(c, 0, 255)) &&
      typeof l.rainbow === 'boolean' && int(l.brightness, 0, 5) && int(l.speed, 0, 5) && int(l.direction, 0, 1) &&
      Array.isArray(l.keys) && l.keys.length <= MAX_KEYS &&
      l.keys.every((k) => Array.isArray(k) && k.length === 4 && keyOk(k[0]) && int(k[1], 0, 255) && int(k[2], 0, 255) && int(k[3], 0, 255))
    if (!ok) throw new Error('the code is damaged (lighting)')
    out.lighting = { effect: l.effect, color: [l.color[0], l.color[1], l.color[2]], rainbow: l.rainbow, brightness: l.brightness, speed: l.speed, direction: l.direction, keys: l.keys }
  }
  if (d.rt !== undefined) {
    const r = d.rt
    const ok =
      r && Array.isArray(r.keys) && r.keys.length <= MAX_KEYS &&
      r.keys.every((k) => Array.isArray(k) && k.length === 5 && keyOk(k[0]) && int(k[1], 0, 1000) && int(k[2], 0, 1000) && int(k[3], 0, 1000) && int(k[4], 0, 7))
    if (!ok) throw new Error('the code is damaged (rapid trigger)')
    out.rt = { keys: r.keys }
  }
  if (!out.lighting && !out.rt) throw new Error('the code holds no settings')
  return out
}

// ---------- applying it ----------

export interface SharePlan {
  /** the regions to write, built from the board's current ones */
  patch: Partial<Record<RegionName, Uint8Array>>
  /** one line per part, for the import dialog */
  notes: string[]
  /** parts this board can't take */
  skipped: string[]
}

/** Maps shared settings onto the connected board: its keys, its effects, its travel limits. */
export function planImport(s: SharedSettings, current: { led: Uint8Array; colors: Uint8Array; rt: Uint8Array }, caps: Capabilities | undefined): SharePlan {
  const patch: SharePlan['patch'] = {}
  const notes: string[] = []
  const skipped: string[] = []
  const byName = new Map<string, KeyDef[]>()
  for (const k of KEYS) byName.set(keyName(k), [...(byName.get(keyName(k)) ?? []), k])

  if (s.lighting) {
    const l = s.lighting
    const wanted = l.effect.toLowerCase()
    const match = wanted === 'off' ? null : EFFECTS.find((e) => e.name.toLowerCase() === wanted)
    // an effect this board doesn't have: show the colours per key if there are any, else a static colour
    const fallback = l.keys.length && caps?.perKeyRgb !== false ? EFFECTS.find((e) => e.id === CUSTOM_EFFECT) : EFFECTS.find((e) => e.name === 'Static')
    const effect = wanted === 'off' ? 0 : (match ?? fallback ?? EFFECTS[0]).id
    patch.led = encodeLed(current.led, {
      ...decodeLed(current.led),
      effect,
      r: l.color[0],
      g: l.color[1],
      b: l.color[2],
      rainbow: l.rainbow,
      brightness: l.brightness || 5,
      speed: l.speed || 3,
      direction: l.direction,
    })
    const effectName = effect === 0 ? 'Off' : (EFFECTS.find((e) => e.id === effect)?.name ?? l.effect)
    notes.push(match || wanted === 'off' ? `Lighting: ${effectName}` : `Lighting: ${effectName} (this keyboard has no "${l.effect}")`)
    if (l.keys.length && caps?.perKeyRgb !== false) {
      const colors = new Map<number, RGB>()
      for (const [name, r, g, b] of l.keys) for (const k of byName.get(name) ?? []) colors.set(k.id, [r, g, b])
      patch.colors = withColorMap(current.colors, colors)
      notes.push(`Per-key colours: ${colors.size} of ${KEYS.length} keys`)
    } else if (l.keys.length) {
      skipped.push('per-key colours (this keyboard has none)')
    }
  }

  if (s.rt) {
    if (caps?.performance === false) {
      skipped.push('actuation and rapid trigger (this keyboard has no adjustable switches)')
    } else {
      let rt = current.rt
      let matched = 0
      let adjusted = 0
      for (const [name, actuation, press, release, flags] of s.rt.keys) {
        for (const k of byName.get(name) ?? []) {
          const keep = decodeRT(rt, k.id)
          rt = withRT(rt, [k.id], { actuation, press, release, flags: caps?.rtFlags === false ? keep.flags : flags })
          const got = decodeRT(rt, k.id)
          matched++
          if (got.actuation !== actuation || got.press !== press || got.release !== release) adjusted++
        }
      }
      patch.rt = rt
      notes.push(`Actuation and rapid trigger: ${matched} of ${KEYS.length} keys`)
      if (adjusted) notes.push(`${adjusted} key${adjusted === 1 ? '' : 's'} adjusted to this keyboard's range (${RT_LIMITS.actuationMin / 100}–${RT_LIMITS.actuationMax / 100} mm)`)
    }
  }
  return { patch, notes, skipped }
}
