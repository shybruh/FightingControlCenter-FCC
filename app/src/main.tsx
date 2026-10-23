import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './motion.css'
import './themes.css'
import { Osd } from './desktop/Osd'
import { TrayPanel } from './desktop/TrayPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { hideBrowserChrome } from './desktop/browserChrome'
import { isTauri } from './desktop/env'
import { getVersion } from '@tauri-apps/api/app'
import { startLogFile } from './desktop/logFile'
import { restoreSettings } from './desktop/settingsFile'
import { applyDensity, applyTheme, startTheme, useTheme } from './theme'

// The desktop build loads this bundle in three windows: the main one, the on-screen popup overlay and the tray panel.
const isOsd = new URLSearchParams(location.search).has('osd')
if (isOsd) document.documentElement.classList.add('osd')
const isTray = new URLSearchParams(location.search).has('tray')
if (isTray) document.documentElement.classList.add('traypanel')
// desktop app: behave like an app, not a web page (no stray text selection)
if (isTauri()) {
  document.documentElement.classList.add('app')
  hideBrowserChrome()
}

// the theme as last saved here, before anything paints (the popup overlay stays dark)
if (!isOsd) {
  // the tray panel takes the main window's theme from the state it's sent (and this saved one until then)
  applyTheme(useTheme.getState().theme)
  // the tray panel is small on purpose: Auto would make it compact
  if (!isTray) applyDensity(useTheme.getState().density)
}

const root = createRoot(document.getElementById('root')!)
if (isTray) {
  root.render(
    <StrictMode>
      <TrayPanel />
    </StrictMode>,
  )
} else if (isOsd) {
  root.render(
    <StrictMode>
      <Osd />
    </StrictMode>,
  )
} else {
  // the settings file must be in place before the app (and its stores) read anything
  void restoreSettings()
    // from here on the log also goes to a file per day (desktop app)
    .then(() => (isTauri() ? getVersion().catch(() => '?').then(startLogFile) : undefined))
    .then(() => startTheme())
    .then(() => import('./App.tsx'))
    .then(({ default: App }) =>
      root.render(
        <StrictMode>
          <ErrorBoundary where="app" full>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      ),
    )
}
