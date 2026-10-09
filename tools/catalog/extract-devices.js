const fs = require('fs')
const { extract, lines } = require('./extract.js')
const src = lines.join('\n')
const lineOf = (re, from = 0) => lines.findIndex((l, i) => i >= from && re.test(l)) + 1
// layout getters: k (base layouts) between the k/y markers, y (fn layouts) between y/h
const kStart = lineOf(/^\s{12}k = new\(function\(\) \{/), yStart = lineOf(/^\s{12}y = new\(function\(\) \{/), hStart = lineOf(/^\s{12}h = new\(function\(\) \{/)
const getters = (from, to) => {
  const o = {}
  for (let i = from; i < to; i++) {
    const m = lines[i - 1].match(/^\s+key: "(get[A-Za-z0-9_]+)"/)
    if (m) { try { const v = extract(i); o[m[1]] = () => v } catch (e) { /* non-literal getter */ } }
  }
  return o
}
const stub = (o) => new Proxy(o, { get: (t, p) => t[p] ?? (() => null) })
const k = stub(getters(kStart, yStart)), y = stub(getters(yStart, hStart)), h = stub(getters(hStart, hStart + 400))
// Y: the device group array literal
const yLine = lineOf(/^\s{12}Y = function\(e\) \{/)
const yText = lines.slice(yLine, yLine + 8000).join('\n')
const arrStart = yText.indexOf('[')
const arrEnd = yText.indexOf('].find(function(i) {')
const scope = new Proxy({ k, y, h }, { has: (t, p) => p in t || !(p in globalThis), get: (t, p) => (p in t ? t[p] : p === Symbol.unscopables ? undefined : () => null) })
const groups = new Function('scope', 'with (scope) { return ' + yText.slice(arrStart, arrEnd + 1) + ' }')(scope)
// T: usb filters for "all"
const tLine = lineOf(/^\s{12}T = function\(\) \{/)
const tText = lines.slice(tLine, tLine + 500).join('\n')
const a = tText.indexOf('e = [', tText.indexOf('case "all":')) + 4
let depth = 0, j = a
for (; j < tText.length; j++) { if (tText[j] === '[') depth++; else if (tText[j] === ']') { depth--; if (depth === 0) break } }
const filters = eval(tText.slice(a, j + 1))
// find which getter produced each list by identity of its JSON
const layoutName = (list) => { const s = JSON.stringify(list); return Object.keys({ ...k }).find((n) => JSON.stringify(k[n]()) === s) }
const fnName = (list) => { if (!list) return null; const s = JSON.stringify(list); return Object.keys({ ...y }).find((n) => JSON.stringify(y[n]()) === s) }
const devices = []
for (const g of groups) for (const d of g.list) {
  devices.push({ group: g.name, productId: d.productId, name: d.name, layout: layoutName(d.list), fnLayout: fnName(d.fn),
    trip: d.trip, currentTrip: d.currentTrip, minSensitivity: d.minSensitivity, maxSensitivity: d.maxSensitivity,
    sensitivityStep: d.SensitivityStep, sensitivity: d.sensitivity, isAxial: !!d.isAxial, axial: d.axial?.map((x) => ({ name: x.name, value: x.value, trip: x.trip, minSensitivity: x.minSensitivity })),
    defaultAxial: d.defaultValue, mode: d.mode, isZone: !!d.isZone })
}
const layouts = Object.fromEntries(Object.entries({ ...k }).filter(([n]) => n !== 'getAllKey' && !['getDefault','getExcel','getCsv','getImgURLs'].includes(n)).map(([n, f]) => [n, f()]))
const fnLayouts = Object.fromEntries(Object.entries({ ...y }).map(([n, f]) => [n, f()]))
fs.writeFileSync('devices-raw.json', JSON.stringify({ devices, filters, layouts, fnLayouts }, null, 1))
console.log('groups', groups.length, 'devices', devices.length, 'filters', filters.length, 'layouts', Object.keys(layouts).length, 'fn', Object.keys(fnLayouts).length)
console.log('devices without layout match:', devices.filter((d) => !d.layout).map((d) => d.name + ':' + d.productId).join(', ') || 'none')
