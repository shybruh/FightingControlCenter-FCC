// The desktop app runs in WebView2, which still exposes browser behaviour (context menu with
// Back/Refresh/Print, reload and print shortcuts). None of that belongs in a desktop app.

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || !!t.closest('input, textarea, [contenteditable="true"]'))

/** Browser shortcuts with no meaning in the app. Dev builds keep them for debugging. */
function isBrowserShortcut(e: KeyboardEvent) {
  const k = e.key.toLowerCase()
  if (k === 'f5' || k === 'f3' || k === 'browserback' || k === 'browserforward' || k === 'browserrefresh') return true
  if (e.altKey && (k === 'arrowleft' || k === 'arrowright')) return true // back / forward
  if (e.ctrlKey && !e.altKey) {
    if (['r', 'p', 'f', 'g', 'u', 's', 'j', 'h', 'o'].includes(k)) return true // reload, print, find, source, save, downloads, history, open
    if (e.shiftKey && (k === 'r' || k === 'i' || k === 'c' || k === 'j')) return true // hard reload, devtools
  }
  return false
}

export function hideBrowserChrome() {
  // Native menu only inside text fields (cut / copy / paste); nowhere else.
  window.addEventListener('contextmenu', (e) => {
    if (!isEditable(e.target)) e.preventDefault()
  })
  if (import.meta.env.DEV) return
  window.addEventListener(
    'keydown',
    (e) => {
      if (isBrowserShortcut(e)) e.preventDefault()
    },
    // capture phase, but key presses still reach the app's own handlers (macro recorder, key picker…)
    { capture: true },
  )
}
