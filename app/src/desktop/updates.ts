// App updates from GitHub Releases. Installed copies download the new installer (signed; the app checks the signature
// against the public key in tauri.conf.json) and restart into it. Portable copies can't replace themselves that way, so
// they get a link to the release page instead.

import { useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { create } from 'zustand'
import { errorText, log } from '../diag/log'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'

const RELEASES_URL = 'https://github.com/shybruh/FightingControlCenter---FCC/releases/latest'
const FIRST_CHECK_MS = 8_000
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

type Phase = 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'error'

interface UpdateState {
  phase: Phase
  current: string | null
  /** the newer version, when one is available */
  version: string | null
  notes: string
  /** 0–1 while downloading, null when the size is unknown */
  progress: number | null
  error: string | null
  /** installed with the installer (can update itself) rather than portable */
  installed: boolean
  /** the user closed the notice for this version */
  dismissed: string | null
}

export const useUpdates = create<UpdateState>(() => ({
  phase: 'idle',
  current: null,
  version: null,
  notes: '',
  progress: null,
  error: null,
  installed: false,
  dismissed: null,
}))

let pending: Update | null = null

export async function checkForUpdates(manual = false) {
  if (!isTauri() || useUpdates.getState().phase === 'checking' || useUpdates.getState().phase === 'downloading') return
  useUpdates.setState({ phase: 'checking', error: null })
  try {
    const [current, installed] = await Promise.all([getVersion(), invoke<boolean>('is_installed')])
    useUpdates.setState({ current, installed })
    const update = await check()
    pending = update
    if (update) {
      log.info('update', `version ${update.version} is available (running ${current})`)
      useUpdates.setState({ phase: 'available', version: update.version, notes: update.body ?? '' })
    } else {
      if (manual) log.info('update', `up to date (${current})`)
      useUpdates.setState({ phase: 'none', version: null })
    }
  } catch (e) {
    // no release published yet, offline, GitHub down: only worth reporting when asked
    log.warn('update', 'update check failed', errorText(e))
    const why = /valid release JSON|404/i.test(String(e))
      ? 'no published release to update from yet'
      : "couldn't reach GitHub (offline?)"
    useUpdates.setState({ phase: manual ? 'error' : 'idle', error: manual ? `${why}. Details in Diagnostics → Log.` : null })
  }
}

/** Installed: downloads, verifies and runs the new installer, then restarts. Portable: opens the release page. */
export async function installUpdate() {
  const { installed } = useUpdates.getState()
  if (!installed) {
    await invoke('open_project_page', { url: RELEASES_URL })
    return
  }
  if (!pending) return
  // anything still on its way to the keyboard goes out first
  await useStore.getState().flush().catch(() => undefined)
  useUpdates.setState({ phase: 'downloading', progress: 0 })
  let total = 0
  let got = 0
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === 'Started') total = e.data.contentLength ?? 0
      if (e.event === 'Progress') {
        got += e.data.chunkLength
        useUpdates.setState({ progress: total ? got / total : null })
      }
    })
    log.info('update', `installed ${pending.version}, restarting`)
    await relaunch()
  } catch (e) {
    log.error('update', 'update failed', errorText(e))
    useUpdates.setState({ phase: 'error', error: String(e) })
  }
}

/** Checks shortly after start and then every few hours. */
export function useUpdateChecks() {
  useEffect(() => {
    if (!isTauri()) return
    getVersion()
      .then((current) => useUpdates.setState({ current }))
      .catch(() => undefined)
    if (import.meta.env.DEV) return
    const first = setTimeout(() => void checkForUpdates(), FIRST_CHECK_MS)
    const every = setInterval(() => void checkForUpdates(), CHECK_EVERY_MS)
    return () => {
      clearTimeout(first)
      clearInterval(every)
    }
  }, [])
}
