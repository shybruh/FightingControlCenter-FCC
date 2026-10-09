// Wires the desktop shell (tray, global hotkeys, foreground watcher) to profile switching.
import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut'
import { create } from 'zustand'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'
import { prettyHotkey, profileHotkey, useDesktop } from './settings'

interface FocusedApp {
  exe: string
  title: string
}

/** Live desktop state for the UI (not persisted). */
export const useDesktopStatus = create<{
  focused: FocusedApp | null
  hotkeyErrors: Record<string, string>
  autoSwitched: { from: string | null; rule: string } | null
  /** true while the user is recording a new hotkey; global hotkeys are released meanwhile */
  recording: boolean
}>(() => ({ focused: null, hotkeyErrors: {}, autoSwitched: null, recording: false }))

/** How long a game must stay focused before its profile is applied (avoids alt-tab thrash). */
const FOCUS_SETTLE_MS = 800

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
      useDesktopStatus.setState({ focused: e.payload })
      clearTimeout(settle.current)
      settle.current = setTimeout(() => onFocus(e.payload), FOCUS_SETTLE_MS)
    })
    return () => {
      clearTimeout(settle.current)
      void off.then((u) => u())
    }
  }, [])
}

function onFocus(app: FocusedApp) {
  const { rulesEnabled, rules, revert } = useDesktop.getState()
  const store = useStore.getState()
  if (!rulesEnabled || store.status !== 'ready') return
  const status = useDesktopStatus.getState()
  const rule = rules.find((r) => r.exe.toLowerCase() === app.exe.toLowerCase() && store.profiles.some((p) => p.id === r.profileId))

  if (rule) {
    if (store.activeProfileId === rule.profileId) return
    // remember where we came from only on the first switch of an auto-switch chain
    const from = status.autoSwitched ? status.autoSwitched.from : store.activeProfileId
    useDesktopStatus.setState({ autoSwitched: { from, rule: rule.id } })
    switchAndNotify(rule.profileId, `Game · ${rule.label || rule.exe}`)
    return
  }

  // left the game: revert
  if (!status.autoSwitched) return
  const target = revert === 'previous' ? status.autoSwitched.from : revert === 'stay' ? null : revert.profileId
  useDesktopStatus.setState({ autoSwitched: null })
  if (target && store.profiles.some((p) => p.id === target)) switchAndNotify(target, `Left ${app.exe}`)
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
