// Writes the diagnostic log to a file per day as well (see log_append in src-tauri/src/config.rs), so what happened to
// the keyboard can be looked up after FCC was closed: Diagnostics only keeps this session, in memory.

import { invoke } from '@tauri-apps/api/core'
import { formatEntry, onEntry, type LogEntry } from '../diag/log'
import { isTauri } from './env'

const FLUSH_MS = 2000

let pending: LogEntry[] = []
let timer: ReturnType<typeof setTimeout> | undefined
let started = false

const localDay = (at: number) => {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Writes what's waiting now (also before quitting). */
export function flushLogFile(): Promise<unknown> {
  clearTimeout(timer)
  timer = undefined
  if (!pending.length) return Promise.resolve()
  const batch = pending
  pending = []
  // a batch can span midnight: each day's lines go to that day's file
  const byDay = new Map<string, string[]>()
  for (const e of batch) {
    const day = localDay(e.at)
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(formatEntry(e, true))
  }
  // a failed write is dropped, not logged: logging it would write again
  return Promise.all([...byDay].map(([day, lines]) => invoke('log_append', { day, text: lines.join('\n') + '\n' }).catch(() => undefined)))
}

/** Starts mirroring the log to the day's file (main window of the desktop app only). */
export function startLogFile(version: string) {
  if (!isTauri() || started) return
  started = true
  pending.push({ t: performance.now(), at: Date.now(), level: 'info', area: 'app', msg: `---- FCC ${version} started ${new Date().toString()}` })
  onEntry((e) => {
    // a few seconds of live travel is thousands of packets: they'd fill the day's file
    if (e.noisy) return
    pending.push(e)
    timer ??= setTimeout(() => void flushLogFile(), FLUSH_MS)
  })
  // closing or quitting: write what's left
  window.addEventListener('pagehide', () => void flushLogFile())
  void flushLogFile()
}

export function openLogFolder() {
  return invoke('log_open_folder')
}
