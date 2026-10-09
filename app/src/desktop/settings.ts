import { create } from 'zustand'

export interface GameRule {
  id: string
  /** executable name, matched case-insensitively, e.g. VALORANT-Win64-Shipping.exe */
  exe: string
  /** friendly label (window title when picked from the list) */
  label: string
  profileId: string
}

/** What happens when you leave a game that triggered a switch. */
export type RevertMode = 'previous' | 'stay' | { profileId: string }

interface DesktopSettings {
  closeToTray: boolean
  hotkeysEnabled: boolean
  /** profile id -> accelerator; missing = default by position (Ctrl+Alt+1…9), null = none */
  profileHotkeys: Record<string, string | null>
  cycleHotkey: string | null
  rulesEnabled: boolean
  rules: GameRule[]
  revert: RevertMode
  osdEnabled: boolean
  osdPosition: 'top' | 'bottom'
}

interface DesktopStore extends DesktopSettings {
  set(patch: Partial<DesktopSettings>): void
}

const KEY = 'fcc.desktop.v1'

const DEFAULTS: DesktopSettings = {
  closeToTray: true,
  hotkeysEnabled: true,
  profileHotkeys: {},
  cycleHotkey: 'Ctrl+Alt+Digit0',
  rulesEnabled: true,
  rules: [],
  revert: 'previous',
  osdEnabled: true,
  osdPosition: 'top',
}

function load(): DesktopSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

export const useDesktop = create<DesktopStore>((set, get) => ({
  ...load(),
  set(patch) {
    set(patch)
    const { set: _omit, ...data } = { ...get(), ...patch }
    void _omit
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch {
      /* keep in memory */
    }
  },
}))

/** Effective hotkey for the profile at `index`. */
export function profileHotkey(map: Record<string, string | null>, id: string, index: number): string | null {
  if (id in map) return map[id]
  return index < 9 ? `Ctrl+Alt+Digit${index + 1}` : null
}

/** Human-readable accelerator, e.g. "Ctrl+Alt+Digit1" -> "Ctrl + Alt + 1". */
export function prettyHotkey(acc: string | null): string {
  if (!acc) return 'None'
  return acc
    .split('+')
    .map((p) => p.replace(/^Digit/, '').replace(/^Key/, '').replace(/^Numpad/, 'Num '))
    .join(' + ')
}

/** Builds an accelerator from a keydown, or null if only modifiers are held. */
export function acceleratorFromEvent(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
  // a global hotkey without modifiers would hijack normal typing / gameplay
  if (!mods.length && !/^F\d+$/.test(e.code)) return null
  return [...mods, e.code].join('+')
}
