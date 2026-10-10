// Diagnostic log: every connection step, every packet in and out (hex) and every error, kept in memory so it can be
// viewed, copied or saved from Diagnostics. Nothing leaves the PC unless the user copies or saves it.

export type Level = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  /** ms since page load */
  t: number
  /** wall clock, for the export */
  at: number
  level: Level
  /** where it came from: app, connect, sonix, rk, ry, mc, scan … */
  area: string
  msg: string
  data?: unknown
}

const MAX = 5000
const entries: LogEntry[] = []
const listeners = new Set<() => void>()
let notifyQueued = false

/** Packets of the live travel stream etc.; off by default so they don't drown everything else. */
export const logSettings = { noisy: false }

function notify() {
  if (notifyQueued) return
  notifyQueued = true
  queueMicrotask(() => {
    notifyQueued = false
    listeners.forEach((l) => l())
  })
}

function push(level: Level, area: string, msg: string, data?: unknown) {
  entries.push({ t: performance.now(), at: Date.now(), level, area, msg, data })
  if (entries.length > MAX) entries.splice(0, entries.length - MAX)
  notify()
}

export const hex = (bytes: ArrayLike<number> | undefined | null, max = 128) => {
  if (!bytes) return ''
  const a = Array.from(bytes).slice(0, max)
  const s = a.map((b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ')
  return bytes.length > max ? `${s} … (+${bytes.length - max})` : s
}

export const errorText = (e: unknown) =>
  e instanceof Error ? `${e.name}: ${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 6).join('\n')}` : ''}` : String(e)

export const log = {
  debug: (area: string, msg: string, data?: unknown) => push('debug', area, msg, data),
  info: (area: string, msg: string, data?: unknown) => push('info', area, msg, data),
  warn: (area: string, msg: string, data?: unknown) => push('warn', area, msg, data),
  error: (area: string, msg: string, data?: unknown) => push('error', area, msg, data),
  /** one packet; `noisy` ones (streams) are only kept when enabled */
  packet(area: string, dir: 'out' | 'in', bytes: ArrayLike<number>, note?: string, noisy = false) {
    if (noisy && !logSettings.noisy) return
    push('debug', area, `${dir === 'out' ? '→' : '←'} ${hex(bytes)}${note ? `  (${note})` : ''}`)
  },
}

export function logEntries(): readonly LogEntry[] {
  return entries
}

export function clearLog() {
  entries.length = 0
  notify()
}

export function onLog(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

const stamp = (e: LogEntry) => `${new Date(e.at).toISOString().slice(11, 23)} +${(e.t / 1000).toFixed(3)}s`

export function formatEntry(e: LogEntry) {
  const data = e.data === undefined ? '' : `\n    ${(typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 1)).replace(/\n/g, '\n    ')}`
  return `${stamp(e)} ${e.level.toUpperCase().padEnd(5)} [${e.area}] ${e.msg}${data}`
}

/** Plain-text export with what's needed to read it later. */
export function logText(header: Record<string, string>) {
  const head = Object.entries({ ...header, exported: new Date().toISOString(), userAgent: navigator.userAgent })
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return `FCC diagnostic log\n${head}\n${'-'.repeat(60)}\n${entries.map(formatEntry).join('\n')}\n`
}

// errors that escape everything else
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => push('error', 'app', `uncaught: ${e.message}`, e.error ? errorText(e.error) : `${e.filename}:${e.lineno}`))
  window.addEventListener('unhandledrejection', (e) => push('error', 'app', 'unhandled promise rejection', errorText(e.reason)))
}
