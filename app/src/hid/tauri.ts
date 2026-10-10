import { Channel, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { PACKET_LEN } from './protocol'
import type { FeatureTransport } from './rk'
import type { RyTransport } from './ry'
import { MC_IDS, RK_PRODUCT_IDS, RY_VENDOR_IDS } from '../devices/registry'
import type { McExpect, McTransport } from './mc'
import { Emitter, type DeviceIdentity, type Transport } from './transport'

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

interface DeviceInfo {
  name: string
  vendor_id: number
  product_id: number
}

/** Desktop transport: native hidapi in the Rust backend (src-tauri/src/hid.rs). */
export class TauriTransport implements Transport {
  readonly name: string
  readonly identity: DeviceIdentity
  private reports = new Emitter<Uint8Array>()
  private disconnects = new Emitter<void>()
  private unlisten: UnlistenFn | null = null

  private constructor(info: DeviceInfo) {
    this.name = info.name || 'Keyboard'
    this.identity = { vendorId: info.vendor_id, productId: info.product_id, productName: info.name }
  }

  static available(): Promise<boolean> {
    return invoke<boolean>('hid_available')
  }

  static async open(): Promise<TauriTransport> {
    let transport: TauriTransport | null = null
    const channel = new Channel<ArrayBuffer>()
    // Each message carries one or more 64-byte reports.
    channel.onmessage = (buf) => {
      const bytes = new Uint8Array(buf)
      for (let o = 0; o + PACKET_LEN <= bytes.length; o += PACKET_LEN) transport?.reports.emit(bytes.slice(o, o + PACKET_LEN))
    }
    const info = await invoke<DeviceInfo>('hid_open', { onReport: channel })
    transport = new TauriTransport(info)
    transport.unlisten = await listen('hid-disconnected', () => transport?.disconnects.emit())
    return transport
  }

  send(packet: Uint8Array) {
    return invoke<void>('hid_write', { data: Array.from(packet) })
  }

  onReport(l: (d: Uint8Array) => void) {
    return this.reports.on(l)
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    this.unlisten?.()
    await invoke('hid_close')
  }
}

/** Desktop transport for MCHOSE boards: output report out, matching input report back (src-tauri/src/mc.rs). */
export class TauriMcTransport implements McTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private disconnects = new Emitter<void>()
  private unlisten: UnlistenFn | null = null

  private constructor(info: DeviceInfo) {
    this.name = info.name || 'MCHOSE keyboard'
    this.identity = { vendorId: info.vendor_id, productId: info.product_id, productName: info.name }
  }

  static available(): Promise<boolean> {
    return invoke<boolean>('mc_available', { ids: MC_IDS })
  }

  static async open(): Promise<TauriMcTransport> {
    const info = await invoke<DeviceInfo>('mc_open', { ids: MC_IDS })
    const t = new TauriMcTransport(info)
    t.unlisten = await listen('mc-disconnected', () => t.disconnects.emit())
    return t
  }

  async request(packet: Uint8Array, expect: McExpect) {
    return Uint8Array.from(await invoke<number[]>('mc_request', { data: Array.from(packet), ...expect }))
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    this.unlisten?.()
    await invoke('mc_close')
  }
}

/** Desktop transport for RongYuan RY5088 boards: feature report 0 through the Rust bridge (src-tauri/src/ry.rs). */
export class TauriRyTransport implements RyTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private disconnects = new Emitter<void>()
  private unlisten: UnlistenFn | null = null

  private constructor(info: DeviceInfo) {
    this.name = info.name || 'Keyboard'
    this.identity = { vendorId: info.vendor_id, productId: info.product_id, productName: info.name }
  }

  static available(): Promise<boolean> {
    return invoke<boolean>('ry_available', { vendors: RY_VENDOR_IDS })
  }

  static async open(): Promise<TauriRyTransport> {
    const info = await invoke<DeviceInfo>('ry_open', { vendors: RY_VENDOR_IDS })
    const t = new TauriRyTransport(info)
    t.unlisten = await listen('ry-disconnected', () => t.disconnects.emit())
    return t
  }

  sendReport(data: Uint8Array) {
    return invoke<void>('ry_send', { data: Array.from(data) })
  }

  async receiveReport() {
    return Uint8Array.from(await invoke<number[]>('ry_receive'))
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    this.unlisten?.()
    await invoke('ry_close')
  }
}

/** Desktop transport for Royal Kludge legacy boards: feature reports through the Rust bridge (src-tauri/src/rk.rs). */
export class TauriRkTransport implements FeatureTransport {
  readonly name: string
  readonly identity: DeviceIdentity
  private disconnects = new Emitter<void>()
  private unlisten: UnlistenFn | null = null

  private constructor(info: DeviceInfo) {
    this.name = info.name || 'Royal Kludge keyboard'
    this.identity = { vendorId: info.vendor_id, productId: info.product_id, productName: info.name }
  }

  static available(): Promise<boolean> {
    return invoke<boolean>('rk_available', { products: RK_PRODUCT_IDS })
  }

  static async open(): Promise<TauriRkTransport> {
    const info = await invoke<DeviceInfo>('rk_open', { products: RK_PRODUCT_IDS })
    const t = new TauriRkTransport(info)
    t.unlisten = await listen('rk-disconnected', () => t.disconnects.emit())
    return t
  }

  sendFeature(reportId: number, data: Uint8Array) {
    return invoke<void>('rk_send_feature', { data: [reportId, ...data] })
  }

  onDisconnect(l: () => void) {
    return this.disconnects.on(l)
  }

  async close() {
    this.unlisten?.()
    await invoke('rk_close')
  }
}
