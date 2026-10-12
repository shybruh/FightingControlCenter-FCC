// Prints the CHANGELOG.md section for a version (default: the app's current version), for the GitHub release notes.
// Usage: node scripts/release-notes.mjs [version]
import fs from 'node:fs'
import path from 'node:path'

const app = path.resolve(import.meta.dirname, '..')
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(app, 'src-tauri/tauri.conf.json'), 'utf8')).version
const changelog = fs.readFileSync(path.join(app, '..', 'CHANGELOG.md'), 'utf8')

// "## 0.3.0" or "## 0.3.0 - 2026-10-12" up to the next "## "
const sections = changelog.split(/^## /m).slice(1)
const section = sections.find((s) => s.split(/\s/)[0] === version)
if (!section) {
  console.error(`CHANGELOG.md has no "## ${version}" section. Rename "## Unreleased" to "## ${version}" before tagging.`)
  process.exit(1)
}
const body = section.slice(section.indexOf('\n') + 1).trim()

console.log(`${body}

---

**Download:** the \`…_x64-setup.exe\` installer, or \`FCC-portable-${version}.zip\` to run without installing. Both keep your profiles in \`%APPDATA%\\Fighting Control Center\`, so updating keeps them.

The app isn't code-signed yet, so Windows SmartScreen may warn: *More info → Run anyway*.`)
