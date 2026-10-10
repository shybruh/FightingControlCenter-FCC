// Board reports: everything needed to verify (or add) a keyboard, as a GitHub issue body.
//
// The readable part is a short summary plus a checklist the tester ticks. The raw part is a gzip+base64 JSON blob
// (```fcc-report) that tools/report/decode.js turns back into region dumps and catalogue changes.
// Macro contents are never included: they can hold typed text.

import { detect, type DeviceDef } from './devices/registry'
import { KEYS } from './data/layout'
import { decodeInfo } from './hid/codec'
import type { RegionData } from './hid/device'
import { isTauri } from './hid/tauri'
import type { DeviceIdentity } from './hid/transport'

export const REPO_URL = 'https://github.com/shybruh/FightingControlCenter---FCC/'
/** GitHub rejects much longer issue URLs; past this the report is pasted instead of prefilled */
const MAX_URL = 7500

export interface ReportInput {
  identity: DeviceIdentity
  device: DeviceDef | null
  /** settings as read when the keyboard connected (null for write-only boards) */
  regions: RegionData | null
  demo: boolean
}

export interface Report {
  title: string
  markdown: string
  json: object
}

const hex4 = (n: number) => n.toString(16).padStart(4, '0')

function toBase64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function gzipBase64(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return toBase64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

function platform() {
  const ua = navigator.userAgent
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'unknown OS'
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : 'browser'
  return isTauri() ? `${os} desktop app` : `${os}, ${browser} (web)`
}

/** Features the tester can tick, limited to what this board has. */
function checklist(device: DeviceDef | null) {
  const caps = device?.caps
  const items = [
    'Connects, and the keyboard on screen matches mine',
    'Lighting effects, brightness, speed and colour apply',
    caps?.perKeyRgb !== false && 'Per-key colours (custom lighting) apply',
    'Remapping a key works (and resetting it)',
    caps?.performance !== false && 'Actuation point / rapid trigger change how keys feel',
    caps?.performance !== false && 'Live key travel moves when I press keys',
    caps?.advancedKeys !== false && 'Advanced keys (DKS, mod-tap, toggle, SOCD)',
    caps?.macros !== false && 'Macros',
    'Switching profiles applies the whole profile',
    caps?.keyboardSettings !== false && 'Keyboard settings (polling rate, sleep)',
  ]
  return items.filter(Boolean).map((t) => `- [ ] ${t}`)
}

export async function buildReport({ identity, device, regions, demo }: ReportInput): Promise<Report> {
  const det = detect(identity.vendorId, identity.productId, identity.productName)
  const info = regions ? decodeInfo(regions.info) : null
  const usb = `${hex4(identity.vendorId)}:${hex4(identity.productId)}`
  const detection = det.certain && det.device
    ? 'recognised'
    : det.candidates.length
      ? `${det.candidates.length} models share this USB id`
      : 'not in the device list'

  const json = {
    format: 'fcc-report',
    v: 1,
    app: __APP_VERSION__,
    platform: platform(),
    demo,
    usb: { vendorId: identity.vendorId, productId: identity.productId, name: identity.productName },
    detected: { certain: det.certain, id: det.device?.id ?? null, candidates: det.candidates.map((d) => d.id) },
    model: device ? { id: device.id, name: device.name, status: device.status, protocol: device.protocol } : null,
    layoutKeys: KEYS.length,
    firmware: info?.firmware ?? null,
    info: info && { vid: info.vid, pid: info.pid, macroCapacity: info.macroCapacity },
    regions: regions
      ? Object.fromEntries(
          Object.entries(regions)
            .filter(([name]) => name !== 'macros')
            .map(([name, bytes]) => [name, toBase64(bytes)]),
        )
      : null,
    macroBytesUsed: regions ? regions.macros.reduce((n, b) => n + (b ? 1 : 0), 0) : null,
  }

  const name = device?.name ?? (identity.productName || 'Unknown keyboard')
  const blob = (await gzipBase64(JSON.stringify(json))).match(/.{1,76}/g)!.join('\n')
  const rows = [
    ['Model', device ? `${device.name} (${device.status})` : 'unknown'],
    ['USB id', `\`${usb}\``],
    ['USB name', identity.productName || '(empty)'],
    ['Firmware', info ? `v${info.firmware}` : device?.caps.readBack === false ? "can't be read on this board" : 'unknown'],
    ['Detection', detection],
    ['FCC', `${__APP_VERSION__}, ${platform()}${demo ? ', demo mode' : ''}`],
  ]

  const markdown = [
    `### ${name}`,
    '',
    '| | |',
    '|---|---|',
    ...rows.map(([k, v]) => `| ${k} | ${v} |`),
    '',
    '### What works?',
    '',
    'Tick what you tried and it worked (put an `x` in the box). Leave the rest empty and describe problems below.',
    '',
    ...checklist(device),
    '',
    '### Notes',
    '',
    '_Wrong key positions, settings that did not apply, error messages, anything odd._',
    '',
    '<details><summary>Raw data for FCC (please keep)</summary>',
    '',
    '```fcc-report',
    blob,
    '```',
    '',
    '</details>',
    '',
  ].join('\n')

  return { title: `Board report: ${name} (${usb})`, markdown, json }
}

/** New-issue link with the report filled in when it fits in a URL. */
export function issueUrl(report: Report) {
  const base = `${REPO_URL}issues/new?template=board-report.yml&title=${encodeURIComponent(report.title)}`
  const full = `${base}&report=${encodeURIComponent(report.markdown)}`
  return { url: full.length <= MAX_URL ? full : base, prefilled: full.length <= MAX_URL }
}

export async function openExternal(url: string) {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_project_page', { url })
  } else {
    window.open(url, '_blank', 'noopener')
  }
}

