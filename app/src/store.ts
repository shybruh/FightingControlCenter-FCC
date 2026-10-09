import { create } from 'zustand'
import { Keyboard, type KeyboardDriver, type RegionData } from './hid/device'
import { MockTransport } from './hid/mock'
import { MockRkTransport, RkKeyboard } from './hid/rk'
import { openDesktop, reconnectKeyboard, requestKeyboard, type Opened } from './hid/connect'
import { Cmd, PROFILE_REGIONS, ResetArg, type ProfileRegion, type RegionName } from './hid/protocol'
import { isTauri } from './hid/tauri'
import type { DeviceIdentity } from './hid/transport'
import { DEVICES, FIGHTING68, activateDevice, detect, deviceById, type DeviceDef } from './devices/registry'

export type ProfileData = Record<ProfileRegion, number[]>

export interface Profile {
  id: string
  name: string
  data: ProfileData
  /** host-only metadata the keyboard doesn't store */
  meta?: { macroNames?: string[] }
  updatedAt: number
}

interface Backup {
  at: number
  firmware: string
  regions: Record<string, number[]>
}

type Status = 'idle' | 'connecting' | 'loading' | 'ready'

interface State {
  status: Status
  demo: boolean
  /** desktop auto-connect; paused after a manual disconnect */
  autoConnect: boolean
  kb: KeyboardDriver | null
  regions: RegionData | null
  loadProgress: number
  pendingWrites: number
  error: string | null
  toast: string | null

  profiles: Profile[]
  activeProfileId: string | null

  /** the connected board's model */
  device: DeviceDef | null
  /** other models sharing the board's USB id; set while the user should confirm which one it is */
  deviceChoices: DeviceDef[] | null
  /** untested boards start read-only until the user allows changes */
  readOnly: boolean

  /** demo: true = demo Fighting68, a device id = demo of that model */
  connect(demo?: boolean | string): Promise<void>
  /** Writes the whole active profile to the keyboard (useful for write-only boards). */
  pushProfile(): Promise<void>
  tryReconnect(): Promise<void>
  disconnect(): Promise<void>
  update(region: RegionName, bytes: Uint8Array): void
  /** Several regions in one step; written in the given key order. */
  updateMany(patch: Partial<Record<RegionName, Uint8Array>>): void
  setMacroNames(names: string[]): void
  flush(): Promise<void>
  refresh(): Promise<void>

  createProfile(name: string): void
  duplicateProfile(id: string): void
  renameProfile(id: string, name: string): void
  deleteProfile(id: string): void
  activateProfile(id: string): Promise<void>
  importProfile(json: string): void
  exportProfile(id: string): void

  /** Switches the connected board to a different model (layout + limits) and remembers the choice. */
  chooseDevice(id: string): void
  /** Lifts read-only mode for the connected (untested) board and remembers it. */
  allowWrites(): void

  downloadBackup(): void
  factoryReset(): Promise<void>
  dismissError(): void
  showToast(msg: string): void
}

const PROFILES_KEY = 'fcc.profiles.v1'
const CHOICES_KEY = 'fcc.deviceChoices.v1'
const ALLOWED_KEY = 'fcc.allowedDevices.v1'

/** Profiles are per keyboard model: key indices differ between boards. The Fighting68 keeps the original key. */
let profilesKey = PROFILES_KEY
const profilesKeyFor = (device: DeviceDef | null) => (!device || device.id === FIGHTING68.id ? PROFILES_KEY : `${PROFILES_KEY}:${device.id}`)

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}
const identityKey = (i: DeviceIdentity) => `${i.vendorId}:${i.productId}:${i.productName}`
const BACKUPS_KEY = 'fcc.backups.v1'
const WRITE_DEBOUNCE_MS = 120

function loadProfiles(): { profiles: Profile[]; activeProfileId: string | null } {
  try {
    const raw = localStorage.getItem(profilesKey)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return { profiles: [], activeProfileId: null }
}

function saveProfiles(profiles: Profile[], activeProfileId: string | null) {
  try {
    localStorage.setItem(profilesKey, JSON.stringify({ profiles, activeProfileId }))
  } catch {
    /* storage full / unavailable — profiles stay in memory */
  }
}

function snapshot(regions: RegionData): ProfileData {
  return Object.fromEntries(PROFILE_REGIONS.map((r) => [r, Array.from(regions[r])])) as ProfileData
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e)
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

let switchChain: Promise<void> = Promise.resolve()
const timers = new Map<RegionName, ReturnType<typeof setTimeout>>()
const inflight = new Set<Promise<unknown>>()
let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useStore = create<State>((set, get) => {
  const initial = loadProfiles()

  const persistActive = (regions: RegionData) => {
    const { profiles, activeProfileId } = get()
    if (!activeProfileId) return
    const next = profiles.map((p) =>
      p.id === activeProfileId ? { ...p, data: snapshot(regions), updatedAt: Date.now() } : p,
    )
    set({ profiles: next })
    saveProfiles(next, activeProfileId)
  }

  const track = (p: Promise<unknown>) => {
    inflight.add(p)
    set((s) => ({ pendingWrites: s.pendingWrites + 1 }))
    p.finally(() => {
      inflight.delete(p)
      set((s) => ({ pendingWrites: s.pendingWrites - 1 }))
    })
    return p
  }

  const writeNow = async (region: RegionName) => {
    const { kb, regions } = get()
    if (!kb || !regions) return
    try {
      await kb.writeRegion(region, regions[region])
      if (region === 'rt') await kb.commit()
    } catch (e) {
      set({ error: `Write to ${region} failed: ${errMsg(e)}. Re-reading from keyboard.` })
      try {
        const fresh = await kb.readRegion(region)
        set((s) => (s.regions ? { regions: { ...s.regions, [region]: fresh } } : {}))
      } catch {
        /* connection is likely gone; disconnect handler takes over */
      }
    }
  }

  /** Makes `device` active: layout, switch limits, read-only state and its own profile store. */
  const applyDevice = (device: DeviceDef | null) => {
    activateDevice(device ?? FIGHTING68)
    profilesKey = profilesKeyFor(device)
    const allowed = readJson<string[]>(ALLOWED_KEY, [])
    const readOnly = !device || (device.status !== 'verified' && !allowed.includes(device.id))
    set({ device, readOnly, ...loadProfiles() })
  }

  const adoptKeyboard = (regions: RegionData) => {
    // The keyboard is the source of truth: the active profile adopts whatever is on it.
    let { profiles, activeProfileId } = get()
    if (!profiles.length) {
      const p: Profile = { id: uid(), name: 'Default', data: snapshot(regions), updatedAt: Date.now() }
      profiles = [p]
      activeProfileId = p.id
    } else {
      if (!profiles.some((p) => p.id === activeProfileId)) activeProfileId = profiles[0].id
      profiles = profiles.map((p) => (p.id === activeProfileId ? { ...p, data: snapshot(regions), updatedAt: Date.now() } : p))
    }
    saveProfiles(profiles, activeProfileId)
    set({ profiles, activeProfileId })
  }

  const loadDevice = async (source: Opened | KeyboardDriver, demo: boolean | string) => {
    set({ demo: !!demo, status: 'loading', loadProgress: 0, error: null })
    // which model is this? a remembered choice wins over detection
    const id = 'kind' in source ? source.transport.identity : source.identity
    const det = detect(id.vendorId, id.productId, id.productName)
    const remembered = deviceById(readJson<Record<string, string>>(CHOICES_KEY, {})[identityKey(id)])
    const device = demo === true ? FIGHTING68 : typeof demo === 'string' ? (deviceById(demo) ?? null) : (remembered ?? det.device)
    if ('kind' in source && source.kind === 'rk' && !device?.rk) {
      await source.transport.close()
      throw new Error("this Royal Kludge model isn't supported yet")
    }
    // the protocol decides the driver; the model decides layout and limits
    const kb: KeyboardDriver = !('kind' in source)
      ? source
      : source.kind === 'sonix'
        ? new Keyboard(source.transport)
        : new RkKeyboard(source.transport, device!)
    set({ kb })
    applyDevice(device)
    const sameFamily = (d: DeviceDef) => d.transport === 'wired' && d.protocol === (device?.protocol ?? 'sonix')
    set({
      deviceChoices:
        !demo && !remembered && (!det.certain || !det.device) ? (det.candidates.length ? det.candidates : DEVICES.filter(sameFamily)) : null,
    })
    // write-only boards can't report their settings: they start from the saved profile
    if (kb instanceof RkKeyboard) {
      const active = get().profiles.find((p) => p.id === get().activeProfileId)
      if (active) kb.seed(Object.fromEntries(PROFILE_REGIONS.map((r) => [r, Uint8Array.from(active.data[r])])))
    }
    kb.disconnected.on(() => {
      if (get().kb === kb) {
        set({ kb: null, regions: null, status: 'idle', error: 'Keyboard disconnected.' })
      }
    })
    const regions = await kb.readAll((_, i, total) => set({ loadProgress: i / total }))

    if (!demo && device?.caps.readBack !== false) {
      const backup: Backup = {
        at: Date.now(),
        firmware: `${regions.info[9]}.${regions.info[8].toString(16)}`,
        regions: Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Array.from(v)])),
      }
      try {
        const list: Backup[] = JSON.parse(localStorage.getItem(BACKUPS_KEY) || '[]')
        localStorage.setItem(BACKUPS_KEY, JSON.stringify([backup, ...list].slice(0, 5)))
      } catch {
        /* ignore */
      }
    }

    adoptKeyboard(regions)
    set({ regions, status: 'ready', loadProgress: 1 })
  }

  /** Blocks keyboard writes while read-only; returns true when blocked. */
  const blocked = () => {
    if (!get().readOnly) return false
    get().showToast('Read-only: allow changes for this keyboard first (banner at the top).')
    return true
  }

  return {
    status: 'idle',
    demo: false,
    autoConnect: true,
    kb: null,
    regions: null,
    loadProgress: 0,
    pendingWrites: 0,
    error: null,
    toast: null,
    ...initial,
    device: null,
    deviceChoices: null,
    readOnly: false,

    async connect(demo = false) {
      set({ status: 'connecting', error: null, autoConnect: !demo })
      try {
        const demoDevice = typeof demo === 'string' ? deviceById(demo) : undefined
        const opened: Opened | null = demoDevice?.protocol === 'rk'
          ? { kind: 'rk', transport: new MockRkTransport(demoDevice) }
          : demo
            ? { kind: 'sonix', transport: new MockTransport() }
            : isTauri()
              ? await openDesktop()
              : await requestKeyboard()
        if (!opened) {
          set({ status: 'idle' })
          return
        }
        await loadDevice(opened, demo)
      } catch (e) {
        await get().kb?.close().catch(() => undefined)
        set({ status: 'idle', kb: null, error: `Could not connect: ${errMsg(e)}` })
      }
    },

    async tryReconnect() {
      if (get().status !== 'idle') return
      try {
        // Desktop: connect whenever the keyboard is plugged in. Browser: only to an already-authorised device.
        const opened = isTauri() ? await openDesktop() : await reconnectKeyboard()
        if (opened) await loadDevice(opened, false)
      } catch {
        set({ status: 'idle', kb: null })
      }
    },

    async disconnect() {
      await get().flush()
      await get().kb?.close()
      set({ kb: null, regions: null, status: 'idle', autoConnect: false })
    },

    update(region, bytes) {
      get().updateMany({ [region]: bytes })
    },

    updateMany(patch) {
      const { regions } = get()
      if (!regions || blocked()) return
      const next = { ...regions, ...patch }
      set({ regions: next })
      const names = Object.keys(patch) as RegionName[]
      if (names.some((r) => (PROFILE_REGIONS as readonly string[]).includes(r))) persistActive(next)
      // One timer per batch keeps the write order stable (e.g. DKS slot before the key pointing at it).
      // A newer batch takes ownership of a region; older timers skip regions they no longer own.
      const fire = setTimeout(() => {
        const owned = names.filter((r) => timers.get(r) === fire)
        owned.forEach((r) => timers.delete(r))
        owned.forEach((r) => track(writeNow(r)))
      }, WRITE_DEBOUNCE_MS)
      for (const region of names) timers.set(region, fire)
    },

    setMacroNames(names) {
      const { profiles, activeProfileId } = get()
      const next = profiles.map((p) => (p.id === activeProfileId ? { ...p, meta: { ...p.meta, macroNames: names } } : p))
      set({ profiles: next })
      saveProfiles(next, activeProfileId)
    },

    async flush() {
      const pending = [...timers.keys()]
      new Set(timers.values()).forEach((t) => clearTimeout(t))
      timers.clear()
      pending.forEach((r) => track(writeNow(r)))
      await Promise.allSettled([...inflight])
    },

    async refresh() {
      const { kb } = get()
      if (!kb) return
      await get().flush()
      await loadDevice(kb, get().demo ? (get().device?.id ?? true) : false)
    },

    createProfile(name) {
      const { regions, profiles, activeProfileId } = get()
      if (!regions) return
      const p: Profile = { id: uid(), name, data: snapshot(regions), updatedAt: Date.now() }
      const next = [...profiles, p]
      set({ profiles: next })
      saveProfiles(next, activeProfileId)
    },

    duplicateProfile(id) {
      const { profiles, activeProfileId } = get()
      const src = profiles.find((p) => p.id === id)
      if (!src) return
      const copy: Profile = { ...structuredClone(src), id: uid(), name: `${src.name} copy`, updatedAt: Date.now() }
      const next = [...profiles, copy]
      set({ profiles: next })
      saveProfiles(next, activeProfileId)
    },

    renameProfile(id, name) {
      const { profiles, activeProfileId } = get()
      const next = profiles.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p))
      set({ profiles: next })
      saveProfiles(next, activeProfileId)
    },

    deleteProfile(id) {
      const { profiles, activeProfileId } = get()
      if (profiles.length <= 1 || id === activeProfileId) return
      const next = profiles.filter((p) => p.id !== id)
      set({ profiles: next })
      saveProfiles(next, activeProfileId)
    },

    activateProfile(id) {
      // Switches are chained so rapid hotkey presses apply in order against an up-to-date baseline.
      const run = async () => {
        const { kb, profiles, activeProfileId } = get()
        const p = profiles.find((x) => x.id === id)
        if (!kb || !p || id === activeProfileId || blocked()) return
        await get().flush()
        const current = get().regions
        if (!current) return
        const next = { ...current }
        for (const r of PROFILE_REGIONS) next[r] = Uint8Array.from(p.data[r])
        set({ regions: next, activeProfileId: id })
        saveProfiles(get().profiles, id)
        const job = (async () => {
          try {
            // Only rewrite regions that actually differ: much faster, and less wear on the keyboard.
            const changed = PROFILE_REGIONS.filter((r) => !sameBytes(current[r], next[r]))
            for (const r of changed) await kb.writeRegion(r, next[r])
            if (changed.length) await kb.commit()
            get().showToast(`Switched to “${p.name}”`)
          } catch (e) {
            set({ error: `Profile switch failed: ${errMsg(e)}. Reconnect to resync.` })
          }
        })()
        await track(job)
      }
      switchChain = switchChain.then(run, run)
      return switchChain
    },

    importProfile(json) {
      try {
        const parsed = JSON.parse(json)
        if (parsed.format !== 'fcc-profile' || !parsed.data) throw new Error('not an FCC profile file')
        // key indices differ between models, so a profile only fits the model it was made on
        const current = get().device?.id ?? FIGHTING68.id
        const made = parsed.deviceId ?? FIGHTING68.id
        if (made !== current) throw new Error(`it was made for ${deviceById(made)?.name ?? made}, not ${get().device?.name ?? 'this keyboard'}`)
        for (const r of PROFILE_REGIONS) {
          const arr = parsed.data[r]
          const expected = { keys: 512, led: 16, colors: 512, macros: 4008, rt: 1024, dks: 1024 }[r]
          if (!Array.isArray(arr) || arr.length !== expected || arr.some((v: unknown) => typeof v !== 'number' || v < 0 || v > 255)) {
            throw new Error(`region “${r}” is malformed`)
          }
        }
        const { profiles, activeProfileId } = get()
        const p: Profile = { id: uid(), name: String(parsed.name || 'Imported'), data: parsed.data, updatedAt: Date.now() }
        const next = [...profiles, p]
        set({ profiles: next })
        saveProfiles(next, activeProfileId)
        get().showToast(`Imported “${p.name}”`)
      } catch (e) {
        set({ error: `Import failed: ${errMsg(e)}` })
      }
    },

    exportProfile(id) {
      const p = get().profiles.find((x) => x.id === id)
      if (!p) return
      download(`${p.name.replace(/[^\w-]+/g, '_')}.fcc.json`, {
        format: 'fcc-profile',
        version: 1,
        device: get().device?.name ?? 'Fighting68',
        deviceId: get().device?.id ?? FIGHTING68.id,
        name: p.name,
        data: p.data,
      })
    },

    chooseDevice(id) {
      const device = deviceById(id)
      const { kb, regions } = get()
      if (!device) return
      // demo mode pretends to be a Fighting68, so its picks must not stick to the real board's identity
      if (kb && !get().demo) {
        const choices = readJson<Record<string, string>>(CHOICES_KEY, {})
        writeJson(CHOICES_KEY, { ...choices, [identityKey(kb.identity)]: id })
      }
      applyDevice(device)
      if (regions) adoptKeyboard(regions)
      set({ deviceChoices: null })
    },

    async pushProfile() {
      const { kb, regions } = get()
      if (!kb || !regions || blocked()) return
      await get().flush()
      const job = (async () => {
        try {
          for (const r of PROFILE_REGIONS) await kb.writeRegion(r, regions[r])
          await kb.commit()
          get().showToast('Profile written to the keyboard')
        } catch (e) {
          set({ error: `Writing the profile failed: ${errMsg(e)}` })
        }
      })()
      await track(job)
    },

    allowWrites() {
      const { device } = get()
      if (!device) return
      const allowed = readJson<string[]>(ALLOWED_KEY, [])
      if (!allowed.includes(device.id)) writeJson(ALLOWED_KEY, [...allowed, device.id])
      set({ readOnly: false })
    },

    downloadBackup() {
      const { regions } = get()
      if (!regions) return
      download(`fighting68-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`, {
        format: 'fcc-backup',
        version: 1,
        regions: Object.fromEntries(Object.entries(regions).map(([k, v]) => [k, Array.from(v)])),
      })
    },

    async factoryReset() {
      const { kb } = get()
      if (!kb || blocked()) return
      await get().flush()
      await kb.command(Cmd.Reset, [ResetArg.FactoryAll])
      await new Promise((r) => setTimeout(r, 1500))
      await get().refresh()
      get().showToast('Keyboard reset to factory settings')
    },

    dismissError() {
      set({ error: null })
    },

    showToast(msg) {
      clearTimeout(toastTimer)
      set({ toast: msg })
      toastTimer = setTimeout(() => set({ toast: null }), 2500)
    },
  }
})
