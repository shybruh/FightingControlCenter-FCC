import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './motion.css'
import App from './App.tsx'
import { Osd } from './desktop/Osd'
import { hideBrowserChrome } from './desktop/browserChrome'
import { isTauri } from './hid/tauri'

// The desktop build loads this bundle twice: the main window and the on-screen popup overlay.
const isOsd = new URLSearchParams(location.search).has('osd')
if (isOsd) document.documentElement.classList.add('osd')
// desktop app: behave like an app, not a web page (no stray text selection)
if (isTauri()) {
  document.documentElement.classList.add('app')
  hideBrowserChrome()
}

createRoot(document.getElementById('root')!).render(<StrictMode>{isOsd ? <Osd /> : <App />}</StrictMode>)
