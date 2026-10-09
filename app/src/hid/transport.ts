import { WIRED_IDS } from '../devices/registry'
import { CONFIG_USAGE, CONFIG_USAGE_PAGE, PACKET_LEN } from './protocol'

/**
 * A raw 64-byte report pipe to the keyboard's config interface.
 * WebHID today; a Tauri/hidapi implementation can slot in behind the same interface.
 */
export interface DeviceIdentity {
  vendorId: number
  productId: number
  productName: string
}

export interface Transport {
  readonly name: string
  readonly identity: DeviceIdentity
  send(packet: Uint8Array): Promise<void>
  onReport(listener: (data: Uint8Array) => void): () => void
  onDisconnect(listener: () => void): () => void
  close(): Promise<void>
}

type Listener<T> = (v: T) => void

class Emitter<T> {
  private listeners = new Set<Listener<T>>()
  on(l: Listener<T>) {
    this.listeners.add(l)
    return () => void this.listeners.delete(l)
  }
  emit(v: T) {
    this.listeners.forEach((l) => l(v))
  }
}

export function webHidSupported(): boolean {
  return typeof navigator !== 'undefined' && 'hid' in navigator
}

// every wired board in the catalogue, on its config interface
const FILTERS: HIDDeviceFilter[] = WIRED_IDS.map(({ vendorId, productId }) => ({
  vendorId,
  productId,
  usagePage: CONFIG_USAGE_PAGE,
  usage: CONFIG_USAGE,
}))

function isConfigInterface(d: HIDDevice): boolean {
  return (
    WIRED_IDS.some((w) => w.vendorId === d.vendorId && w.productId === d.productId) &&
    d.collections.some((c) => c.usagePage === CONFIG_USAGE_PAGE && c.usage === CONFIG_USAGE)
  )
}

export class WebHidTransport implements Transport {
  readonly name: string
  readonly identity: DeviceIdentity
  private reports = new Emitter<Uint8Array>()
  private disconnects = new Emitter<void>()
  private onInput = (e: HIDInputReportEvent) => {
    this.reports.emit(new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength).slice())
  }
  private onHidDisconnect = (e: HIDConnectionEvent) => {
    if (e.device === this.device) this.disconnects.emit()
  }

  private device: HIDDevice

  private constructor(device: HIDDevice) {
    this.device = device
    this.name = device.productName || 'Keyboard'
    this.identity = { vendorId: device.vendorId, productId: device.productId, productName: device.productName }
    device.addEventListener('inputreport', this.onInput)
    navigator.hid.addEventListener('disconnect', this.onHidDisconnect)
  }

  /** Shows the browser device picker. Must be called from a user gesture. */
  static async request(): Promise<WebHidTransport | null> {
    const devices = await navigator.hid.requestDevice({ filters: FILTERS })
    const dev = devices.find(isConfigInterface)
    return dev ? WebHidTransport.open(dev) : null
  }

  /** Reconnects to a previously authorised device without a picker. */
  static async reconnect(): Promise<WebHidTransport | null> {
    const devices = await navigator.hid.getDevices()
    const dev = devices.find(isConfigInterface)
    return dev ? WebHidTransport.open(dev) : null
  }

  private static async open(dev: HIDDevice) {
    if (!dev.opened) await dev.open()
    return new WebHidTransport(dev)
  }

  async send(packet: Uint8Array) {
    if (packet.length !== PACKET_LEN) throw new Error('bad packet length')
    await this.device.sendReport(0, packet as Uint8Array<ArrayBuffer>)
  }

  onReport(l: Listener<Uint8Array>) {
    return this.reports.on(l)
  }

  onDisconnect(l: Listener<void>) {
    return this.disconnects.on(l)
  }

  async close() {
    this.device.removeEventListener('inputreport', this.onInput)
    navigator.hid.removeEventListener('disconnect', this.onHidDisconnect)
    if (this.device.opened) await this.device.close()
  }
}

export { Emitter }
