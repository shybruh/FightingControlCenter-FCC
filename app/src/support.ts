// Support requests: a USB keyboard FCC doesn't know yet, described well enough to tell which chip family it is and
// how to talk to it, as a GitHub issue body.
//
// The readable part is what the user typed (brand, model, product page, notes) plus a short summary of the board's
// USB interfaces. The raw part is a gzip+base64 JSON blob (```fcc-request) with each interface's report descriptor:
// the board's own description of the reports it accepts, which is what decides how FCC would talk to it.
// Nothing typed on the keyboard is ever read; serial numbers are left out.

import { invoke } from '@tauri-apps/api/core'
import { DEVICES, MC_IDS, RAZER_VENDOR_ID, RK_VENDOR_ID, RY_VENDOR_IDS, STEELSERIES_VENDOR_ID, isMcId, isRazerId, isRyId, isSinowealthId, isSteelSeriesId } from './devices/registry'
import { parseDescriptor, usageName, type ReportSummary } from './diag/descriptor'
import { CONFIG_USAGE_PAGE } from './hid/protocol'
import { isTauri } from './hid/tauri'
import { gzipBase64, platform, toBase64 } from './report'

export interface UsbInterface {
  usagePage: number
  usage: number
  interface: number | null
  /** report id -> size in bytes, per kind */
  reports: Pick<ReportSummary, 'input' | 'output' | 'feature'> | null
  /** raw report descriptor (desktop app only) */
  descriptor: number[] | null
}

export interface UsbKeyboard {
  vendorId: number
  productId: number
  product: string
  manufacturer: string
  /** firmware revision the board reports over USB (desktop app only) */
  release: number | null
  interfaces: UsbInterface[]
  /** FCC has this USB id in its catalogue */
  known: boolean
}

export interface RequestDetails {
  brand: string
  model: string
  link: string
  notes: string
}

const h2 = (n: number) => n.toString(16).padStart(2, '0')
const h4 = (n: number) => n.toString(16).padStart(4, '0')
export const usbId = (k: { vendorId: number; productId: number }) => `${h4(k.vendorId)}:${h4(k.productId)}`

const isKeyboard = (i: UsbInterface) => i.usagePage === 0x01 && i.usage === 0x06
/** a configuration interface: what gaming keyboards expose and office / laptop keyboards don't */
const isVendor = (i: UsbInterface) => i.usagePage >= 0xff00
// wireless receivers too: FCC talks to keyboards over the cable
const NOT_A_KEYBOARD = /mouse|receiver|dongle|headset|controller|gamepad|touchpad|2\.4 ?g|wireless/i

export function isKnownId(vendorId: number, productId: number) {
  return DEVICES.some((d) => d.vendorId === vendorId && d.productId === productId) || isRyId(vendorId, productId) || isMcId(vendorId, productId) || isRazerId(vendorId, productId) || isSteelSeriesId(vendorId, productId) || isSinowealthId(vendorId, productId)
}

/** What the USB vendor id (and the interfaces) suggest about the chip, for the request and the dialog. */
export function chipGuess(k: Pick<UsbKeyboard, 'vendorId' | 'interfaces'>): string {
  if (k.vendorId === 0x0c45) return 'Sonix (the same family as most boards FCC supports)'
  if (RY_VENDOR_IDS.includes(k.vendorId)) return 'RongYuan (MonsGeek / Akko family)'
  if (MC_IDS.some(([v]) => v === k.vendorId)) return 'MCHOSE family'
  if (k.vendorId === RK_VENDOR_ID) return 'Sinowealth (Royal Kludge and others)'
  if (k.vendorId === RAZER_VENDOR_ID) return 'Razer'
  if (k.vendorId === STEELSERIES_VENDOR_ID) return 'SteelSeries'
  if (k.interfaces.some((i) => i.usagePage === CONFIG_USAGE_PAGE)) return 'Unknown vendor, but with a Sonix-style configuration interface'
  return 'Unknown'
}

// ---------- finding keyboards ----------

export interface RustCollection {
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
}

function summarise(descriptor: number[] | null, usagePage: number, usage: number): UsbInterface['reports'] {
  if (!descriptor) return null
  const parsed = parseDescriptor(descriptor)
  const mine = parsed.find((p) => p.usagePage === usagePage && p.usage === usage) ?? parsed[0]
  return mine ? { input: mine.input, output: mine.output, feature: mine.feature } : null
}

/** Groups HID collections into USB devices and keeps the ones that act as a keyboard. */
function keyboards(list: Omit<UsbKeyboard, 'known'>[]): UsbKeyboard[] {
  return list
    .filter((k) => k.interfaces.some(isKeyboard) && !NOT_A_KEYBOARD.test(k.product))
    .map((k) => ({ ...k, known: isKnownId(k.vendorId, k.productId) }))
}

/** Desktop app: every USB keyboard on the PC (with report descriptors when `descriptors`). */
async function desktopKeyboards(descriptors: boolean): Promise<UsbKeyboard[]> {
  return fromScan(await invoke<RustCollection[]>('hid_scan', { descriptors }))
}

/** The desktop scan's HID collections, as USB keyboards. */
export function fromScan(list: RustCollection[]): UsbKeyboard[] {
  const byId = new Map<string, Omit<UsbKeyboard, 'known'>>()
  for (const c of list) {
    // built-in and Bluetooth keyboards aren't what FCC is for
    if (c.bus.toLowerCase() !== 'usb') continue
    const key = `${c.vendor_id}:${c.product_id}`
    const k = byId.get(key) ?? { vendorId: c.vendor_id, productId: c.product_id, product: c.product.trim(), manufacturer: c.manufacturer.trim(), release: c.release, interfaces: [] }
    if (!k.product && c.product.trim()) k.product = c.product.trim()
    k.interfaces.push({ usagePage: c.usage_page, usage: c.usage, interface: c.interface, reports: summarise(c.descriptor, c.usage_page, c.usage), descriptor: c.descriptor })
    byId.set(key, k)
  }
  return keyboards([...byId.values()])
}

/** Browser: the devices this site may use (see pickKeyboard). WebHID gives report sizes but not raw descriptors. */
async function browserKeyboards(): Promise<UsbKeyboard[]> {
  if (!('hid' in navigator)) return []
  const devices = await navigator.hid.getDevices()
  const bytes = (r: HIDReportInfo) => Math.ceil((r.items ?? []).reduce((n, it) => n + (it.reportSize ?? 0) * (it.reportCount ?? 0), 0) / 8)
  const sizes = (rs: HIDReportInfo[] | undefined) => Object.fromEntries((rs ?? []).map((r) => [r.reportId ?? 0, bytes(r)]))
  const byId = new Map<string, Omit<UsbKeyboard, 'known'>>()
  for (const d of devices) {
    const key = `${d.vendorId}:${d.productId}`
    const k = byId.get(key) ?? { vendorId: d.vendorId, productId: d.productId, product: d.productName, manufacturer: '', release: null, interfaces: [] }
    for (const c of d.collections) {
      k.interfaces.push({
        usagePage: c.usagePage ?? 0,
        usage: c.usage ?? 0,
        interface: null,
        reports: { input: sizes(c.inputReports), output: sizes(c.outputReports), feature: sizes(c.featureReports) },
        descriptor: null,
      })
    }
    byId.set(key, k)
  }
  return keyboards([...byId.values()])
}

export function listKeyboards(descriptors = false) {
  return isTauri() ? desktopKeyboards(descriptors) : browserKeyboards()
}

/** Browser only: the picker that lets the user hand a keyboard to this site. */
export async function pickKeyboard() {
  await navigator.hid.requestDevice({ filters: [] })
}

// ---------- the start-screen notice ----------

const HIDDEN_KEY = 'fcc.supportHidden.v1'

export function hiddenIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function hideId(id: string) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...new Set([...hiddenIds(), id])]))
  } catch {
    /* storage unavailable: hidden until the app restarts */
  }
}

/** Desktop app: plugged-in keyboards FCC doesn't support that look configurable, minus the ones the user hid. */
export async function findUnsupported(): Promise<UsbKeyboard[]> {
  if (!isTauri()) return []
  return unsupportedOf(await desktopKeyboards(false), hiddenIds())
}

export const unsupportedOf = (list: UsbKeyboard[], hidden: string[]) =>
  list.filter((k) => !k.known && k.interfaces.some(isVendor) && !hidden.includes(usbId(k)))

// ---------- the request ----------

function interfaceLine(i: UsbInterface) {
  const reports = i.reports
    ? (['input', 'output', 'feature'] as const)
        .map((kind) => {
          const e = Object.entries(i.reports![kind])
          return e.length ? `${kind} ${e.map(([id, n]) => `0x${h2(Number(id))}${n ? ` (${n} B)` : ''}`).join(', ')}` : ''
        })
        .filter(Boolean)
        .join('; ')
    : ''
  return `- ${i.interface != null ? `interface ${i.interface}, ` : ''}${usageName(i.usagePage, i.usage)}${reports ? `: ${reports}` : ''}`
}

/** One-line markdown-safe text: the user's words go into a table. */
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim()

export async function buildRequest(board: UsbKeyboard, details: RequestDetails) {
  // the desktop app reads the descriptors only now, for this one board
  const full = isTauri() ? ((await desktopKeyboards(true)).find((k) => k.vendorId === board.vendorId && k.productId === board.productId) ?? board) : board
  const name = [details.brand, details.model].map(cell).filter(Boolean).join(' ') || full.product || 'Unknown keyboard'
  const usb = usbId(full)

  const json = {
    format: 'fcc-request',
    v: 1,
    app: __APP_VERSION__,
    platform: platform(),
    usb: { vendorId: full.vendorId, productId: full.productId, product: full.product, manufacturer: full.manufacturer, release: full.release },
    known: full.known,
    details: { brand: details.brand.trim(), model: details.model.trim(), link: details.link.trim() },
    interfaces: full.interfaces.map((i) => ({ ...i, descriptor: i.descriptor ? toBase64(i.descriptor) : null })),
  }
  const blob = (await gzipBase64(JSON.stringify(json))).match(/.{1,76}/g)!.join('\n')
  const rows = [
    ['Keyboard', name],
    ['Product page', details.link.trim() ? cell(details.link) : '(not given)'],
    ['USB id', `\`${usb}\``],
    ['USB name', full.product || '(empty)'],
    ['Maker (USB)', full.manufacturer || '(empty)'],
    ['Firmware (USB)', full.release != null ? `0x${h4(full.release)}` : 'n/a'],
    ['Chip guess', chipGuess(full)],
    ['FCC', `${__APP_VERSION__}, ${platform()}`],
  ]
  const markdown = [
    `### ${name}`,
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '### Notes',
    '',
    details.notes.trim() || '_Nothing added._',
    '',
    '### USB interfaces',
    '',
    ...full.interfaces.map(interfaceLine),
    '',
    '<details><summary>Raw data for FCC (please keep)</summary>',
    '',
    '```fcc-request',
    blob,
    '```',
    '',
    '</details>',
    '',
  ].join('\n')
  return { title: `Support request: ${name} (${usb})`, markdown }
}
