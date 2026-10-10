#!/usr/bin/env node
// Builds app/src/devices/ry-catalog.json: the RongYuan RY5088 keyboards (MonsGeek FUN60, FUN68, M1 V5 HE, Akko …)
// from MonsGeek's official web driver (app.monsgeek.com).
//
//   node tools/catalog/build-ry.js --fetch <work dir>      download the web app's bundle into <work dir>, then build
//   node tools/catalog/build-ry.js <work dir>              build from a previously downloaded <work dir>
//   (optional) --out <file>                                default app/src/devices/ry-catalog.json
//
// What it reads (data only, nothing from the bundle is executed):
//   index.*.js             device list (id, USB ids, layout name, light layout, travel limits)
//                          + each layout's keys in physical order (KeyboardEvent.code names)
//   RY5088 device chunk    per-model classes: the factory key matrix (4 bytes per matrix position)
//                          and lighting constants (mode list, top speed, rainbow / solid-colour codes)
// The on-screen geometry isn't in the app (it draws pictures), so standard key widths are applied to
// each layout's key order; boards whose order can't be read that way fall back to a matrix grid.

const fs = require('fs')
const path = require('path')
const https = require('https')

const ORIGIN = 'https://app.monsgeek.com/'

const { parseAt, matchBrace, declaration, esc } = require('./jsliteral')

// ---------- fetching ----------

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

async function fetchBundle(dir) {
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true })
  const html = await get(ORIGIN)
  const entry = /src="\.\/(js\/index\.[\w]+\.js)"/.exec(html)?.[1]
  if (!entry) throw new Error('entry script not found in app.monsgeek.com')
  const index = await get(ORIGIN + entry)
  fs.writeFileSync(path.join(dir, 'index.js'), index)
  // findRy5088Device: ()=>y(()=>import("./x.js"),["./x.js","./dep.js",…],…)
  const m = /findRy5088Device:\(\)=>\w+\(\(\)=>import\("\.\/([\w]+\.js)"\),\[([^\]]*)\]/.exec(index)
  if (!m) throw new Error('RY5088 device loader not found')
  const files = [m[1], ...m[2].split(',').map((s) => s.trim().replace(/^"\.\/|"$/g, ''))]
  for (const f of new Set(files)) fs.writeFileSync(path.join(dir, 'js', f), await get(ORIGIN + 'js/' + f))
  fs.writeFileSync(path.join(dir, 'loader.json'), JSON.stringify({ entry: m[1], files: [...new Set(files)] }))
  console.log(`downloaded ${entry} + ${new Set(files).size} chunks`)
}

// ---------- KeyboardEvent.code -> HID usage ----------

const CODE_HID = {
  Escape: 0x29, Backquote: 0x35, Minus: 0x2d, Equal: 0x2e, Backspace: 0x2a, Tab: 0x2b, BracketLeft: 0x2f, BracketRight: 0x30,
  Backslash: 0x31, CapsLock: 0x39, Semicolon: 0x33, Quote: 0x34, Enter: 0x28, ShiftLeft: 0xe1, Comma: 0x36, Period: 0x37,
  Slash: 0x38, ShiftRight: 0xe5, ControlLeft: 0xe0, MetaLeft: 0xe3, AltLeft: 0xe2, Space: 0x2c, AltRight: 0xe6, MetaRight: 0xe7,
  ControlRight: 0xe4, ContextMenu: 0x65, IntlBackslash: 0x64, IntlRo: 0x87, IntlYen: 0x89, NonUsHash: 0x32,
  Insert: 0x49, Delete: 0x4c, Home: 0x4a, End: 0x4d, PageUp: 0x4b, PageDown: 0x4e, PrintScreen: 0x46, ScrollLock: 0x47, Pause: 0x48,
  ArrowRight: 0x4f, ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53, NumpadDivide: 0x54, NumpadMultiply: 0x55,
  NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58, NumpadDecimal: 0x63, Lang1: 0x90, Lang2: 0x91, Convert: 0x8a, NonConvert: 0x8b,
  KanaMode: 0x88,
}
for (let n = 0; n < 26; n++) CODE_HID['Key' + String.fromCharCode(65 + n)] = 0x04 + n
for (let n = 1; n <= 9; n++) CODE_HID['Digit' + n] = 0x1d + n
CODE_HID.Digit0 = 0x27
for (let n = 1; n <= 12; n++) CODE_HID['F' + n] = 0x39 + n
for (let n = 1; n <= 9; n++) CODE_HID['Numpad' + n] = 0x58 + n
CODE_HID.Numpad0 = 0x62

// ---------- geometry ----------

const WIDTH = {
  Backspace: 2, Tab: 1.5, Backslash: 1.5, CapsLock: 1.75, Enter: 2.25, ShiftLeft: 2.25, ShiftRight: 2.75,
  ControlLeft: 1.25, MetaLeft: 1.25, AltLeft: 1.25, Space: 6.25, AltRight: 1.25, MetaRight: 1.25, ContextMenu: 1.25,
  ControlRight: 1.25, Fn: 1.25, NumpadAdd: 1, NumpadEnter: 1, Numpad0: 2,
}
const ROW_START = new Set(['Backquote', 'Tab', 'CapsLock', 'ShiftLeft', 'ControlLeft'])
const FLEX_RIGHT = new Set(['AltRight', 'MetaRight', 'ContextMenu', 'ControlRight', 'Fn'])

const MOD_WORD = { alt: 'AltRight', fn: 'Fn', menu: 'ContextMenu', ctrl: 'ControlRight', win: 'MetaRight' }

/**
 * Standard-width placement of keys given in physical reading order; null if the order isn't readable.
 * `label` is the layout's description, e.g. "常规61键(gk06 alt fn menu ctrl)": the app lists the
 * right-hand modifiers in a fixed order, the description has the physical one.
 */
function geometry(codes, label = '') {
  if (!codes.length || !['Escape', 'Backquote'].includes(codes[0])) return null
  const rows = [[]]
  codes.forEach((c, i) => {
    if (i > 0 && ROW_START.has(c) && !(c === 'Backquote' && rows.length === 1 && rows[0].length === 0)) rows.push([])
    rows[rows.length - 1].push(c)
  })
  if (rows.length < 4 || rows.length > 6) return null
  const order = (/\(([^)]*)\)/.exec(label)?.[1] ?? '').split(/\s+/).map((w) => MOD_WORD[w.toLowerCase()]).filter(Boolean)
  const bottom = rows[rows.length - 1]
  const space = bottom.indexOf('Space')
  if (order.length >= 2 && space >= 0) {
    const right = bottom.slice(space + 1)
    const mods = right.filter((c) => order.includes(c))
    if (mods.length === order.filter((c) => right.includes(c)).length) {
      const sorted = order.filter((c) => mods.includes(c))
      let k = 0
      bottom.splice(space + 1, right.length, ...right.map((c) => (mods.includes(c) ? sorted[k++] : c)))
    }
  }
  const iso = codes.includes('IntlBackslash')
  const width = (c) => (iso && c === 'ShiftLeft' ? 1.25 : iso && c === 'Enter' ? 1.25 : WIDTH[c] ?? 1)
  const keys = []
  rows.forEach((row, y) => {
    const fRow = row[0] === 'Escape' && row[1] === 'F1'
    let w = row.map(width)
    // bottom row of compact boards: right-hand modifiers shrink to 1u when arrows share the row
    if (row.includes('ArrowLeft')) w = w.map((v, i) => (FLEX_RIGHT.has(row[i]) ? 1 : v))
    if (row.includes('ArrowUp')) w = w.map((v, i) => (row[i] === 'ShiftRight' ? 1.75 : v))
    let x = 0
    row.forEach((c, i) => {
      keys.push({ code: c, x, y, w: w[i], h: 1 })
      // the function row has small gaps after Esc, F4 and F8
      x += w[i] + (fRow && (c === 'Escape' || c === 'F4' || c === 'F8') ? 0.25 : 0)
    })
  })
  return keys
}

// ---------- main ----------

async function main() {
  const args = process.argv.slice(2)
  const outIdx = args.indexOf('--out')
  const out = outIdx >= 0 ? args.splice(outIdx, 2)[1] : path.resolve(__dirname, '../../app/src/devices/ry-catalog.json')
  const fetchIdx = args.indexOf('--fetch')
  if (fetchIdx >= 0) args.splice(fetchIdx, 1)
  const dir = args[0]
  if (!dir) throw new Error('usage: build-ry.js [--fetch] <work dir> [--out file]')
  if (fetchIdx >= 0) await fetchBundle(dir)

  const index = fs.readFileSync(path.join(dir, 'index.js'), 'utf8')
  const chunks = Object.fromEntries(fs.readdirSync(path.join(dir, 'js')).map((f) => [f, fs.readFileSync(path.join(dir, 'js', f), 'utf8')]))
  const loaderFile = Object.keys(chunks).find((f) => chunks[f].includes('findRy5088Device'))
  if (!loaderFile) throw new Error('RY5088 loader chunk missing')
  const loader = chunks[loaderFile]

  // --- device list
  const entries = []
  for (const m of index.matchAll(/\{id:\d+,vid:\d+,pid:\d+,/g)) {
    let value
    try {
      value = parseAt(index, m.index).value
    } catch {
      continue
    }
    if (typeof value?.name === 'string' && value.name.startsWith('ry5088_') && value.type === 'keyboard') entries.push(value)
  }

  // --- layouts: createKeyboardState switch -> code arrays
  const ksStart = index.indexOf('createKeyboardState=()=>{')
  const ksBody = index.slice(ksStart, matchBrace(index, index.indexOf('{', ksStart)) + 1)
  const layoutVar = {}
  let pending = []
  for (const t of ksBody.matchAll(/case _\.(\w+):|return e\((\w+)\)/g)) {
    if (t[1]) pending.push(t[1])
    else {
      for (const n of pending) layoutVar[n] = t[2]
      pending = []
    }
  }
  // layout descriptions from the layout enum: e.Common61_gk06="常规61键(gk06 alt fn menu ctrl)"
  const layoutLabel = Object.fromEntries([...index.matchAll(/e\.(Common\w+|Special\w+)="([^"]*)"/g)].map((m) => [m[1], m[2]]))
  const layoutCodes = (name) => {
    const v = layoutVar[name]
    const arr = v && declaration(index, v)
    return Array.isArray(arr) ? arr : null
  }

  // --- model classes: finder switch, class fields, inheritance across chunks
  const classOf = Object.fromEntries([...loader.matchAll(/case"(ry5088_[\w]+)":return new (\w+)\(/g)].map((m) => [m[1], m[2]]))
  const importsOf = (src) =>
    Object.fromEntries(
      [...src.matchAll(/import\{([^}]*)\}from"\.\/([\w.]+)"/g)].flatMap(([, names, file]) =>
        names.split(',').map((p) => {
          const [orig, alias] = p.split(' as ').map((s) => s.trim())
          return [alias ?? orig, { file, orig }]
        }),
      ),
    )
  const exportName = (src, name) => {
    const ex = /export\{([^}]*)\}/.exec(src)?.[1] ?? ''
    for (const p of ex.split(',')) {
      const [local, as] = p.split(' as ').map((s) => s.trim())
      if ((as ?? local) === name) return local
    }
    return name
  }
  const FIELDS = ['defaultMatrix', 'LightList', 'MAXSPEED', 'DAZZLE', 'NORMAL', 'COMMONCOLOR', 'maxMacro']
  const fieldsOf = (file, cls, seen = 0) => {
    const src = chunks[file]
    if (!src || seen > 10) return {}
    const head = new RegExp(`class ${esc(cls)} extends ([\\w$]+)\\{`).exec(src)
    if (!head) {
      // maybe imported
      const imp = importsOf(src)[cls]
      return imp ? fieldsOf(imp.file, exportName(chunks[imp.file] ?? '', imp.orig), seen + 1) : {}
    }
    const open = head.index + head[0].length - 1
    const body = src.slice(open, matchBrace(src, open) + 1)
    const own = {}
    for (const f of FIELDS) {
      const m = new RegExp(`[{;]${f}=`).exec(body)
      if (!m) continue
      let v = parseAt(body, m.index + m[0].length).value
      if (v && typeof v === 'object' && v.ref) {
        // identifier: a declaration in this chunk or an import
        const local = declaration(src, v.ref)
        if (local !== undefined) v = local
        else {
          const imp = importsOf(src)[v.ref]
          const isrc = imp && chunks[imp.file]
          v = isrc ? declaration(isrc, exportName(isrc, imp.orig)) : undefined
        }
      }
      if (v !== undefined) own[f] = v
    }
    const parent = head[1]
    const local = new RegExp(`class ${esc(parent)} extends`).test(src)
    const inherited = local ? fieldsOf(file, parent, seen + 1) : (() => {
      const imp = importsOf(src)[parent]
      return imp ? fieldsOf(imp.file, exportName(chunks[imp.file] ?? '', imp.orig), seen + 1) : {}
    })()
    return { ...inherited, ...own }
  }

  // --- light layouts
  const lightCache = new Map()
  const lightLayout = (ref) => {
    if (!ref) return null
    if (!lightCache.has(ref)) {
      const v = declaration(index, ref)
      lightCache.set(ref, v && Array.isArray(v.types) ? v : null)
    }
    return lightCache.get(ref)
  }

  // --- assemble
  const matrices = []
  const matrixKey = new Map()
  const layouts = []
  const layoutKey = new Map()
  const lights = []
  const lightKey = new Map()
  const devices = []
  const skipped = []
  const intern = (list, map, value) => {
    const k = JSON.stringify(value)
    if (!map.has(k)) {
      map.set(k, list.length)
      list.push(value)
    }
    return map.get(k)
  }

  for (const e of entries) {
    const cls = classOf[e.name]
    const f = cls ? fieldsOf(loaderFile, cls) : {}
    const matrix = Array.isArray(f.defaultMatrix) ? f.defaultMatrix : null
    if (!matrix || matrix.length % 4) {
      skipped.push(`${e.name}: no key matrix`)
      continue
    }
    const positions = matrix.length / 4
    const entryAt = (p) => matrix.slice(p * 4, p * 4 + 4)
    const sparse = []
    for (let p = 0; p < positions; p++) if (entryAt(p).some((b) => b)) sparse.push([p, ...entryAt(p)])

    // physical keys: layout order -> matrix position by factory code
    const layoutName = e.keyLayout?.ref?.replace(/^_\./, '')
    const codes = (layoutName && layoutCodes(layoutName)) || []
    const used = new Set()
    const posFor = (code) => {
      for (let p = 0; p < positions; p++) {
        if (used.has(p)) continue
        const [a, b, c, d] = entryAt(p)
        const isFn = a === 10 && b === 1 && c === 0 && d === 0
        if (code === 'Fn' ? isFn : a === 0 && b === 0 && d === 0 && c === CODE_HID[code]) {
          used.add(p)
          return p
        }
      }
      return undefined
    }
    let geo = geometry(codes, layoutLabel[layoutName])
    let keys = []
    if (geo) {
      for (const k of geo) {
        const p = posFor(k.code)
        if (p === undefined) continue
        keys.push([p, k.code === 'Fn' ? 0 : CODE_HID[k.code] ?? 0, k.x, k.y, k.w, k.h])
      }
      // most keys must resolve, or the order wasn't what we assumed
      if (keys.length < Math.min(codes.length, sparse.length) * 0.8) geo = null
    }
    if (!geo) {
      // fallback: the matrix itself, column-major with 6 rows per column
      keys = sparse
        .filter(([, a, b, c, d]) => (a === 0 && b === 0 && d === 0 && c) || (a === 10 && b === 1))
        .map(([p, a, , c]) => [p, a === 10 ? 0 : c, Math.floor(p / 6), p % 6, 1, 1])
    }

    const ll = lightLayout(e.lightLayout?.ref)
    const light = {
      list: f.LightList && typeof f.LightList === 'object' ? f.LightList : null,
      maxSpeed: typeof f.MAXSPEED === 'number' ? f.MAXSPEED : 4,
      dazzle: typeof f.DAZZLE === 'number' ? f.DAZZLE : 8,
      normal: typeof f.NORMAL === 'number' ? f.NORMAL : 7,
      types: ll ? ll.types.map((t) => ({ type: t.type, options: Array.isArray(t.options) ? t.options.length : 0, rgb: t.rgb === true, dazzle: t.dazzle === true, speed: t.maxSpeed !== 0 })) : null,
    }
    const ts = e.other?.travelSetting
    const num = (v) => (typeof v === 'number' ? v : undefined)
    devices.push({
      id: e.id,
      name: e.name,
      displayName: e.displayName,
      company: typeof e.company === 'string' ? e.company : undefined,
      vendorId: e.vid,
      productId: e.pid,
      magnetism: e.magnetism === true,
      layers: num(e.layer) ?? 1,
      maxMacro: num(f.maxMacro),
      travel: ts
        ? {
            max: num(ts.travel?.max),
            min: num(ts.travel?.min),
            def: num(ts.travel?.default),
            step: num(ts.travel?.step),
            rtMin: num(ts.firePress?.min),
            rtMax: num(ts.firePress?.max),
          }
        : undefined,
      matrix: intern(matrices, matrixKey, sparse),
      positions,
      keys: intern(layouts, layoutKey, keys),
      light: intern(lights, lightKey, light),
      layoutName,
      geometry: geo ? 'standard' : 'grid',
    })
  }

  devices.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id - b.id)
  fs.writeFileSync(out, JSON.stringify({ source: 'app.monsgeek.com (MonsGeek web driver)', builtAt: new Date().toISOString().slice(0, 10), devices, matrices, layouts, lights }))
  const by = (k) => devices.filter((d) => d.geometry === k).length
  console.log(`${devices.length} devices (${by('standard')} standard layouts, ${by('grid')} grid), ${matrices.length} matrices, ${layouts.length} layouts, ${lights.length} light sets, ${skipped.length} skipped -> ${out} (${fs.statSync(out).size} bytes)`)
  if (skipped.length) console.log('skipped:', skipped.slice(0, 10).join('; '), skipped.length > 10 ? '…' : '')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
