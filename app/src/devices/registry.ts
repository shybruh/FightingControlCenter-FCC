// Device registry: every keyboard the official driver knows, extracted into catalog.json.
// Only the Fighting68 has been verified on hardware; wired boards share its protocol and are
// offered as "untested", wireless dongles use a different packet size and are not supported yet.

import { hidFromCode } from '../data/keycodes'
import { FIGHTING68_KEYS, setLayout, type KeyDef } from '../data/layout'
import { setRtLimits, type RtLimits } from '../hid/codec'
import catalog from './catalog.json'

export type DeviceStatus = 'verified' | 'untested' | 'unsupported'

export interface DeviceDef {
  id: string
  name: string
  vendorId: number
  productId: number
  layout: string
  fnLayout: string | null
  transport: 'wired' | 'dongle' | 'unknown'
  status: DeviceStatus
  limits: RtLimits
}

/** [id, label, sub, code, hid, x, y, w, h] */
type CatalogKey = [number, string, string, string, number, number, number, number, number]

const data = catalog as unknown as { devices: Omit<DeviceDef, 'limits'> & { limits: Omit<RtLimits, 'actuationMin' | 'actuationMax'> }[]; layouts: Record<string, CatalogKey[]> }

export const DEVICES: DeviceDef[] = (data.devices as unknown as (DeviceDef & { limits: Omit<RtLimits, 'actuationMin' | 'actuationMax'> })[]).map((d) => ({
  ...d,
  limits: { ...d.limits, actuationMin: 10, actuationMax: d.limits.travel },
}))

export const FIGHTING68 = DEVICES.find((d) => d.id === 'fighting68')!

export function deviceById(id: string | null | undefined) {
  return DEVICES.find((d) => d.id === id)
}

/** Key geometry for a device. The official data's HID codes have a few mistakes, so the browser key code wins. */
export function layoutFor(device: DeviceDef): KeyDef[] {
  if (device.layout === 'fighting68-fcc') return FIGHTING68_KEYS
  const keys = data.layouts[device.layout] ?? []
  return keys.map(([id, label, sub, code, hid, x, y, w, h]) => ({
    id,
    label,
    sub: sub || undefined,
    hid: hidFromCode(code) ?? hid,
    x,
    y,
    w,
    h,
  }))
}

/** Makes `device` the active board: layout and switch limits everywhere in the app. */
export function activateDevice(device: DeviceDef) {
  setLayout(layoutFor(device))
  setRtLimits(device.limits)
}

/** Interfaces the app can talk to: wired boards on the 0xFF68 config page. */
export const WIRED_IDS = [...new Map(DEVICES.filter((d) => d.transport === 'wired').map((d) => [`${d.vendorId}:${d.productId}`, d])).values()].map(
  (d) => ({ vendorId: d.vendorId, productId: d.productId }),
)

export interface Detection {
  /** best guess (always set when anything matches the product id) */
  device: DeviceDef | null
  /** other boards sharing the product id; the user may need to pick */
  candidates: DeviceDef[]
  /** true when the guess is certain (unique id or exact name match) */
  certain: boolean
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Works out which board is connected from its USB ids and product name. */
export function detect(vendorId: number, productId: number, productName: string): Detection {
  const candidates = DEVICES.filter((d) => d.productId === productId && d.vendorId === vendorId && d.transport === 'wired')
  if (!candidates.length) return { device: null, candidates: [], certain: false }
  const byName = candidates.filter((d) => norm(d.name) === norm(productName))
  if (byName.length) {
    // prefer the verified entry, then the first match
    const pick = byName.find((d) => d.status === 'verified') ?? byName[0]
    return { device: pick, candidates, certain: true }
  }
  const layouts = new Set(candidates.map((d) => d.layout))
  return { device: candidates[0], candidates, certain: layouts.size === 1 }
}
