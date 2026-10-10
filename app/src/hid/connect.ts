// Finds a supported keyboard over WebHID (browser) or the native bridge (desktop) and says which protocol it speaks.
import { RK_FILTER, RK_VENDOR_ID, RY_FILTERS, RY_USAGE, RY_USAGE_PAGE, RY_VENDOR_IDS } from '../devices/registry'
import { WebHidRkTransport, type FeatureTransport } from './rk'
import { WebHidRyTransport, type RyTransport } from './ry'
import { TauriRkTransport, TauriRyTransport, TauriTransport, isTauri } from './tauri'
import { FILTERS, WebHidTransport, isConfigInterface, type Transport } from './transport'

export type Opened =
  | { kind: 'sonix'; transport: Transport }
  | { kind: 'rk'; transport: FeatureTransport }
  | { kind: 'ry'; transport: RyTransport }

const isRkInterface = (d: HIDDevice) =>
  d.vendorId === RK_VENDOR_ID && d.collections.some((c) => c.usagePage === RK_FILTER.usagePage && c.usage === RK_FILTER.usage)

const isRyInterface = (d: HIDDevice) =>
  RY_VENDOR_IDS.includes(d.vendorId) && d.collections.some((c) => c.usagePage === RY_USAGE_PAGE && c.usage === RY_USAGE)

async function openHid(devices: HIDDevice[]): Promise<Opened | null> {
  const sonix = devices.find(isConfigInterface)
  if (sonix) return { kind: 'sonix', transport: await WebHidTransport.open(sonix) }
  const rk = devices.find(isRkInterface)
  if (rk) return { kind: 'rk', transport: await WebHidRkTransport.open(rk) }
  const ry = devices.find(isRyInterface)
  if (ry) return { kind: 'ry', transport: await WebHidRyTransport.open(ry) }
  return null
}

/** Browser: shows the device picker (needs a user gesture). */
export async function requestKeyboard(): Promise<Opened | null> {
  return openHid(await navigator.hid.requestDevice({ filters: [...FILTERS, RK_FILTER, ...RY_FILTERS] }))
}

/** Browser: reopens a previously authorised keyboard without a picker. */
export async function reconnectKeyboard(): Promise<Opened | null> {
  if (!('hid' in navigator)) return null
  return openHid(await navigator.hid.getDevices())
}

/** Desktop: whichever supported keyboard is plugged in, Sonix boards first. */
export async function openDesktop(): Promise<Opened | null> {
  if (!isTauri()) return null
  if (await TauriTransport.available()) return { kind: 'sonix', transport: await TauriTransport.open() }
  if (await TauriRkTransport.available()) return { kind: 'rk', transport: await TauriRkTransport.open() }
  if (await TauriRyTransport.available()) return { kind: 'ry', transport: await TauriRyTransport.open() }
  return null
}

export async function desktopAvailable() {
  return (await TauriTransport.available()) || (await TauriRkTransport.available()) || (await TauriRyTransport.available())
}
