// SteelSeries keyboards FCC knows. Per-key colours are addressed by each key's HID usage (Fn: 0xF0), so a model is
// its USB id, the interface it takes lighting on and a standard layout; facts from OpenRGB's SteelSeries Apex driver.

import type { KeyDef } from '../data/layout'
import { RAZER_MODELS } from './razer'

export const STEELSERIES_VENDOR_ID = 0x1038

export interface SteelSeriesInfo {
  /** USB interface the board takes lighting reports on */
  iface: number
}

export interface SteelSeriesModel {
  id: string
  name: string
  productId: number
  keys: KeyDef[]
  steelseries: SteelSeriesInfo
}

/**
 * Full-size ANSI board as OpenRGB lays out the Apex: the same keys and positions as any full-size board (taken from
 * the plain Razer Huntsman layout), with the right of the bottom row being Alt, Win, Fn, Ctrl.
 */
function fullSize(): KeyDef[] {
  const base = RAZER_MODELS.find((m) => m.id === 'razer-huntsman')?.keys ?? []
  return base.map((k) => {
    // Razer's right side reads Alt, Fn, Menu, Ctrl; the Apex's reads Alt, Win, Fn, Ctrl
    if (k.label === 'Fn') return { ...k, label: 'Win', hid: 0xe7 }
    if (k.label === 'Menu') return { ...k, label: 'Fn', hid: 0 }
    return { ...k }
  })
}

export const STEELSERIES_MODELS: SteelSeriesModel[] = [
  { id: 'steelseries-apex-pro-gen3', name: 'SteelSeries Apex Pro Gen 3', productId: 0x1640, keys: fullSize(), steelseries: { iface: 1 } },
]
