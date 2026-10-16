// Themes: Light and Dark (index.css) plus the ones in themes.css. The choice lives in localStorage under the fcc.
// prefix, so the desktop settings file keeps it across updates. "System" follows Windows' light / dark setting.

import { create } from 'zustand'
import { isTauri } from './desktop/env'

export interface Theme {
  id: string
  label: string
  /** null: follows the system */
  dark: boolean | null
  /** for the picker's preview tile: background, card, primary */
  swatch: [string, string, string]
}

export const THEMES: Theme[] = [
  { id: 'system', label: 'System', dark: null, swatch: ['oklch(0.985 0 0)', 'oklch(0.205 0 0)', 'oklch(0.556 0 0)'] },
  { id: 'dark', label: 'Dark', dark: true, swatch: ['oklch(0.145 0 0)', 'oklch(0.205 0 0)', 'oklch(0.922 0 0)'] },
  { id: 'light', label: 'Light', dark: false, swatch: ['oklch(1 0 0)', 'oklch(0.97 0 0)', 'oklch(0.205 0 0)'] },
  { id: 'oled', label: 'OLED', dark: true, swatch: ['oklch(0 0 0)', 'oklch(0.13 0 0)', 'oklch(0.922 0 0)'] },
  { id: 'midnight', label: 'Midnight', dark: true, swatch: ['oklch(0.145 0.03 265)', 'oklch(0.2 0.03 265)', 'oklch(0.82 0.1 255)'] },
  { id: 'mocha', label: 'Mocha', dark: true, swatch: ['oklch(0.145 0.022 55)', 'oklch(0.2 0.022 55)', 'oklch(0.84 0.07 65)'] },
  { id: 'matcha', label: 'Matcha', dark: true, swatch: ['oklch(0.145 0.025 150)', 'oklch(0.2 0.025 150)', 'oklch(0.84 0.12 150)'] },
  { id: 'sakura', label: 'Sakura', dark: false, swatch: ['oklch(0.985 0.006 350)', 'oklch(0.955 0.012 350)', 'oklch(0.62 0.17 355)'] },
]

/** Accent colours: a hue, drawn bright on dark themes and deeper on light ones so text on it stays readable. */
export const ACCENTS: { id: string; label: string; hue: number; chroma: number }[] = [
  { id: 'blue', label: 'Blue', hue: 255, chroma: 0.15 },
  { id: 'violet', label: 'Violet', hue: 295, chroma: 0.17 },
  { id: 'pink', label: 'Pink', hue: 350, chroma: 0.17 },
  { id: 'red', label: 'Red', hue: 25, chroma: 0.18 },
  { id: 'orange', label: 'Orange', hue: 50, chroma: 0.16 },
  { id: 'amber', label: 'Amber', hue: 80, chroma: 0.15 },
  { id: 'green', label: 'Green', hue: 150, chroma: 0.16 },
  { id: 'teal', label: 'Teal', hue: 195, chroma: 0.12 },
]

type RGB = [number, number, number]

/** WCAG relative luminance of an sRGB colour (0–255 channels). */
function luminance([r, g, b]: RGB) {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/**
 * A custom accent the theme's background would swallow (near-white on Light, near-black on OLED) is darkened or
 * lightened just enough to stand out at 3:1, the usual minimum for controls; what was picked stays saved as it is.
 */
export function visibleOn(rgb: RGB, dark: boolean): RGB {
  // the themes' backgrounds: about #0a0a0a or darker, about white
  const bg = dark ? 0.004 : 0.97
  const contrast = (c: RGB) => {
    const l = luminance(c)
    return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05)
  }
  let c = rgb
  for (let step = 1; contrast(c) < 3 && step <= 20; step++) {
    const t = step / 20
    c = rgb.map((v) => Math.round(dark ? v + (255 - v) * t : v * (1 - t))) as RGB
  }
  return c
}

/** The colours an accent paints with in a dark or light theme: [colour, text on it]. Custom: "#rrggbb" as picked. */
export function accentColors(accent: string, dark: boolean): [string, string] | null {
  if (/^#[0-9a-f]{6}$/i.test(accent)) {
    const rgb = visibleOn([1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16)) as RGB, dark)
    return [`rgb(${rgb.join(' ')})`, luminance(rgb) > 0.4 ? 'oklch(0.18 0 0)' : 'oklch(0.99 0 0)']
  }
  const a = ACCENTS.find((x) => x.id === accent)
  if (!a) return null
  return dark
    ? [`oklch(0.78 ${a.chroma} ${a.hue})`, `oklch(0.2 0.04 ${a.hue})`]
    : [`oklch(0.56 ${a.chroma} ${a.hue})`, 'oklch(0.99 0 0)']
}

/** The tokens an accent takes over (everything else stays the theme's). */
const ACCENT_VARS = ['--primary', '--sidebar-primary', '--ring', '--sidebar-ring'] as const
const ACCENT_TEXT_VARS = ['--primary-foreground', '--sidebar-primary-foreground'] as const

/** Density: Compact shrinks text, spacing and the keyboard for laptop screens; Auto picks it for small windows. */
export const DENSITIES = [
  { id: 'auto', label: 'Auto' },
  { id: 'comfortable', label: 'Comfortable' },
  { id: 'compact', label: 'Compact' },
] as const
export type Density = (typeof DENSITIES)[number]['id']
const DENSITY_KEY = 'fcc.density.v1'
/** a window smaller than this is a laptop screen (or a small window): Auto goes compact */
const small = () => typeof window !== 'undefined' && (window.innerHeight < 820 || window.innerWidth < 1200)

function readDensity(): Density {
  try {
    const v = localStorage.getItem(DENSITY_KEY)
    if (v && DENSITIES.some((d) => d.id === v)) return v as Density
  } catch {}
  return 'auto'
}

/** Puts the density on the page (html.compact, see index.css and keyboard.css). */
export function applyDensity(d: Density) {
  document.documentElement.classList.toggle('compact', d === 'compact' || (d === 'auto' && small()))
}

const KEY = 'fcc.theme.v1'
const ACCENT_KEY = 'fcc.accent.v1'

function readAccent(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY)
    if (v && (ACCENTS.some((a) => a.id === v) || /^#[0-9a-f]{6}$/i.test(v))) return v
  } catch {}
  return 'default'
}
const systemDark = () => typeof matchMedia === 'undefined' || matchMedia('(prefers-color-scheme: dark)').matches

function read(): string {
  try {
    const v = localStorage.getItem(KEY)
    if (v && THEMES.some((t) => t.id === v)) return v
  } catch {}
  return 'dark'
}

/** Whether the theme (as chosen now) is a dark one. */
export function isDarkTheme(id: string) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[1]
  return t.dark ?? systemDark()
}

/** Puts the theme (and the accent on top of it) on the page, and on the desktop window's title bar. */
export function applyTheme(id: string, accent = readAccent()) {
  const dark = isDarkTheme(id)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  // System shows plain Light or Dark
  root.dataset.theme = id === 'system' ? (dark ? 'dark' : 'light') : id
  root.style.colorScheme = dark ? 'dark' : 'light'
  // the accent overrides the theme's own highlight colour; "default" leaves it alone
  const colors = accentColors(accent, dark)
  for (const v of ACCENT_VARS) colors ? root.style.setProperty(v, colors[0]) : root.style.removeProperty(v)
  for (const v of ACCENT_TEXT_VARS) colors ? root.style.setProperty(v, colors[1]) : root.style.removeProperty(v)
  if (isTauri()) {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const w = getCurrentWindow()
      // only the main window has a title bar; on a frameless one (tray panel) this would draw one
      if (w.label !== 'main') return
      w.setTheme(dark ? 'dark' : 'light').catch(() => undefined)
      // what shows for a moment while the window resizes
      const bg = getComputedStyle(root).getPropertyValue('--background').trim()
      if (bg) w.setBackgroundColor(cssToRgb(bg)).catch(() => undefined)
    })
  }
}

/** A colour the window can take (it doesn't read oklch): the browser converts it. */
function cssToRgb(css: string): [number, number, number] {
  const c = document.createElement('canvas').getContext('2d')
  if (!c) return [10, 10, 10]
  c.fillStyle = css
  c.fillRect(0, 0, 1, 1)
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

export const useTheme = create<{
  theme: string
  accent: string
  density: Density
  set(id: string): void
  setAccent(accent: string): void
  setDensity(d: Density): void
}>((set, get) => ({
  theme: read(),
  accent: readAccent(),
  density: readDensity(),
  setDensity(d) {
    try {
      localStorage.setItem(DENSITY_KEY, d)
    } catch {}
    set({ density: d })
    applyDensity(d)
  },
  set(id) {
    try {
      localStorage.setItem(KEY, id)
    } catch {}
    set({ theme: id })
    applyTheme(id, get().accent)
  },
  setAccent(accent) {
    try {
      localStorage.setItem(ACCENT_KEY, accent)
    } catch {}
    set({ accent })
    applyTheme(get().theme, accent)
  },
}))

/** Applies the saved theme now, and again whenever Windows switches between light and dark ("System"). */
export function startTheme() {
  useTheme.setState({ theme: read(), accent: readAccent(), density: readDensity() })
  applyTheme(read(), readAccent())
  applyDensity(readDensity())
  // Auto follows the window as it's resized
  window.addEventListener('resize', () => {
    if (useTheme.getState().density === 'auto') applyDensity('auto')
  })
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (useTheme.getState().theme === 'system') applyTheme('system', useTheme.getState().accent)
    })
  }
}
