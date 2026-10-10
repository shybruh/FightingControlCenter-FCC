// Device scanner: every HID collection the PC (or the browser) can see, what it declares, and whether one of FCC's
// drivers would use it, with the reason. Read-only.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { DEVICES, MC_USAGE, MC_USAGE_PAGE, RK_FILTER, RK_PRODUCT_IDS, RK_VENDOR_ID, RY_USAGE, RY_USAGE_PAGE, RY_VENDOR_IDS, WIRED_IDS, isMcId, isRyId } from '../devices/registry'
import { isTauri } from '../hid/tauri'
import { CONFIG_USAGE, CONFIG_USAGE_PAGE } from '../hid/protocol'
import { parseDescriptor, usageName, type ReportSummary } from './descriptor'
import { errorText, hex, log } from './log'

export interface ScannedCollection {
  key: string
  vendorId: number
  productId: number
  product: string
  manufacturer: string
  usagePage: number
  usage: number
  interface: number | null
  path: string | null
  /** reports per kind: id -> bytes (desktop: from the descriptor; browser: from WebHID) */
  reports: Pick<ReportSummary, 'input' | 'output' | 'feature'> | null
  descriptor: number[] | null
  error: string | null
  /** what FCC makes of it */
  claim: string
  /** the browser device object, for listening */
  hid?: HIDDevice
}

const h4 = (n: number) => n.toString(16).padStart(4, '0')

/** Which driver would take this collection, and why (or why not). */
export function claimFor(vendorId: number, productId: number, usagePage: number, usage: number): string {
  const usb = `${h4(vendorId)}:${h4(productId)}`
  const model = DEVICES.find((d) => d.vendorId === vendorId && d.productId === productId)
  if (WIRED_IDS.some((d) => d.vendorId === vendorId && d.productId === productId)) {
    return usagePage === CONFIG_USAGE_PAGE && usage === CONFIG_USAGE ? 'Sonix HE driver: config collection ✓' : 'Sonix HE board, not its config collection'
  }
  if (vendorId === RK_VENDOR_ID) {
    const known = RK_PRODUCT_IDS.includes(productId)
    if (usagePage === RK_FILTER.usagePage && usage === RK_FILTER.usage)
      return known ? 'Royal Kludge driver: config interface ✓' : `Royal Kludge vendor id, but model ${usb} isn't in FCC's list`
    return known ? 'Royal Kludge board, other collection' : 'Sinowealth vendor id (shared by many devices)'
  }
  if (RY_VENDOR_IDS.includes(vendorId)) {
    if (usagePage === RY_USAGE_PAGE && usage === RY_USAGE)
      return isRyId(vendorId, productId) ? 'RongYuan RY5088 driver: config collection ✓ (model checked on connect)' : `RongYuan vendor id, but ${usb} isn't a keyboard FCC knows (mouse or receiver?)`
    return 'RongYuan vendor id, other collection'
  }
  if (isMcId(vendorId, productId)) {
    return usagePage === MC_USAGE_PAGE && usage === MC_USAGE ? 'MCHOSE driver: config collection ✓' : 'MCHOSE board, other collection'
  }
  return model ? `Known model (${model.name}), not a config collection` : 'Not a keyboard FCC knows'
}

interface RustCollection {
  path: string
  vendor_id: number
  product_id: number
  product: string
  manufacturer: string
  release: number
  usage_page: number
  usage: number
  interface: number
  bus: string
  descriptor: number[] | null
  error: string | null
}

export async function scanDevices(): Promise<ScannedCollection[]> {
  if (isTauri()) {
    const list = await invoke<RustCollection[]>('hid_scan', { descriptors: true })
    const out = list.map((c): ScannedCollection => {
      // on Windows each collection has its own path; its descriptor holds just that collection
      const parsed = c.descriptor ? parseDescriptor(c.descriptor) : []
      const mine = parsed.find((p) => p.usagePage === c.usage_page && p.usage === c.usage) ?? parsed[0]
      return {
        key: c.path,
        vendorId: c.vendor_id,
        productId: c.product_id,
        product: c.product,
        manufacturer: c.manufacturer,
        usagePage: c.usage_page,
        usage: c.usage,
        interface: c.interface,
        path: c.path,
        reports: mine ? { input: mine.input, output: mine.output, feature: mine.feature } : null,
        descriptor: c.descriptor,
        error: c.error,
        claim: claimFor(c.vendor_id, c.product_id, c.usage_page, c.usage),
      }
    })
    log.info('scan', `desktop scan: ${out.length} HID collections`)
    return out
  }
  if (!('hid' in navigator)) return []
  const devices = await navigator.hid.getDevices()
  const out = devices.flatMap((d, di) =>
    d.collections.map((c, ci): ScannedCollection => {
      const ids = (rs: HIDReportInfo[] | undefined) => Object.fromEntries((rs ?? []).map((r) => [r.reportId ?? 0, 0]))
      return {
        key: `${di}:${ci}`,
        vendorId: d.vendorId,
        productId: d.productId,
        product: d.productName,
        manufacturer: '',
        usagePage: c.usagePage ?? 0,
        usage: c.usage ?? 0,
        interface: null,
        path: null,
        reports: { input: ids(c.inputReports), output: ids(c.outputReports), feature: ids(c.featureReports) },
        descriptor: null,
        error: null,
        claim: claimFor(d.vendorId, d.productId, c.usagePage ?? 0, c.usage ?? 0),
        hid: d,
      }
    }),
  )
  log.info('scan', `browser scan: ${devices.length} permitted device(s), ${out.length} collections`)
  return out
}

/** Browser only: lets the user grant access to any HID device (the picker lists everything). */
export async function pickAnyDevice() {
  await navigator.hid.requestDevice({ filters: [] })
}

export interface LiveReport {
  at: number
  data: number[]
}

/** Watches one collection's input reports; returns a stop function. */
export async function listenTo(c: ScannedCollection, onReport: (r: LiveReport) => void, onError: (e: string) => void): Promise<() => void> {
  log.info('scan', `listening to ${h4(c.vendorId)}:${h4(c.productId)} ${usageName(c.usagePage, c.usage)}`)
  if (isTauri()) {
    const offReport = await listen<{ path: string; data: number[]; at: number }>('scan-report', (e) => {
      if (e.payload.path === c.path) onReport({ at: e.payload.at, data: e.payload.data })
    })
    const offError = await listen<string>('scan-error', (e) => onError(e.payload))
    try {
      await invoke('scan_listen', { path: c.path })
    } catch (e) {
      offReport()
      offError()
      throw e
    }
    return () => {
      offReport()
      offError()
      void invoke('scan_stop')
    }
  }
  const d = c.hid
  if (!d) throw new Error('no device')
  if (!d.opened) await d.open()
  const handler = (e: HIDInputReportEvent) =>
    onReport({ at: Date.now(), data: [e.reportId, ...new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength)] })
  d.addEventListener('inputreport', handler)
  return () => d.removeEventListener('inputreport', handler)
}

/** Plain-text summary of a scan for sharing. */
export function scanText(list: ScannedCollection[]) {
  return list
    .map((c) => {
      const reps = c.reports
        ? (['input', 'output', 'feature'] as const)
            .map((k) => {
              const e = Object.entries(c.reports![k])
              return e.length ? `${k} ${e.map(([id, n]) => `0x${Number(id).toString(16)}${n ? `(${n}B)` : ''}`).join(',')}` : ''
            })
            .filter(Boolean)
            .join('; ')
        : 'reports unknown'
      return [
        `${h4(c.vendorId)}:${h4(c.productId)} "${c.product}"${c.manufacturer ? ` by ${c.manufacturer}` : ''}${c.interface != null ? ` if${c.interface}` : ''}`,
        `  ${usageName(c.usagePage, c.usage)} | ${reps}`,
        `  FCC: ${c.claim}`,
        c.error ? `  note: ${c.error}` : '',
        c.descriptor ? `  descriptor: ${hex(c.descriptor, 4096)}` : '',
        c.path ? `  path: ${c.path}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n')
}

export { errorText }
