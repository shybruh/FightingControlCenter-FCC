// Whether FCC runs as the desktop app. Kept apart from hid/tauri.ts, which pulls in the keyboard catalogues: the
// start-up code and the on-screen popup only need this check.
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
