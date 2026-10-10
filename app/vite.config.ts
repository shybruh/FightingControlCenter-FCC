import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const appVersion: string = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'src-tauri/tauri.conf.json'), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
