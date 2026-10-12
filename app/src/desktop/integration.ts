// Wires the desktop shell (tray, global hotkeys, foreground watcher) to profile switching.
import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { create } from 'zustand'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'
import { prettyHotkey, profileHotkey, useDesktop, type GameRule } from './settings'

interface FocusedApp {
  exe: string
  title: string
  /** FCC's own window */
  self?: boolean
}

/** The game profile that's on because a game was focused, and what to go back to. */
interface AutoSwitch {
  /** profile active before the first game switch */
  from: string | null
  rule: string
  exe: string
  label: string
}

/** Live desktop state for the UI (not persisted). */
export const useDesktopStatus = create<{
  /** last focused app other than FCC (shown in the game profiles card) */
  focused: FocusedApp | null
  hotkeyErrors: Record<string, string>
  autoSwitched: AutoSwitch | null
  /** true while the user is recording a new hotkey; global hotkeys are released meanwhile */
  recording: boolean
}>(() => ({ focused: null, hotkeyErrors: {}, autoSwitched: null, recording: false }))

/** How long a game must stay focused before its profile is applied (avoids alt-tab thrash). */
const FOCUS_SETTLE_MS = 800
/** How often to check that the game behind an auto-switch is still running. */
const GAME_EXIT_POLL_MS = 2000

/** what has focus right now, FCC included */
let currentFocus: FocusedApp | null = null

export function useDesktopIntegration() {
  const profiles = useStore((s) => s.profiles)
  const activeId = useStore((s) => s.activeProfileId)
  const status = useStore((s) => s.status)
  const d = useDesktop()
  const recording = useDesktopStatus((s) => s.recording)

  // ---- tray menu mirrors the profile list ----
  useEffect(() => {
    if (!isTauri()) return
    const items = status === 'ready' ? profiles.map((p) => ({ id: p.id, name: p.name })) : []
    invoke('set_tray_profiles', { profiles: items, active: status === 'ready' ? activeId : null }).catch(() => undefined)
  }, [profiles, activeId, status])

  useEffect(() => {
    if (!isTauri()) return
    const off = listen<string>('tray-profile', (e) => useStore.getState().activateProfile(e.payload))
    return () => void off.then((u) => u())
  }, [])

  useEffect(() => {
    if (isTauri()) invoke('set_close_to_tray', { enabled: d.closeToTray }).catch(() => undefined)
  }, [d.closeToTray])

  // ---- global hotkeys ----
  const hotkeySig = JSON.stringify([d.hotkeysEnabled, d.profileHotkeys, d.cycleHotkey, profiles.map((p) => p.id), recording])
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    ;(async () => {
      await unregisterAll().catch(() => undefined)
      if (cancelled || !d.hotkeysEnabled || recording) return useDesktopStatus.setState({ hotkeyErrors: {} })
      const errors: Record<string, string> = {}
      const bind = async (key: string, acc: string | null, action: () => void) => {
        if (!acc) return
        try {
          await register(acc, (e) => e.state === 'Pressed' && action())
        } catch (err) {
          errors[key] = String(err).includes('already') ? 'Taken by another app' : 'Could not register'
        }
      }
      const list = useStore.getState().profiles
      for (const [i, p] of list.entries()) {
        const acc = profileHotkey(d.profileHotkeys, p.id, i)
        await bind(p.id, acc, () => switchAndNotify(p.id, `Hotkey · ${prettyHotkey(acc)}`))
      }
      await bind('cycle', d.cycleHotkey, () => {
        const { profiles: ps, activeProfileId } = useStore.getState()
        if (!ps.length) return
        const i = ps.findIndex((p) => p.id === activeProfileId)
        switchAndNotify(ps[(i + 1) % ps.length].id, `Next profile · ${prettyHotkey(d.cycleHotkey)}`)
      })
      if (!cancelled) useDesktopStatus.setState({ hotkeyErrors: errors })
    })()
    return () => {
      cancelled = true
    }
  }, [hotkeySig]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- per-game auto switching ----
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!isTauri()) return
    const off = listen<FocusedApp>('foreground-app', (e) => {
      currentFocus = e.payload
      if (!e.payload.self) useDesktopStatus.setState({ focused: e.payload })
      clearTimeout(settle.current)
      settle.current = setTimeout(() => onFocus(e.payload), FOCUS_SETTLE_MS)
    })
    return () => {
      clearTimeout(settle.current)
      void off.then((u) => u())
    }
  }, [])

  // a switch can't happen while the keyboard is (re)connecting: catch up once it's ready
  useEffect(() => {
    if (status !== 'ready') return
    if (currentFocus) onFocus(currentFocus)
    void checkRunning()
  }, [status])

  // games start and close while something else (or nothing) has focus: watch their processes
  useEffect(() => {
    if (!isTauri() || !d.rulesEnabled) return
    const timer = setInterval(() => void checkRunning(), GAME_EXIT_POLL_MS)
    return () => clearInterval(timer)
  }, [d.rulesEnabled])
}

const sameExe = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** The rule for `exe`, if it has one whose profile still exists. */
function ruleFor(exe: string) {
  const { rules } = useDesktop.getState()
  const { profiles } = useStore.getState()
  return rules.find((r) => sameExe(r.exe, exe) && profiles.some((p) => p.id === r.profileId))
}

function onFocus(app: FocusedApp) {
  const { rulesEnabled, switchWhile, fccLeavesGame } = useDesktop.getState()
  if (!rulesEnabled || useStore.getState().status !== 'ready') return
  const rule = app.self ? undefined : ruleFor(app.exe)
  if (rule) return enterGame(rule)

  // "while running": only the game closing ends it (see checkRunning)
  if (switchWhile === 'running') return
  if (app.self && !fccLeavesGame) return
  const auto = useDesktopStatus.getState().autoSwitched
  if (auto) leaveGame(`Left ${auto.label}`)
}

function enterGame(rule: GameRule) {
  const store = useStore.getState()
  const status = useDesktopStatus.getState()
  if (status.autoSwitched?.rule === rule.id && store.activeProfileId === rule.profileId) return
  // remember where we came from only on the first switch of an auto-switch chain
  const from = status.autoSwitched ? status.autoSwitched.from : store.activeProfileId
  const label = rule.label || rule.exe
  useDesktopStatus.setState({ autoSwitched: { from, rule: rule.id, exe: rule.exe, label } })
  switchAndNotify(rule.profileId, `Game · ${label}`)
}

let checking = false

/** Notices games closing and, in "while running" mode, games starting. */
async function checkRunning() {
  const { rulesEnabled, rules, switchWhile } = useDesktop.getState()
  const auto = useDesktopStatus.getState().autoSwitched
  if (!isTauri() || !rulesEnabled || checking || useStore.getState().status !== 'ready') return
  const names = switchWhile === 'running' ? rules.map((r) => r.exe) : auto ? [auto.exe] : []
  if (!names.length) return
  checking = true
  try {
    const running = await invoke<string[]>('running_exes', { names }).catch(() => null)
    if (!running) return
    const isRunning = (exe: string) => running.some((r) => sameExe(r, exe))
    const current = useDesktopStatus.getState().autoSwitched
    if (current && isRunning(current.exe)) return
    if (switchWhile === 'running') {
      // the focused game first, then the first running one in the list
      const focused = currentFocus && !currentFocus.self ? ruleFor(currentFocus.exe) : undefined
      const next = (focused && isRunning(focused.exe) ? focused : undefined) ?? rules.map((r) => ruleFor(r.exe)).find((r) => r && isRunning(r.exe))
      if (next) return enterGame(next)
    }
    if (current) leaveGame(`Closed ${current.label}`)
  } finally {
    checking = false
  }
}

/** Out of the game (focus moved away, or it closed): apply the "when you leave the game" choice. */
function leaveGame(reason: string) {
  const { revert } = useDesktop.getState()
  const store = useStore.getState()
  const auto = useDesktopStatus.getState().autoSwitched
  // keep the auto-switch until the keyboard is ready, so the revert isn't lost
  if (!auto || store.status !== 'ready') return
  const target = revert === 'previous' ? auto.from : revert === 'stay' ? null : revert.profileId
  useDesktopStatus.setState({ autoSwitched: null })
  if (target && store.profiles.some((p) => p.id === target)) switchAndNotify(target, reason)
}

/** Switches profile and, when FCC isn't the focused window, shows the on-screen popup. */
async function switchAndNotify(profileId: string, reason: string) {
  const store = useStore.getState()
  if (store.activeProfileId === profileId) return
  await store.activateProfile(profileId)
  const { osdEnabled, osdPosition } = useDesktop.getState()
  if (!osdEnabled || document.hasFocus()) return
  const { profiles, activeProfileId } = useStore.getState()
  const index = profiles.findIndex((p) => p.id === activeProfileId)
  if (index < 0) return
  invoke('show_osd', { title: profiles[index].name, subtitle: reason, index: index + 1, position: osdPosition }).catch(() => undefined)
}
