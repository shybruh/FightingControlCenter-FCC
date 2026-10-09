// Builds app/src/devices/catalog.json from the official driver data (devices-raw.json) and the
// measured key geometry (measured.json).
const fs = require('fs')
const out = process.argv[2]
const { devices, filters } = require('./devices-raw.json')
const measured = require('./measured.json')

const SHIFTED = new Set('!@#$%^&*()_+{}|:"<>?~ˉ'.split(''))
function label(name) {
  if (!name) return ['', '']
  if (/^space/i.test(name)) return ['Space', '']
  const parts = name.trim().split(/\s+/)
  if (parts.length === 2 && parts.every((p) => p.length <= 2)) {
    const [a, b] = parts
    if (SHIFTED.has(a) && !SHIFTED.has(b)) return [b, a === 'ˉ' ? '_' : a]
    return [a, b === 'ˉ' ? '_' : b]
  }
  return [name.trim(), '']
}

const layouts = {}
for (const [name, keys] of Object.entries(measured)) {
  layouts[name] = keys.map((k) => {
    const [main, sub] = label(k.name)
    return [k.id, main, sub, k.code || '', k.hid ?? 0, k.x, k.y, k.w, k.h]
  })
}

const iface = (pid) => {
  const f = filters.filter((x) => x.productId === pid)
  if (f.some((x) => x.usagePage === 0xff68)) return { vendorId: f.find((x) => x.usagePage === 0xff68).vendorId, transport: 'wired' }
  if (f.some((x) => x.usagePage === 0xff60 || x.usagePage === 0xff80)) return { vendorId: f[0].vendorId, transport: 'dongle' }
  return { vendorId: f[0]?.vendorId ?? 0x0c45, transport: 'unknown' }
}

const seen = new Map()
for (const d of devices) {
  const key = `${d.productId}|${d.name.trim().toLowerCase()}|${d.layout}`
  if (seen.has(key)) continue
  const { vendorId, transport } = iface(d.productId)
  const slug = `${d.name}-${d.productId.toString(16)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  seen.set(key, {
    id: slug,
    name: d.name.trim(),
    vendorId,
    productId: d.productId,
    layout: d.layout,
    fnLayout: d.fnLayout || null,
    transport,
    status: transport === 'wired' ? 'untested' : 'unsupported',
    // all distances in 0.01 mm
    limits: {
      travel: d.trip * 10,
      actuationDefault: d.currentTrip * 10,
      sensMin: d.minSensitivity,
      sensMax: d.maxSensitivity,
      sensDefault: d.sensitivity,
    },
  })
}
const list = [...seen.values()]
// the board FCC was built and verified on
const f68 = list.find((d) => d.productId === 0x8030 && d.name === 'Fighting68')
f68.id = 'fighting68'
f68.status = 'verified'
f68.layout = 'fighting68-fcc' // hand-tuned layout shipped in the app
// make ids unique
const ids = new Set()
for (const d of list) { let id = d.id, n = 2; while (ids.has(id)) id = `${d.id}-${n++}`; d.id = id; ids.add(id) }
list.sort((a, b) => (a.status === 'verified' ? -1 : b.status === 'verified' ? 1 : a.name.localeCompare(b.name) || a.productId - b.productId))

const used = new Set(list.map((d) => d.layout))
const usedLayouts = Object.fromEntries(Object.entries(layouts).filter(([n]) => used.has(n)))
fs.writeFileSync(out, JSON.stringify({ source: 'vter.driveall.cn official driver, extracted 2026-10-09', devices: list, layouts: usedLayouts }))
const by = (s) => list.filter((d) => d.status === s).length
console.log('devices', list.length, '| verified', by('verified'), '| untested', by('untested'), '| unsupported', by('unsupported'), '| layouts', Object.keys(usedLayouts).length, '| bytes', fs.statSync(out).size)
