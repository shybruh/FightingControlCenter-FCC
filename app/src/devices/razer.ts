// Razer keyboards FCC knows (razer-catalog.json, built by tools/catalog/build-razer.js). Each key has an on-screen
// position (key units), its HID usage and its place in the keyboard's LED matrix (row, column), which is where per-key
// colours are sent. Protocol details differ a little per model (interface, transaction ids, which settings exist).

import type { KeyDef } from '../data/layout'
import catalog from './razer-catalog.json'

export interface RazerInfo {
  /** LED matrix size; per-key colours are sent one row at a time */
  rows: number
  cols: number
  /** FCC key id -> [matrix row, matrix column] */
  matrix: Record<number, [number, number]>
  /** USB interface the board takes commands on */
  iface: number
  /** transaction ids Razer's software uses for each kind of command */
  tid: { effect: number; frame: number; brightness: number; game: number }
  /** game mode is stored (1) or not (0) */
  gameStore: number
  /** the board doesn't answer per-key frames */
  frameNoAnswer: boolean
  /** polling rates the board offers (Hz); empty when FCC can't set it */
  pollingRates: number[]
  /** typing / gaming keyswitch optimisation */
  keyswitch: boolean
  /** how fast the firmware runs its fixed-speed effects, as FCC's preview speed (1 slow … 5 fast) */
  previewSpeed: number
}

export interface RazerModel {
  id: string
  name: string
  productId: number
  keys: KeyDef[]
  razer: RazerInfo
}

export const RAZER_VENDOR_ID = 0x1532

type CatalogKey = [label: string, hid: number, row: number, col: number, x: number, y: number, w: number, h: number]

export const RAZER_MODELS: RazerModel[] = catalog.map((m) => {
  const keys: KeyDef[] = []
  const matrix: Record<number, [number, number]> = {}
  for (const [label, hid, row, col, x, y, w, h] of m.keys as CatalogKey[]) {
    const id = keys.length
    keys.push({ id, label, hid, x, y, w, ...(h > 1 ? { h } : {}) })
    matrix[id] = [row, col]
  }
  return {
    id: m.id,
    name: m.name,
    productId: m.productId,
    keys,
    razer: {
      rows: m.rows,
      cols: m.cols,
      matrix,
      iface: m.iface,
      tid: m.tid,
      gameStore: m.gameStore,
      frameNoAnswer: m.frameNoAnswer,
      pollingRates: m.pollingRates,
      keyswitch: m.keyswitch,
      previewSpeed: m.previewSpeed,
    },
  }
})
