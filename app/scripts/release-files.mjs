// Gathers what a GitHub release needs into app/release/: the installer (with a name GitHub won't mangle), the
// portable zip, and latest.json, which installed copies read to find and verify updates.
// Run after a signed build (`tauri build` with createUpdaterArtifacts and TAURI_SIGNING_PRIVATE_KEY) and make-portable.
import fs from 'node:fs'
import path from 'node:path'
import { appVersion, changelogSection } from './release-notes.mjs'

const REPO = 'shybruh/FightingControlCenter---FCC'
const app = path.resolve(import.meta.dirname, '..')
const version = appVersion()
const bundle = path.join(app, 'src-tauri/target/release/bundle')
const out = path.join(app, 'release')

const nsis = path.join(bundle, 'nsis')
const installer = fs.readdirSync(nsis).find((f) => f.includes(`_${version}_`) && f.endsWith('-setup.exe'))
if (!installer) throw new Error(`No ${version} installer in ${nsis}`)
const sigFile = path.join(nsis, `${installer}.sig`)
if (!fs.existsSync(sigFile)) throw new Error(`${installer}.sig is missing: build with createUpdaterArtifacts and TAURI_SIGNING_PRIVATE_KEY set`)
const zip = path.join(bundle, 'portable', `FCC-portable-${version}.zip`)
if (!fs.existsSync(zip)) throw new Error(`${zip} is missing: run make-portable first`)

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out)
const installerName = `Fighting-Control-Center_${version}_x64-setup.exe`
fs.copyFileSync(path.join(nsis, installer), path.join(out, installerName))
fs.copyFileSync(zip, path.join(out, path.basename(zip)))

const latest = {
  version,
  notes: changelogSection(version) ?? '',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature: fs.readFileSync(sigFile, 'utf8').trim(),
      url: `https://github.com/${REPO}/releases/download/v${version}/${installerName}`,
    },
  },
}
fs.writeFileSync(path.join(out, 'latest.json'), JSON.stringify(latest, null, 2))

for (const f of fs.readdirSync(out)) console.log(`${f}  ${(fs.statSync(path.join(out, f)).size / 1048576).toFixed(2)} MiB`)
