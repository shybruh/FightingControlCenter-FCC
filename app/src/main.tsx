import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './motion.css'
import './themes.css'
import { Osd } from './desktop/Osd'
import { hideBrowserChrome } from './desktop/browserChrome'
import { isTauri } from './desktop/env'
import { restoreSettings } from './desktop/settingsFile'
import { applyTheme, startTheme, useTheme } from './theme'

// The desktop build loads this bundle twice: the main window and the on-screen popup overlay.
const isOsd = new URLSearchParams(location.search).has('osd')
if (isOsd) document.documentElement.classList.add('osd')
// desktop app: behave like an app, not a web page (no stray text selection)
if (isTauri()) {
  document.documentElement.classList.add('app')
  hideBrowserChrome()
}

// the theme as last saved here, before anything paints (the popup overlay stays dark)
if (!isOsd) applyTheme(useTheme.getState().theme)

const root = createRoot(document.getElementById('root')!)
if (isOsd) {
  root.render(
    <StrictMode>
      <Osd />
    </StrictMode>,
  )
} else {
  // the settings file must be in place before the app (and its stores) read anything
  void restoreSettings()
    .then(() => startTheme())
    .then(() => import('./App.tsx'))
    .then(({ default: App }) =>
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    )
}
