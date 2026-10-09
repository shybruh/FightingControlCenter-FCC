// Built-in per-key colour designs. They are applied with the firmware's custom per-key
// mode, so they persist on the keyboard like any other setting.

import { KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH, type KeyDef } from '../data/layout'
import { hsv, type RGB } from './preview'

export interface ColorPreset {
  id: string
  name: string
  color(k: KeyDef): RGB
}

const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB

/** Multi-stop gradient, t in [0,1]. */
function ramp(stops: string[], t: number): RGB {
  const c = stops.map(hex)
  const x = Math.max(0, Math.min(1, t)) * (c.length - 1)
  const i = Math.min(c.length - 2, Math.floor(x))
  return mix(c[i], c[i + 1], x - i)
}

const fx = (k: KeyDef) => (k.x + k.w / 2) / LAYOUT_WIDTH
const fy = (k: KeyDef) => (k.y + 0.5) / LAYOUT_HEIGHT
const diag = (k: KeyDef) => (fx(k) * 0.75 + fy(k) * 0.25)

// key groups by HID usage, so the designs work on every board
const hidSet = (...codes: number[]) => {
  const s = new Set(codes)
  return { has: (id: number) => s.has(KEYS.find((k) => k.id === id)?.hid ?? -1) }
}
const WASD = hidSet(0x1a, 0x04, 0x16, 0x07)
const ARROWS = hidSet(0x52, 0x51, 0x50, 0x4f)
const MODS = { has: (id: number) => {
  const k = KEYS.find((x) => x.id === id)
  return !!k && ([0x29, 0x2b, 0x39, 0x2a, 0x28].includes(k.hid) || (k.hid >= 0xe0 && k.hid <= 0xe7) || /^fn/i.test(k.label))
} }
const NUMBERS = hidSet(0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2d, 0x2e)
const NAV = hidSet(0x49, 0x4a, 0x4b, 0x4c, 0x4d, 0x4e, 0x46, 0x47, 0x48)
const SPACE = { valueOf: () => KEYS.find((k) => k.hid === 0x2c)?.id ?? -1 }

export const COLOR_PRESETS: ColorPreset[] = [
  { id: 'sunset', name: 'Sunset', color: (k) => ramp(['#ffb347', '#ff5e62', '#c33764', '#6a3093'], diag(k)) },
  { id: 'ocean', name: 'Ocean', color: (k) => ramp(['#00f5d4', '#00bbf9', '#1e3a8a'], fy(k) * 0.7 + fx(k) * 0.3) },
  { id: 'vaporwave', name: 'Vaporwave', color: (k) => ramp(['#ff71ce', '#b967ff', '#01cdfe', '#05ffa1'], diag(k)) },
  { id: 'synthwave', name: 'Synthwave', color: (k) => ramp(['#f72585', '#7209b7', '#3a0ca3', '#4cc9f0'], fy(k)) },
  { id: 'fire', name: 'Fire', color: (k) => ramp(['#ffea00', '#ff8800', '#ff2200', '#7a0000'], 1 - fy(k) + (fx(k) - 0.5) * 0.15) },
  { id: 'ice', name: 'Ice', color: (k) => ramp(['#ffffff', '#a5f3fc', '#38bdf8', '#1d4ed8'], fy(k)) },
  { id: 'forest', name: 'Forest', color: (k) => ramp(['#d9f99d', '#4ade80', '#15803d', '#064e3b'], diag(k)) },
  { id: 'aurora', name: 'Aurora', color: (k) => ramp(['#22d3ee', '#34d399', '#a78bfa', '#ec4899'], (fx(k) + Math.sin(fy(k) * 4) * 0.12)) },
  { id: 'cotton', name: 'Cotton candy', color: (k) => ramp(['#ffafcc', '#cdb4db', '#a2d2ff'], fx(k)) },
  { id: 'matrix', name: 'Matrix', color: (k) => mix(hex('#003b00'), hex('#00ff41'), ((k.x * 7 + k.y * 3) % 5) / 4) },
  { id: 'rainbow-cols', name: 'Rainbow', color: (k) => hsv(fx(k) * 0.9) },
  { id: 'rainbow-rows', name: 'Rainbow rows', color: (k) => hsv(fy(k) * 0.8) },
  {
    id: 'gamer',
    name: 'WASD focus',
    color: (k) => (WASD.has(k.id) || ARROWS.has(k.id) ? hex('#ff1f3d') : k.id === +SPACE || MODS.has(k.id) ? hex('#3b0a14') : hex('#140308')),
  },
  {
    id: 'mods',
    name: 'Mod accents',
    color: (k) => (MODS.has(k.id) || NAV.has(k.id) || ARROWS.has(k.id) ? hex('#f59e0b') : hex('#f5f5f5')),
  },
  {
    id: 'zones',
    name: 'Zones',
    color: (k) =>
      NUMBERS.has(k.id) ? hex('#a855f7') : WASD.has(k.id) ? hex('#ef4444') : ARROWS.has(k.id) || NAV.has(k.id) ? hex('#22d3ee') : MODS.has(k.id) || k.id === +SPACE ? hex('#334155') : hex('#e2e8f0'),
  },
  { id: 'white', name: 'Pure white', color: () => [255, 255, 255] },
]

export function presetColors(p: ColorPreset): Map<number, RGB> {
  return new Map(KEYS.map((k) => [k.id, p.color(k).map((v) => Math.round(Math.max(0, Math.min(255, v)))) as RGB]))
}
