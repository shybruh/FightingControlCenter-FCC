// Keeps everything FCC stores (the "fcc." keys of localStorage) in a settings file in the Windows user folder, so
// profiles and settings survive a reinstall or a deleted portable copy. The file is loaded before the app starts and
// rewritten shortly after every change. See src-tauri/src/config.rs.

import { invoke } from '@tauri-apps/api/core'
import { errorText, log } from '../diag/log'
import { isTauri } from './env'

const PREFIX = 'fcc.'
const SAVE_DELAY_MS = 400

interface Loaded {
  enabled: boolean
  path: string
  data: Record<string, string> | null
  error: string | null
}

let timer: ReturnType<typeof setTimeout> | undefined
/** where the file lives (shown in Settings), null when it isn't used */
export let settingsFilePath: string | null = null
/** running portable with portable.txt: data stays beside the exe */
export let settingsPortable = false

function snapshot() {
  const out: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(PREFIX)) out[k] = localStorage.getItem(k) ?? ''
  }
  return out
}

function scheduleSave() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    invoke('config_save', { data: snapshot() }).catch((e) => log.error('settings', 'saving the settings file failed', errorText(e)))
  }, SAVE_DELAY_MS)
}

/** Loads the settings file into the app's storage, then saves every later change. Call before the app module loads. */
export async function restoreSettings() {
  if (!isTauri()) return
  let loaded: Loaded
  try {
    loaded = await invoke<Loaded>('config_load')
  } catch (e) {
    log.error('settings', 'reading the settings file failed', errorText(e))
    return
  }
  if (loaded.error) log.warn('settings', `settings file not used: ${loaded.error}`, loaded.path)
  if (!loaded.enabled) {
    settingsPortable = !loaded.error
    return
  }
  settingsFilePath = loaded.path

  if (loaded.data) {
    // the file is the source of truth; values only in the app's storage are kept and saved into it
    const keys = Object.keys(loaded.data).filter((k) => k.startsWith(PREFIX))
    for (const k of keys) localStorage.setItem(k, loaded.data[k])
    log.info('settings', `loaded ${keys.length} saved values from ${loaded.path}`)
  } else {
    log.info('settings', `no settings file yet; creating ${loaded.path}`)
  }
  scheduleSave()

  // every write of an "fcc." key goes to the file too
  const proto = Storage.prototype
  const setItem = proto.setItem
  const removeItem = proto.removeItem
  const clear = proto.clear
  proto.setItem = function (key: string, value: string) {
    setItem.call(this, key, value)
    if (this === localStorage && key.startsWith(PREFIX)) scheduleSave()
  }
  proto.removeItem = function (key: string) {
    removeItem.call(this, key)
    if (this === localStorage && key.startsWith(PREFIX)) scheduleSave()
  }
  proto.clear = function () {
    clear.call(this)
    if (this === localStorage) scheduleSave()
  }
}

export function openSettingsFolder() {
  return invoke('config_open_folder')
}
