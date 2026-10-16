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

const KEY = 'fcc.theme.v1'
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

/** Puts the theme on the page, and on the desktop window's title bar. */
export function applyTheme(id: string) {
  const dark = isDarkTheme(id)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  // System shows plain Light or Dark
  root.dataset.theme = id === 'system' ? (dark ? 'dark' : 'light') : id
  root.style.colorScheme = dark ? 'dark' : 'light'
  if (isTauri()) {
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      const w = getCurrentWindow()
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

export const useTheme = create<{ theme: string; set(id: string): void }>((set) => ({
  theme: read(),
  set(id) {
    try {
      localStorage.setItem(KEY, id)
    } catch {}
    set({ theme: id })
    applyTheme(id)
  },
}))

/** Applies the saved theme now, and again whenever Windows switches between light and dark ("System"). */
export function startTheme() {
  useTheme.setState({ theme: read() })
  applyTheme(read())
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (useTheme.getState().theme === 'system') applyTheme('system')
    })
  }
}
