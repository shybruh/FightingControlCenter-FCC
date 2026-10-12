// Prints the CHANGELOG.md section for a version (default: the app's current version), for the GitHub release notes.
// Usage: node scripts/release-notes.mjs [version]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = path.resolve(import.meta.dirname, '..')

export const appVersion = () => JSON.parse(fs.readFileSync(path.join(app, 'src-tauri/tauri.conf.json'), 'utf8')).version

/** The changelog text for `version` ("## 0.3.0" or "## 0.3.0 - date" up to the next "## "), or null. */
export function changelogSection(version) {
  const changelog = fs.readFileSync(path.join(app, '..', 'CHANGELOG.md'), 'utf8')
  const section = changelog
    .split(/^## /m)
    .slice(1)
    .find((s) => s.split(/\s/)[0] === version)
  return section ? section.slice(section.indexOf('\n') + 1).trim() : null
}

export function releaseNotes(version) {
  const body = changelogSection(version)
  if (body == null) throw new Error(`CHANGELOG.md has no "## ${version}" section. Rename "## Unreleased" to "## ${version}" before tagging.`)
  return `${body}

---

**Download:** the \`…_x64-setup.exe\` installer, or \`FCC-portable-${version}.zip\` to run without installing. Installed
copies update themselves from now on (FCC offers it at startup). Profiles and settings are kept in
\`%APPDATA%\\Fighting Control Center\`, so updating keeps them.

The app isn't code-signed yet, so Windows SmartScreen may warn: *More info → Run anyway*.`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(releaseNotes(process.argv[2] || appVersion()))
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
