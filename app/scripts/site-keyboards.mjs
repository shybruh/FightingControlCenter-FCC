// Writes the website's keyboard list (website/.../data/keyboards.json) from the app's own device registry, so the site
// shows exactly what FCC supports. Wireless dongles (unsupported) are left out; boards in progress are added by hand.
// Usage: node scripts/site-keyboards.mjs [out.json]
import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

const app = path.resolve(import.meta.dirname, '..')
const out = process.argv[2] ?? path.join(app, '..', 'website', 'Fighting Control Center website', 'data', 'keyboards.json')

// boards being worked on, with how far along they are (src/devices/in-progress.json)
const work = JSON.parse(fs.readFileSync(path.join(app, 'src/devices/in-progress.json'), 'utf8'))
const percent = (n) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)))
/** Boards the app can't drive yet. */
const IN_PROGRESS = work.boards.map((b) => ({ ...b, status: 'in-progress', progress: percent(b.progress) }))
/** Boards the app lists that are still being worked on, by USB id: in progress (can't drive them yet, e.g. newer
 *  firmware with a protocol FCC doesn't speak) unless the entry keeps another status (partly supported already). */
const IN_PROGRESS_IDS = new Map(work.existing.map((e) => [
  e.usb.toLowerCase(),
  { ...(e.keepStatus ? {} : { status: 'in-progress' }), progress: percent(e.progress), stage: e.stage },
]))

// the registry is TypeScript that imports JSON catalogues: let Vite load it
const vite = await createServer({ root: app, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
const { DEVICES } = await vite.ssrLoadModule('/src/devices/registry.ts')
await vite.close()

const FAMILY = { sonix: 'Sonix', ry: 'RongYuan', mc: 'MCHOSE', rk: 'Royal Kludge', razer: 'Razer' }
const BRANDS = ['Razer', 'MCHOSE', 'MonsGeek', 'Akko', 'AJAZZ', 'AULA', 'Royal Kludge', 'RK', 'Fekker', 'VTER', 'Madlions', 'IROK', 'ATK', 'Womier', 'Ajazz', 'Leobog', 'Attack Shark', 'Redragon', 'Glorious', 'Darmoshark', 'Yunzii']
const hex = (n) => n.toString(16).padStart(4, '0')

/** RongYuan catalogue "company" -> brand as shown on the site (unlisted ones are shown as they are). */
const RY_BRANDS = {
  akko: 'Akko', 蚂蚁电竞: 'ANT Esports', AJAZZMOUSE: 'AJAZZ', XinMengK65Keyboard: 'XinMeng', rongyuan: '', 腹灵: 'FL·ESPORTS',
  EWEADNV: 'EWEADN', PIIFOXDRIVER: 'Piifox', EPOMAKER: 'Epomaker', 咪星人H60: 'SPYSELF', BOYIH60: 'Boyi', cherry: 'Cherry',
  gamakay2: 'Gamakay', sunsonny: 'Sunsonny', ZENITHPROSoftware: 'Zenith', GKX68MAGNUM: '', GT60: '', LOMZHUBWEB: '',
}

/** "MCHOSE ACE 60" -> { brand: "MCHOSE", name: "ACE 60" } when the name starts with a known brand. */
function split(name) {
  if (/^fighting\d/i.test(name)) return { brand: 'VTER / Fekker', name }
  // AJAZZ's AK-series boards often leave the brand out of the name
  if (/^AK\d{3}/.test(name)) return { brand: 'AJAZZ', name }
  const brand = BRANDS.find((b) => name.toLowerCase().startsWith(`${b.toLowerCase()} `))
  return brand ? { brand: brand === 'RK' ? 'Royal Kludge' : brand, name: name.slice(brand.length + 1).trim() } : { brand: '', name }
}

const RY_COMPANY = new Map(JSON.parse(fs.readFileSync(path.join(app, 'src/devices/ry-catalog.json'), 'utf8')).devices.map((d) => [d.id, d.company]))

const rows = new Map()
for (const d of DEVICES) {
  // some receivers aren't marked as dongles in the catalogue, but say so in their name
  if (d.transport === 'dongle' || d.status === 'unsupported' || /dongle|receiver/i.test(d.name)) continue
  const status = d.status === 'verified' ? 'verified' : d.protocol === 'rk' || d.protocol === 'razer' ? 'experimental' : 'untested'
  const own = split(d.name)
  const company = d.ry ? RY_COMPANY.get(d.ry.deviceId) : undefined
  const { brand, name } =
    !own.brand && company !== undefined
        ? { brand: company in RY_BRANDS ? RY_BRANDS[company] : company, name: d.name }
        : own
  const key = `${brand}|${name}|${d.protocol}`.toLowerCase()
  const row = rows.get(key) ?? { name, brand, family: FAMILY[d.protocol], status, usb: [] }
  const usb = `${hex(d.vendorId)}:${hex(d.productId)}`
  if (!row.usb.includes(usb)) row.usb.push(usb)
  // a verified id wins over untested ones under the same name
  if (status === 'verified') row.status = 'verified'
  if (IN_PROGRESS_IDS.has(usb)) Object.assign(row, IN_PROGRESS_IDS.get(usb))
  rows.set(key, row)
}

const order = { verified: 0, experimental: 1, 'in-progress': 2, untested: 3 }
const list = [...rows.values(), ...IN_PROGRESS].sort(
  (a, b) => order[a.status] - order[b.status] || `${a.brand} ${a.name}`.localeCompare(`${b.brand} ${b.name}`, 'en', { numeric: true }),
)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(list) + '\n')
const counts = list.reduce((c, d) => ({ ...c, [d.status]: (c[d.status] ?? 0) + 1 }), {})
const families = list.reduce((c, d) => ({ ...c, [d.family]: (c[d.family] ?? 0) + 1 }), {})
console.log(`${list.length} keyboards -> ${out}`, counts, families)
