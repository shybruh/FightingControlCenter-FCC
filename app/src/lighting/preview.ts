// Approximate on-screen simulation of the firmware lighting effects.
// The keyboard renders the real thing; this only has to look like it.

import { KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH, type KeyDef } from '../data/layout'
import { CUSTOM_EFFECT, type Led } from '../hid/codec'

export type RGB = [number, number, number]

export interface PressEvent {
  id: number
  at: number
}


const cx = (k: KeyDef) => k.x + k.w / 2
const cy = (k: KeyDef) => k.y + 0.5

export function hsv(h: number, s = 1, v = 1): RGB {
  h = ((h % 1) + 1) % 1
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const [r, g, b] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ][i % 6]
  return [r * 255, g * 255, b * 255]
}

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/** Stable per-key pseudo-random in [0,1). */
function rand(id: number, salt: number) {
  const s = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453
  return s - Math.floor(s)
}

/** Twinkle: each key fades in and out on its own random schedule. */
function twinkle(id: number, t: number, rate: number) {
  const period = 1.6 + rand(id, 1) * 2.4
  const phase = (t * rate) / period + rand(id, 2)
  const cycle = Math.floor(phase)
  const local = phase - cycle
  if (rand(id, cycle + 3) > 0.35) return 0
  return Math.sin(local * Math.PI)
}

/**
 * Colour of every key at time `t` (seconds).
 * `presses` drives the reactive effects; `custom` holds per-key colours for the custom mode.
 */
export function renderEffect(led: Led, t: number, presses: PressEvent[], custom: (id: number) => RGB): Map<number, RGB> {
  const W = LAYOUT_WIDTH
  const H = LAYOUT_HEIGHT
  const out = new Map<number, RGB>()
  const bright = 0.25 + (clamp01((led.brightness - 1) / 4) * 0.75)
  const speed = 0.35 + (led.speed - 1) * 0.35
  const dir = led.direction ? -1 : 1
  const ts = t * speed
  const base: RGB = [led.r, led.g, led.b]
  // colour at a position: either the chosen colour or a rainbow across the board
  const tone = (k: KeyDef, shift = 0): RGB => (led.rainbow ? hsv(cx(k) / W + shift) : base)
  const recent = presses.filter((p) => t - p.at < 2.5)

  for (const k of KEYS) {
    let c: RGB = [0, 0, 0]
    switch (led.effect) {
      case 0x01: // static
        c = tone(k)
        break
      case 0x07: // breathing
        c = scale(tone(k), 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(ts * 2.2)))
        break
      case 0x08: // spectrum cycle
        c = hsv(ts * 0.12)
        break
      case 0x06: // bloom — random rainbow twinkles
        c = scale(hsv(rand(k.id, Math.floor(ts * 0.6)) + ts * 0.05), 0.2 + 0.8 * twinkle(k.id, t, speed))
        break
      case 0x0b: // wave
      case 0x10: {
        // endless flow
        const p = (cx(k) / W) * dir - ts * 0.35
        c = led.rainbow || led.effect === 0x10 ? hsv(p) : scale(base, 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(p * Math.PI * 4)))
        break
      }
      case 0x0a: {
        // crosslines — a horizontal and a vertical line sweeping
        const col = ((ts * 3 * dir) % W + W) % W
        const row = ((ts * 1.2) % H + H) % H
        const v = Math.max(clamp01(1 - Math.abs(cx(k) - col)), clamp01(1 - Math.abs(cy(k) - row)))
        c = scale(tone(k, ts * 0.1), 0.08 + 0.92 * v)
        break
      }
      case 0x0c: {
        // winding peaks — zigzag band
        const p = cx(k) * dir + (k.y % 2 ? 1 : -1) * cy(k) * 1.5 - ts * 4
        c = scale(tone(k), 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(p * 0.6)))
        break
      }
      case 0x12: {
        // slanted rain — diagonal stripes
        const p = (cx(k) + cy(k) * 1.4) * dir - ts * 5
        const stripe = 0.5 + 0.5 * Math.sin(p * 0.9)
        c = scale(tone(k), 0.06 + 0.94 * stripe ** 3)
        break
      }
      case 0x09: {
        // fountain — rings radiating from the centre
        const d = Math.hypot(cx(k) - W / 2, (cy(k) - H / 2) * 1.6)
        c = scale(tone(k, -d * 0.04 + ts * 0.1), 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(d * 0.9 - ts * 4)))
        break
      }
      case 0x11: {
        // layered ridges — rows rising and falling
        const v = 0.5 + 0.5 * Math.sin(cy(k) * 1.3 - ts * 3 + cx(k) * 0.15)
        c = scale(tone(k), 0.1 + 0.9 * v)
        break
      }
      case 0x13: {
        // back & forth — a bar sweeping left and right
        const pos = (0.5 + 0.5 * Math.sin(ts * 1.6)) * W
        c = scale(tone(k), 0.06 + 0.94 * clamp01(1 - Math.abs(cx(k) - pos) / 2.2))
        break
      }
      case 0x04: // starry sky
        c = scale(tone(k), twinkle(k.id, t, speed))
        break
      case 0x05: // snowfall — twinkles drifting downward
        c = scale(led.rainbow ? hsv(rand(k.id, 9)) : base, twinkle(k.id + Math.floor(ts * 1.5 - k.y) * 7, t, speed * 1.4))
        break
      case 0x02: // reactive on — pressed key lights up then fades
      case 0x03: {
        // reactive off — everything lit, pressed key goes dark
        const hit = recent.filter((p) => p.id === k.id).map((p) => 1 - (t - p.at) / (1.6 / speed))
        const v = clamp01(Math.max(0, ...hit))
        c = led.effect === 0x02 ? scale(tone(k), v) : scale(tone(k), 1 - v)
        break
      }
      case 0x0d: // reactive burst
      case 0x0f: {
        // ripple — ring expanding from each press
        let v = 0
        for (const p of recent) {
          const src = KEYS.find((x) => x.id === p.id)
          if (!src) continue
          const age = (t - p.at) * speed * 9
          const d = Math.hypot(cx(k) - cx(src), (cy(k) - cy(src)) * 1.2)
          const ring = led.effect === 0x0f ? clamp01(1 - Math.abs(d - age) / 0.9) : clamp01(1 - d / Math.max(0.1, age * 0.5)) * clamp01(1 - age / 12)
          v = Math.max(v, ring * clamp01(1 - age / 14))
        }
        c = scale(tone(k), v)
        break
      }
      case 0x0e: {
        // reactive cross — pressed key lights its row and column
        let v = 0
        for (const p of recent) {
          const src = KEYS.find((x) => x.id === p.id)
          if (!src) continue
          const fade = clamp01(1 - (t - p.at) * speed * 0.8)
          if (k.y === src.y || Math.abs(cx(k) - cx(src)) < 0.75) v = Math.max(v, fade)
        }
        c = scale(tone(k), v)
        break
      }
      case CUSTOM_EFFECT:
        c = custom(k.id)
        break
      default:
        c = tone(k)
    }
    out.set(k.id, scale(c, bright))
  }
  return out
}

export const rgbCss = ([r, g, b]: RGB) => `rgb(${r | 0} ${g | 0} ${b | 0})`

/** Effects that only light up in response to key presses. */
export const REACTIVE = new Set([0x02, 0x0d, 0x0e, 0x0f])
