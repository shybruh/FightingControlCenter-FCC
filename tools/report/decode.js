#!/usr/bin/env node
// Decodes an FCC board report or support request (the GitHub issue text, or a saved fcc-report-*.md).
//
//   node tools/report/decode.js report.md            summary, checklist and what to change
//   node tools/report/decode.js report.md --dump dir write each region as <name>.bin (+ report.json)
//   node tools/report/decode.js report.md --verify   add the board to app/src/devices/verified.json
//   (no file: reads stdin, so you can paste the issue body)

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const root = path.resolve(__dirname, '../..')
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return null
  args.splice(i, 1)
  return name === '--dump' ? args.splice(i, 1)[0] : true
}
const dumpDir = flag('--dump')
const verify = flag('--verify')
const text = args[0] ? fs.readFileSync(args[0], 'utf8') : fs.readFileSync(0, 'utf8')

const unpack = (b64) => JSON.parse(zlib.gunzipSync(Buffer.from(b64.replace(/\s+/g, ''), 'base64')).toString('utf8'))

// a support request ("Keyboard not supported?" in the app): the board's USB interfaces, to tell which chip it is
const request = text.match(/```fcc-request\s*([\s\S]*?)```/)
if (request) {
  const r = unpack(request[1])
  if (r.format !== 'fcc-request') throw new Error('not an FCC support request')
  const h = (n, w) => n.toString(16).padStart(w, '0')
  console.log(`Keyboard  ${[r.details.brand, r.details.model].filter(Boolean).join(' ') || '(not given)'}${r.details.link ? `  ${r.details.link}` : ''}`)
  console.log(`USB       ${h(r.usb.vendorId, 4)}:${h(r.usb.productId, 4)} "${r.usb.product}" by "${r.usb.manufacturer}"${r.usb.release != null ? `, release 0x${h(r.usb.release, 4)}` : ''}`)
  console.log(`FCC       ${r.app}, ${r.platform}${r.known ? ' (already in the catalogue!)' : ''}`)
  console.log('\nInterfaces')
  for (const i of r.interfaces) {
    const reports = i.reports
      ? ['input', 'output', 'feature'].map((k) => Object.entries(i.reports[k]).map(([id, n]) => `${k} 0x${h(Number(id), 2)}:${n}B`).join(' ')).filter(Boolean).join('  ')
      : 'reports unknown'
    console.log(`  if${i.interface ?? '?'}  page 0x${h(i.usagePage, 4)} usage 0x${h(i.usage, 2)}  ${reports}${i.descriptor ? '' : '  (no descriptor)'}`)
  }
  if (dumpDir) {
    fs.mkdirSync(dumpDir, { recursive: true })
    r.interfaces.forEach((i, n) => i.descriptor && fs.writeFileSync(path.join(dumpDir, `if${i.interface ?? n}-${h(i.usagePage, 4)}-${h(i.usage, 2)}.desc.bin`), Buffer.from(i.descriptor, 'base64')))
    fs.writeFileSync(path.join(dumpDir, 'request.json'), JSON.stringify(r, null, 2))
    console.log(`\nDescriptors written to ${dumpDir}`)
  }
  console.log('\nNext\n  Vendor pages (0xFFxx) are where configuration happens: compare their report ids and sizes with docs/PROTOCOL*.md.')
  process.exit(0)
}

const block = text.match(/```fcc-report\s*([\s\S]*?)```/)
if (!block) {
  console.error('No ```fcc-report or ```fcc-request block found. Was the "Raw data" section removed?')
  process.exit(1)
}
const report = unpack(block[1])
if (report.format !== 'fcc-report') throw new Error('not an FCC report')

const hex4 = (n) => n.toString(16).padStart(4, '0')
const usb = `${hex4(report.usb.vendorId)}:${hex4(report.usb.productId)}`
const ticked = [...text.matchAll(/^- \[([ xX])\] (.*)$/gm)].map((m) => ({ ok: m[1] !== ' ', item: m[2] }))

console.log(`Board     ${report.model ? `${report.model.name} [${report.model.id}] (${report.model.status}, ${report.model.protocol})` : 'unknown model'}`)
console.log(`USB       ${usb} "${report.usb.name}"`)
console.log(`Firmware  ${report.firmware ?? 'n/a'}`)
console.log(`Detected  ${report.detected.certain ? `certain: ${report.detected.id}` : `${report.detected.candidates.length} candidates: ${report.detected.candidates.join(', ') || 'none'}`}`)
console.log(`FCC       ${report.app}, ${report.platform}${report.demo ? ' (DEMO MODE: not a real board)' : ''}`)
if (report.info && (report.info.vid !== report.usb.vendorId || report.info.pid !== report.usb.productId)) {
  console.log(`Note      firmware reports ${hex4(report.info.vid)}:${hex4(report.info.pid)}, USB says ${usb}`)
}
if (ticked.length) {
  console.log('\nChecklist')
  for (const t of ticked) console.log(`  ${t.ok ? '✔' : '·'} ${t.item}`)
}

if (dumpDir) {
  fs.mkdirSync(dumpDir, { recursive: true })
  for (const [name, b64] of Object.entries(report.regions ?? {})) fs.writeFileSync(path.join(dumpDir, `${name}.bin`), Buffer.from(b64, 'base64'))
  fs.writeFileSync(path.join(dumpDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`\nRegions written to ${dumpDir}`)
}

// what to do with it
console.log('\nNext')
const verifiedFile = path.join(root, 'app/src/devices/verified.json')
const verified = JSON.parse(fs.readFileSync(verifiedFile, 'utf8'))
const id = report.model?.id
const allOk = ticked.length > 0 && ticked.every((t) => t.ok)
if (report.demo) {
  console.log('  Demo-mode report: nothing to change.')
} else if (!id) {
  console.log('  Not in the catalogue. Add an entry for this USB id; start from the closest model:')
  console.log(JSON.stringify({ id: '<new-id>', name: report.usb.name, vendorId: report.usb.vendorId, productId: report.usb.productId, layout: '<closest layout>', transport: 'wired', status: 'untested' }, null, 2))
} else if (verified.verified.includes(id)) {
  console.log(`  ${id} is already verified.`)
} else if (verify) {
  verified.verified.push(id)
  fs.writeFileSync(verifiedFile, JSON.stringify(verified, null, 2) + '\n')
  console.log(`  Added ${id} to app/src/devices/verified.json.`)
} else {
  console.log(allOk ? `  Everything ticked: run again with --verify to mark ${id} verified.` : `  Some items not ticked: read the notes in the issue before marking ${id} verified.`)
}
if (!report.detected.certain && id) console.log(`  Detection wasn't certain: consider a name match for "${report.usb.name}" -> ${id}.`)
