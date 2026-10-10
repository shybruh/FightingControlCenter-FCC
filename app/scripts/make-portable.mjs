// Packs the release build as a portable zip: the exe plus portable.txt, which keeps all data next to it.
// Run after `tauri build` (npm run desktop:portable does both).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const app = path.resolve(import.meta.dirname, '..')
const { version, productName } = JSON.parse(fs.readFileSync(path.join(app, 'src-tauri/tauri.conf.json'), 'utf8'))
const exe = path.join(app, 'src-tauri/target/release/fcc.exe')
if (!fs.existsSync(exe)) throw new Error('No release build found: run `npm run desktop:build` first')

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-portable-'))
const folder = path.join(stage, `FCC-portable-${version}`)
fs.mkdirSync(folder)
fs.copyFileSync(exe, path.join(folder, `${productName}.exe`))
fs.writeFileSync(
  path.join(folder, 'portable.txt'),
  [
    `${productName} ${version}, portable`,
    '',
    'While this file sits next to the exe, profiles, settings and backups are kept in the FCC-data folder here,',
    'so the whole folder can live on a USB stick. Delete this file to use the normal Windows location instead.',
    '',
    'Needs the Microsoft Edge WebView2 runtime, which Windows 10 and 11 already include.',
    '',
  ].join('\r\n'),
)

const out = path.join(app, 'src-tauri/target/release/bundle/portable')
fs.mkdirSync(out, { recursive: true })
const zip = path.join(out, `FCC-portable-${version}.zip`)
fs.rmSync(zip, { force: true })
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${folder}' -DestinationPath '${zip}'`], { stdio: 'inherit' })
fs.rmSync(stage, { recursive: true, force: true })
console.log(`Portable build: ${zip} (${(fs.statSync(zip).size / 1048576).toFixed(2)} MiB)`)
