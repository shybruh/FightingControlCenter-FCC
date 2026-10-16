// Night schedule: lights off between two times (desktop app). Uses the store's temporary "lights off", so the profile
// keeps its lighting and it comes back as it was. Turning the lights on by hand (tray) holds until the next start.

import { create } from 'zustand'

export interface LightSchedule {
  enabled: boolean
  /** "HH:MM", local time */
  from: string
  to: string
}

const KEY = 'fcc.lightSchedule.v1'
const DEFAULTS: LightSchedule = { enabled: false, from: '23:00', to: '08:00' }
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function read(): LightSchedule {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (v && typeof v.enabled === 'boolean' && TIME.test(v.from) && TIME.test(v.to)) return v
  } catch {}
  return DEFAULTS
}

const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))

/** Whether `now` falls in the off period (which may run past midnight). */
export function inSchedule(s: LightSchedule, now = new Date()) {
  if (!s.enabled) return false
  const m = now.getHours() * 60 + now.getMinutes()
  const a = minutes(s.from)
  const b = minutes(s.to)
  if (a === b) return false
  return a < b ? m >= a && m < b : m >= a || m < b
}

export const useSchedule = create<LightSchedule & { set(p: Partial<LightSchedule>): void }>((set, get) => ({
  ...read(),
  set(p) {
    const next = { enabled: get().enabled, from: get().from, to: get().to, ...p }
    if (!TIME.test(next.from) || !TIME.test(next.to)) return
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {}
    set(next)
  },
}))
