// Advanced keys (RS, SOCD, DKS, mod-tap, toggle) span the key map and the DKS region,
// and pair types live on two keys at once. These helpers keep both regions consistent.

import { KEY_IDS } from '../data/layout'
import { decodeBinding, decodeDks, withBinding, withDks, type Binding, type DksSlot } from './codec'

export type AdvancedType = 'rs' | 'socd' | 'dks' | 'modtap' | 'toggle'
export const ADVANCED_TYPES: AdvancedType[] = ['rs', 'socd', 'dks', 'modtap', 'toggle']
export const MAX_ADVANCED = 40

export const SOCD_MODES = [
  { value: 3, label: 'Last input wins', hint: 'The most recently pressed key overrides the other.' },
  { value: 1, label: 'Key 1 priority', hint: 'Key 1 always wins while both are held.' },
  { value: 2, label: 'Key 2 priority', hint: 'Key 2 always wins while both are held.' },
  { value: 4, label: 'Neutral', hint: 'Both keys held = neither is sent.' },
]

export interface AdvancedEntry {
  type: AdvancedType
  /** physical key ids carrying this binding (2 for rs/socd) */
  ids: number[]
  binding: Binding
  dks?: DksSlot
}

export function isAdvanced(b: Binding): b is Extract<Binding, { type: AdvancedType }> {
  return (ADVANCED_TYPES as string[]).includes(b.type)
}

const sameBytes = (keys: Uint8Array, a: number, b: number) =>
  keys[a * 4] === keys[b * 4] &&
  keys[a * 4 + 1] === keys[b * 4 + 1] &&
  keys[a * 4 + 2] === keys[b * 4 + 2] &&
  keys[a * 4 + 3] === keys[b * 4 + 3]

/** Groups the key map into advanced entries (pairs merged into one entry). */
export function listAdvanced(keys: Uint8Array, dks: Uint8Array): AdvancedEntry[] {
  const out: AdvancedEntry[] = []
  const seen = new Set<number>()
  for (const id of KEY_IDS) {
    if (seen.has(id)) continue
    const b = decodeBinding(keys, id)
    if (!isAdvanced(b)) continue
    const ids = [id]
    if (b.type === 'rs' || b.type === 'socd') {
      const partner = KEY_IDS.find((o) => o !== id && !seen.has(o) && sameBytes(keys, id, o))
      if (partner !== undefined) ids.push(partner)
    }
    ids.forEach((i) => seen.add(i))
    out.push({ type: b.type, ids, binding: b, dks: b.type === 'dks' ? decodeDks(dks, b.slot) : undefined })
  }
  return out
}

export function entryFor(keys: Uint8Array, dks: Uint8Array, id: number) {
  return listAdvanced(keys, dks).find((e) => e.ids.includes(id)) ?? null
}

/** Resets the given keys to default, along with pair partners and DKS slots they own. */
export function clearAdvanced(keys: Uint8Array, dks: Uint8Array, ids: number[]) {
  let k = keys
  let d = dks
  for (const id of ids) {
    const entry = entryFor(k, d, id)
    if (entry) {
      if (entry.binding.type === 'dks') d = withDks(d, entry.binding.slot, null)
      k = withBinding(k, entry.ids, { type: 'default' })
    }
  }
  return { keys: withBinding(k, ids, { type: 'default' }), dks: d }
}

export const TYPE_INFO: Record<AdvancedType, { name: string; short: string; keys: 1 | 2; desc: string }> = {
  rs: {
    name: 'Rappy Snappy',
    short: 'RS',
    keys: 2,
    desc: 'Watches two keys and sends whichever one is pressed deeper. Perfect for A/D strafing.',
  },
  socd: {
    name: 'SOCD',
    short: 'SOCD',
    keys: 2,
    desc: 'Decides what happens when two opposing keys are held at once.',
  },
  dks: {
    name: 'Dynamic Keystroke',
    short: 'DKS',
    keys: 1,
    desc: 'Up to 4 actions on one key, fired at different points of the press and release.',
  },
  modtap: {
    name: 'Mod-Tap',
    short: 'MT',
    keys: 1,
    desc: 'Tap for one key, hold for another.',
  },
  toggle: {
    name: 'Toggle',
    short: 'TGL',
    keys: 1,
    desc: 'Tap to latch the key on (held) or off. Holding behaves like a normal key.',
  },
}
