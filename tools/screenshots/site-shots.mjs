// Screenshots for the website (and README), taken from the real app in demo mode.
//
//   node tools/screenshots/site-shots.mjs <output folder>
//
// Starts the app's dev server, opens it in headless Edge at 1440×900 (2× pixels), pretends to be the desktop app so the
// desktop-only pages show, connects the Fighting68 demo board and saves one PNG per page under the names the website
// uses. Nothing touches a real keyboard.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const out = path.resolve(process.argv[2] ?? 'shots')
fs.mkdirSync(out, { recursive: true })
const app = path.resolve(import.meta.dirname, '../../app')
const PORT = 5197
const DEBUG = 9341
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p))
if (!EDGE) throw new Error('Microsoft Edge not found')

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const vite = spawn(process.execPath, [path.join(app, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { cwd: app, stdio: 'ignore' })
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-shots-'))
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DEBUG}`, '--hide-scrollbars', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

async function until(fn, what, ms = 20000) {
  const end = Date.now() + ms
  for (;;) {
    try {
      const v = await fn()
      if (v) return v
    } catch {}
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await wait(250)
  }
}

try {
  await until(() => fetch(`http://localhost:${PORT}/`).then((r) => r.ok), 'the dev server')
  const target = await until(async () => (await (await fetch(`http://127.0.0.1:${DEBUG}/json`)).json()).find((t) => t.type === 'page'), 'Edge')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((r) => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  const errors = []
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d)
      pending.delete(d.id)
    }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description?.split('\n')[0])
  }
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id
      pending.set(i, r)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true })
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)
    return r.result.result.value
  }
  const shot = async (name) => {
    // finished transitions, no hover or focus rings, no demo badge
    await evaluate(`
      document.activeElement?.blur?.()
      document.querySelectorAll('header .inline-flex, header [data-slot=badge]').forEach((b) => { if (b.textContent.trim() === 'demo') b.style.display = 'none' })
      document.querySelectorAll('*').forEach((e) => e.getAnimations?.().forEach((a) => { if (a.effect?.getTiming?.().iterations !== Infinity) try { a.finish() } catch {} }))
      await new Promise((r) => setTimeout(r, 400))`)
    const { result } = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(out, name), Buffer.from(result.data, 'base64'))
    console.log('saved', name)
  }
  const page = (label) =>
    evaluate(`
      const b = [...document.querySelectorAll('aside button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(label)})
      if (!b) throw new Error('no page ' + ${JSON.stringify(label)})
      b.click()
      await new Promise((r) => setTimeout(r, 1200))
      document.querySelector('[data-page-scroll], main [data-radix-scroll-area-viewport], main .overflow-y-auto')?.scrollTo?.(0, 0)`)
  const click = (text, within = 'main') =>
    evaluate(`
      const b = [...document.querySelectorAll(${JSON.stringify(within)} + ' button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)})
      if (!b) throw new Error('no button ' + ${JSON.stringify(text)})
      b.click()
      await new Promise((r) => setTimeout(r, 700))`)

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
  // the desktop app, minus the native side: every native call gets a harmless answer
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      const answers = { config_load: { path: 'C:\\\\Users\\\\you\\\\AppData\\\\Roaming\\\\FCC\\\\settings.json', data: null, error: null, enabled: true }, 'plugin:app|version': '${JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version}', is_installed: true, hid_scan: [], running_exes: [], list_window_apps: [], 'plugin:autostart|is_enabled': true }
      window.__TAURI_INTERNALS__ = {
        invoke: async (cmd) => (cmd in answers ? answers[cmd] : cmd.endsWith('available') ? false : null),
        transformCallback: () => 0, unregisterCallback() {}, convertFileSrc: (s) => s,
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main', windowLabel: 'main' } },
      }
      window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }`,
  })
  const version = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version
  await send('Page.navigate', { url: `http://localhost:${PORT}/` })
  await wait(2000)
  await evaluate(`localStorage.setItem('fcc.introSeen.v1', '1'); localStorage.setItem('fcc.lastVersion', ${JSON.stringify(version)})`)
  await send('Page.reload')
  await until(() => evaluate(`return document.body.innerText.includes('Connect keyboard')`), 'the start screen')
  await wait(1500)

  await shot('01-connect.png')

  const STORE = `(await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/store.ts')) ?? '/src/store.ts')).useStore`
  await evaluate(`
    const useStore = ${STORE}
    await useStore.getState().connect('fighting68')
    await new Promise((r) => setTimeout(r, 1500))
    // a few profiles, like a real setup
    const s = useStore.getState()
    s.createProfile('Competitive'); s.createProfile('Typing')
    await new Promise((r) => setTimeout(r, 600))
    useStore.getState().activateProfile(useStore.getState().profiles[0].id)
    await new Promise((r) => setTimeout(r, 1200))`)

  await page('Performance')
  await shot('02-performance.png')

  // live key travel: W A S D and Space held at different depths
  await click('Start')
  await evaluate(`
    const useStore = ${STORE}
    const { KEYS } = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/data/layout.ts')) ?? '/src/data/layout.ts')
    const kb = useStore.getState().kb
    // by HID usage: W, A, S, D, Space
    const held = { 0x1a: 182, 0x04: 96, 0x16: 241, 0x07: 133, 0x2c: 259 }
    for (let n = 0; n < 6; n++) {
      for (const [hid, travel] of Object.entries(held)) {
        const k = KEYS.find((k) => k.hid === Number(hid))
        kb.sensor.emit({ key: k.id, state: 1, rest: 0, bottom: 0, adc: 2000 - travel * 4, travel, full: 340 })
      }
      await new Promise((r) => setTimeout(r, 80))
    }
    document.querySelector('main')?.querySelectorAll('h3, [data-slot=card-title]').forEach((t) => { if (/Live key travel/.test(t.textContent)) t.scrollIntoView({ block: 'start' }) })
    await new Promise((r) => setTimeout(r, 500))`)
  await shot('02-performance-live-travel.png')
  await click('Stop & save').catch(() => {})

  await page('Lighting')
  await click('Vaporwave').catch(async () => click('Sunset'))
  await evaluate(`document.querySelector('main')?.querySelectorAll('*').forEach(() => {}); window.scrollTo(0, 0)`)
  await shot('03-lighting.png')
  await click('Wave')
  await shot('03-lighting-wave.png')

  await page('Keymap')
  await shot('04-keymap.png')
  await page('Advanced')
  await shot('05-advanced.png')
  await page('Macros')
  await shot('06-macros.png')
  await page('Keyboard')
  await shot('07-settings.png')
  await page('Profile switching')
  await shot('08-desktop.png')
  // not in the sidebar: opened from the Keyboard page
  await page('Keyboard')
  await click('Test keys')
  await wait(1000)
  await shot('09-keytest.png')
  await page('Settings')
  await shot('11-app-settings.png')

  if (errors.length) console.log('page errors:', errors)
  ws.close()
} finally {
  edge.kill()
  vite.kill()
}
