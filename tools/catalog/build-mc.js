#!/usr/bin/env node
// Builds app/src/devices/mc-catalog.json: MCHOSE magnetic keyboards (ACE 60 / 68 / 75, GOD60, JET75, ZERO75, MIX87 …)
// from MCHOSE's web driver (www.mchose.com.cn).
//
//   node tools/catalog/build-mc.js --fetch <work dir>   download the driver's shared data, then build
//   node tools/catalog/build-mc.js <work dir>           build from a previous download
//   (optional) --out <file>                             default app/src/devices/mc-catalog.json
//
// Read as data only (nothing from the driver is executed):
//   main.js            device list: USB ids, name, travel steps, precision, which layout / key table to load
//   layout-*.js        per-board on-screen layout (key positions and sizes) and its lighting effect list
//   default-keys-*.js  per-board factory key table: matrix index -> key
// Only boards on MCHOSE's first protocol generation ("glw") are included; the newer "qhw" boards speak another one.

const fs = require('fs')
const path = require('path')
const https = require('https')
const { parseAt, matchBrace } = require('./jsliteral')

const BASE = 'https://www.mchose.com.cn/cizhou/CZ_SHARED_DATA/'

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`${url}: HTTP ${res.statusCode}`))
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })
      .on('error', reject)
  })
}

async function fetchData(dir) {
  fs.mkdirSync(dir, { recursive: true })
  const manifest = JSON.parse(await get(BASE + 'asset-manifest.json?v=1'))
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1))
  const wanted = Object.keys(manifest).filter((k) => k === 'main.js' || /^(layout|default-keys)-.*\.js$/.test(k))
  for (const k of wanted) fs.writeFileSync(path.join(dir, k), await get(BASE + manifest[k]))
  console.log(`downloaded ${wanted.length} files`)
}

const tryParse = (src, at) => {
  try {
    return parseAt(src, at).value
  } catch {
    return undefined
  }
}

/** Body of webpack module `id` in a chunk, or null. */
function moduleIn(src, id) {
  const m = new RegExp(`[,{]${id}:\\([\\w$]+,[\\w$]+,[\\w$]+\\)=>\\{`).exec(src)
  if (!m) return null
  const open = m.index + m[0].length - 1
  return src.slice(open, matchBrace(src, open) + 1)
}

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.resolve(__dirname, '../../app/src/devices/mc-catalog.json')
  const fetchIdx = args.indexOf('--fetch')
  if (fetchIdx >= 0) args.splice(fetchIdx, 1)
  const dir = args[0]
  if (!dir) throw new Error('usage: build-mc.js [--fetch] <work dir> [--out file]')
  if (fetchIdx >= 0) await fetchData(dir)

  const main = fs.readFileSync(path.join(dir, 'main.js'), 'utf8')
  const chunkFiles = fs.readdirSync(dir).filter((f) => /^(layout|default-keys)-.*\.js$/.test(f))
  const chunks = chunkFiles.map((f) => fs.readFileSync(path.join(dir, f), 'utf8'))
  const findModule = (id, depth = 0) => {
    for (const c of chunks) {
      const body = moduleIn(c, id)
      if (!body) continue
      // some boards re-export another board's module: default:()=>s.default});var s=t(52940)
      const re = /default:\(\)=>([\w$]+)\.default\}\);var ([\w$]+)=[\w$]+\((\d+)\)/.exec(body)
      if (re && re[1] === re[2] && depth < 5) return findModule(re[3], depth + 1)
      return body
    }
    return null
  }

  const devices = []
  const skipped = []
  const seen = new Set()
  for (const m of main.matchAll(/\{(?:manufacturer:"(\w+)",)?(?:matrixConfig:[^,]+,)?_identity:\{vendorId:/g)) {
    if (m[1] === 'qhw') continue
    const end = matchBrace(main, m.index)
    const text = main.slice(m.index, end + 1)
    const e = tryParse(main, m.index)
    if (!e || typeof e.id !== 'string') continue
    const layoutId = /loadLayout:[^}]*?\.bind\([\w$]+,(\d+)\)/.exec(text)?.[1]
    const keysId = /loadDefaultKeys:[^}]*?\.bind\([\w$]+,(\d+)\)/.exec(text)?.[1]
    if (!layoutId || !keysId) continue
    const identities = [e._identity, ...(Array.isArray(e.spread) ? e.spread.map((s) => s._identity) : [])]
      .filter((i) => i && typeof i.vendorId === 'number')
      .map((i) => [i.vendorId, i.productId])
    const key = identities.map(([v, p]) => `${v}:${p}`).join(',')
    if (seen.has(key)) continue
    seen.add(key)

    // layout: {name, lighting:{effect:[…]}, layouts:{keys:[{x,y,w,h,code,name}]}}
    const lbody = findModule(layoutId)
    const lstart = lbody?.indexOf('({name:')
    const layout = lbody && lstart >= 0 ? tryParse(lbody, lstart + 1) : undefined
    // default keys: wrap([{type,code1,code2,code,name,index,layer}])
    const kbody = findModule(keysId)
    const kstart = kbody?.indexOf('.wrap)([')
    const defaults = kbody && kstart >= 0 ? tryParse(kbody, kstart + 7) : undefined
    if (!Array.isArray(layout?.layouts?.keys) || !Array.isArray(defaults)) {
      skipped.push(`${e.id}: layout or key table missing`)
      continue
    }

    // the drawn layout uses 1.095 units per key pitch; FCC uses 1 unit per key
    const pitch = 46 / 42
    const lk = layout.layouts.keys.filter((k) => typeof k.x === 'number')
    const x0 = Math.min(...lk.map((k) => k.x))
    const y0 = Math.min(...lk.map((k) => k.y))
    const q = (v) => Math.round(v * 4) / 4
    const layer0 = defaults.filter((d) => (d.layer ?? 0) === 0)
    // the key a factory entry produces: HID usage, modifiers as their own usage, 0 for Fn and the like
    const entryHid = (d) => (d.type !== 16 ? 0 : d.code1 === 0 ? d.code2 : d.code2 === 0 && (d.code1 & (d.code1 - 1)) === 0 ? 224 + Math.log2(d.code1) : 0)
    const used = new Set()
    const keys = []
    for (const k of lk) {
      // match the drawn key to its matrix index: by HID usage, else by name (Fn and the like)
      const hit =
        layer0.find((d) => !used.has(d.index) && entryHid(d) === k.code && k.code > 0) ??
        // Fn: drawn as code 255, stored as [240, 255, n]
        layer0.find((d) => !used.has(d.index) && k.code === 255 && d.type === 240 && d.code1 === 255) ??
        layer0.find((d) => !used.has(d.index) && typeof d.name === 'string' && d.name.toLowerCase() === String(k.name).toLowerCase())
      if (!hit) continue
      used.add(hit.index)
      const hid = entryHid(hit)
      keys.push([hit.index, hid, q((k.x - x0) / pitch), q((k.y - y0) / pitch), q((k.w + pitch - 1) / pitch), q((k.h + pitch - 1) / pitch), hid ? '' : String(k.name)])
    }

    const effects = (layout.lighting?.effect ?? []).map((s) => Number(/^light-(\d+)$/.exec(s)?.[1])).filter((n) => Number.isFinite(n))
    const precisions = Object.entries(e.precisionConfig ?? {})
      .filter(([, v]) => v === true || (v && typeof v === 'object'))
      .map(([k]) => Number(k))
    const maxTravel = Number(/maxTravel:([\d.]+)/.exec(text)?.[1]) || 3.4
    devices.push({
      id: `mc-${e.id}-${identities[0][1].toString(16)}`,
      name: e.fullName || e.name || e.id,
      identities,
      type: e.type,
      step: typeof e.switchStepValue === 'number' ? e.switchStepValue : 100,
      minTravel: typeof e.minTravel === 'number' ? e.minTravel : 4,
      precision: precisions.length ? Math.max(...precisions) : 0.01,
      maxTravel,
      maxKeyCount: typeof e.maxKeyCount === 'number' ? e.maxKeyCount : 128,
      wireless: e.isWireless === true,
      effects,
      keys,
      defaults: layer0.map((d) => [d.index, d.type, d.code1, d.code2]),
    })
    if (keys.length < lk.length * 0.9) skipped.push(`${e.id}: only ${keys.length}/${lk.length} keys matched`)
  }

  devices.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  fs.writeFileSync(out, JSON.stringify({ source: 'www.mchose.com.cn (MCHOSE web driver)', builtAt: new Date().toISOString().slice(0, 10), devices }))
  console.log(`${devices.length} devices -> ${out} (${fs.statSync(out).size} bytes)`)
  if (skipped.length) console.log('notes:', skipped.join('; '))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
