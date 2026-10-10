#!/usr/bin/env node
// Decodes an FCC board report (the GitHub issue text, or a saved fcc-report-*.md).
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

const block = text.match(/```fcc-report\s*([\s\S]*?)```/)
if (!block) {
  console.error('No ```fcc-report block found. Was the "Raw data" section removed?')
  process.exit(1)
}
const report = JSON.parse(zlib.gunzipSync(Buffer.from(block[1].replace(/\s+/g, ''), 'base64')).toString('utf8'))
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
