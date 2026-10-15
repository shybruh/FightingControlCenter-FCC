import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appVersion: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'src-tauri/tauri.conf.json'), 'utf8')).version

/** This version's section of CHANGELOG.md, shown once after an update ("What's new"). */
function releaseNotes(version: string) {
  try {
    const log = fs.readFileSync(path.resolve(__dirname, '../CHANGELOG.md'), 'utf8')
    const start = log.indexOf(`\n## ${version}\n`)
    if (start < 0) return ''
    const body = log.slice(log.indexOf('\n', start + 1) + 1)
    const end = body.search(/^## /m)
    return (end < 0 ? body : body.slice(0, end)).trim()
  } catch {
    return ''
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(appVersion), __RELEASE_NOTES__: JSON.stringify(releaseNotes(appVersion)) },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
