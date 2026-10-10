// Minimal HID report descriptor reader: which reports (id, kind, size) each top-level collection declares.

export interface ReportSummary {
  usagePage: number
  usage: number
  /** report id -> size in bytes (without the id byte) */
  input: Record<number, number>
  output: Record<number, number>
  feature: Record<number, number>
}

export function parseDescriptor(bytes: ArrayLike<number>): ReportSummary[] {
  const out: ReportSummary[] = []
  let usagePage = 0
  let reportSize = 0
  let reportCount = 0
  let reportId = 0
  let usages: number[] = []
  let depth = 0
  let current: ReportSummary | null = null
  const bits: Record<'input' | 'output' | 'feature', Record<number, number>> = { input: {}, output: {}, feature: {} }

  const flush = () => {
    if (!current) return
    for (const kind of ['input', 'output', 'feature'] as const) {
      for (const [id, b] of Object.entries(bits[kind])) current[kind][Number(id)] = Math.ceil(b / 8)
      bits[kind] = {}
    }
    out.push(current)
    current = null
  }

  let i = 0
  while (i < bytes.length) {
    const prefix = bytes[i]
    if (prefix === 0xfe) {
      // long item: skip
      i += 3 + (bytes[i + 1] ?? 0)
      continue
    }
    const size = [0, 1, 2, 4][prefix & 3]
    let value = 0
    for (let k = 0; k < size; k++) value |= (bytes[i + 1 + k] ?? 0) << (8 * k)
    value >>>= 0
    const type = (prefix >> 2) & 3
    const tag = prefix >> 4
    i += 1 + size

    if (type === 1) {
      // global
      if (tag === 0) usagePage = value
      else if (tag === 7) reportSize = value
      else if (tag === 9) reportCount = value
      else if (tag === 8) reportId = value
    } else if (type === 2) {
      // local
      if (tag === 0) usages.push(size === 4 ? value & 0xffff : value)
    } else if (type === 0) {
      // main
      if (tag === 10) {
        // collection
        if (depth === 0) {
          flush()
          current = { usagePage, usage: usages[0] ?? 0, input: {}, output: {}, feature: {} }
          reportId = 0
        }
        depth++
      } else if (tag === 12) {
        depth = Math.max(0, depth - 1)
        if (depth === 0) flush()
      } else if (tag === 8 || tag === 9 || tag === 11) {
        const kind = tag === 8 ? 'input' : tag === 9 ? 'output' : 'feature'
        bits[kind][reportId] = (bits[kind][reportId] ?? 0) + reportSize * reportCount
      }
      usages = []
    }
  }
  flush()
  return out
}

const PAGES: Record<number, string> = { 0x01: 'Generic Desktop', 0x07: 'Keyboard', 0x08: 'LED', 0x09: 'Button', 0x0c: 'Consumer' }
const DESKTOP: Record<number, string> = { 0x00: 'undefined', 0x01: 'Pointer', 0x02: 'Mouse', 0x04: 'Joystick', 0x05: 'Gamepad', 0x06: 'Keyboard', 0x80: 'System Control' }

/** "Generic Desktop / Keyboard", "Vendor 0xFF68 / 0x61" … */
export function usageName(page: number, usage: number) {
  const h = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`
  if (page >= 0xff00) return `Vendor ${h(page)} / ${h(usage)}`
  const p = PAGES[page] ?? `Page ${h(page)}`
  const u = page === 0x01 ? (DESKTOP[usage] ?? h(usage)) : page === 0x0c && usage === 1 ? 'Consumer Control' : h(usage)
  return `${p} / ${u}`
}
