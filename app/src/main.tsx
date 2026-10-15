import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './motion.css'
import { Osd } from './desktop/Osd'
import { hideBrowserChrome } from './desktop/browserChrome'
import { isTauri } from './desktop/env'
import { restoreSettings } from './desktop/settingsFile'

// The desktop build loads this bundle twice: the main window and the on-screen popup overlay.
const isOsd = new URLSearchParams(location.search).has('osd')
if (isOsd) document.documentElement.classList.add('osd')
// desktop app: behave like an app, not a web page (no stray text selection)
if (isTauri()) {
  document.documentElement.classList.add('app')
  hideBrowserChrome()
}

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
    .then(() => import('./App.tsx'))
    .then(({ default: App }) =>
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    )
}
