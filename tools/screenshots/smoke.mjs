// Smoke test: a demo board of every protocol, every page, a profile switch and the lights toggle, with every uncaught
// exception and console error / warning collected. Nothing touches a real keyboard.
//
//   node tools/screenshots/smoke.mjs <scratch folder>
//
// Exits with code 1 when anything went wrong.

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const out = path.resolve(process.argv[2] ?? 'shots')
fs.mkdirSync(out, { recursive: true })
const app = path.resolve(import.meta.dirname, '../../app')
const PORT = 5191
const DEBUG = 9355
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
    if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) errors.push('console.' + d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' '))
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
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

  const M = (n) => `(await import(performance.getEntriesByType('resource').map((e) => e.name).find((x) => x.includes('${n}')) ?? '${n}'))`
  // one demo board per protocol
  const ids = await evaluate(`const { DEVICES } = ${M('/src/devices/registry.ts')}
    const seen = new Set(); const out = []
    for (const d of DEVICES) if (d.transport === 'wired' && !seen.has(d.protocol)) { seen.add(d.protocol); out.push(d.id) }
    return out`)
  console.log('boards:', ids.join(', '))
  const pages = ['Performance', 'Lighting', 'Keymap', 'Advanced', 'Macros', 'Keyboard', 'Profile switching', 'Settings']
  for (const id of ids) {
    const before = errors.length
    await evaluate(`const s = ${M('/src/store.ts')}.useStore; if (s.getState().kb) await s.getState().disconnect(); await s.getState().connect(${JSON.stringify(id)}); await new Promise((r) => setTimeout(r, 1500)); return s.getState().status + ' ' + (s.getState().error ?? '')`).then((r) => console.log(id, '→', r))
    // read-only demo boards: allow changes so the pages behave as for a real user
    await evaluate(`${M('/src/store.ts')}.useStore.getState().allowWrites()`)
    for (const p of pages) {
      const ok = await evaluate(`const b = [...document.querySelectorAll('aside button')].find((b) => b.getAttribute('aria-label') === ${JSON.stringify(p)}); if (!b) return false; b.click(); await new Promise((r) => setTimeout(r, 900)); return true`)
      if (!ok) continue
      // poke the page: click the first few effect / key buttons
      await evaluate(`const keys = [...document.querySelectorAll('main .key')]; keys.slice(10, 12).forEach((k) => k.click()); await new Promise((r) => setTimeout(r, 300)); return true`)
    }
    await evaluate(`${M('/src/components/nav.ts')}.useNav.getState().go('keytest'); await new Promise((r) => setTimeout(r, 700))`)
    // switch profile and back, toggle lights
    await evaluate(`const s = ${M('/src/store.ts')}.useStore.getState(); s.createProfile('Smoke'); await new Promise((r) => setTimeout(r, 300)); const p = ${M('/src/store.ts')}.useStore.getState().profiles; await s.activateProfile(p[p.length - 1].id); await s.activateProfile(p[0].id); s.setLightsOff(true); await new Promise((r) => setTimeout(r, 300)); s.setLightsOff(false); await new Promise((r) => setTimeout(r, 400))`)
    const fresh = errors.slice(before)
    console.log(`  ${id}: ${fresh.length ? fresh.length + ' problem(s)' : 'clean'}`)
    fresh.forEach((e) => console.log('   -', String(e).slice(0, 300)))
  }

  if (errors.length) console.log('page errors:', errors)
  process.exitCode = errors.length ? 1 : 0
  ws.close()
} finally {
  edge.kill()
  vite.kill()
}
