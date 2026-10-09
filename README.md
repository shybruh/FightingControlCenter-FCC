# Fighting Control Center (FCC)

A clean replacement for the VTER web driver, built for the **Fekker × VTER Fighting68 HE** (USB `0c45:8030`).

**Other keyboards:** the official driver is a white-label tool used by ~150 Sonix-based hall-effect boards
(AULA, Ajazz, EWEADN, Royal Kludge, MCHOSE, Looting, QSENN…). FCC ships their layouts and switch limits and
detects them automatically. Only the Fighting68 is verified; the rest are untested and open **read-only** until
you allow changes. See [docs/DEVICES.md](docs/DEVICES.md) for the full list.

## Run

```bash
npm --prefix app install
npm --prefix app run dev
```

Open http://localhost:5174 in **Chrome or Edge** (WebHID), click *Connect keyboard*, pick the keyboard.
*Try demo mode* runs against a simulated keyboard.
## Desktop app (Tauri)

```bash
npm --prefix app run desktop          # dev window with hot reload
npm --prefix app run desktop:build    # release build + installer
```

The installer lands in `app/src-tauri/target/release/bundle/nsis/`. The desktop app talks to the keyboard through
native hidapi (`app/src-tauri/src/hid.rs`) instead of WebHID: no permission picker, and it connects automatically
whenever the keyboard is plugged in. Profiles live in the app's own storage — use Export/Import to move profiles
over from the browser version.

Desktop-only extras (Desktop tab):

- **Tray** — profile list with the active one ticked; closing the window hides to tray; single instance
- **Global hotkeys** — per profile (default Ctrl+Alt+1…9) and "next profile" (Ctrl+Alt+0)
- **Start with Windows** — launches hidden in the tray (`--hidden`)
- **On-screen popup** — shows the new profile over your game after a hotkey / game switch (never steals focus)
- **Game profiles** — switch when a game's window is focused, revert when you leave; rules match the `.exe` name
- Profile switches only rewrite regions that differ from what's on the keyboard

## What's in

- **Performance** — per-key actuation (0.10–3.30 mm), rapid trigger with separate press/release, continuous RT, bottom-out optimisation, rampage mode, live key-travel meter, travel calibration
- **Lighting** — all 19 effects + custom per-key paint, brightness, speed, direction, single color / rainbow
- **Keymap** — remap any key to keys, key+modifier combos, media, mouse buttons, wheel; Fn layer viewer
- **Advanced** — Rappy Snappy, SOCD (4 modes), Dynamic Keystroke (4 keys × 4 stages, tap/hold, per-stage trigger points), Mod-Tap, Toggle
- **Macros** — record with real or fixed delays, edit/reorder events, insert keys and mouse clicks, memory meter, assign to keys (once / repeat N / until pressed again)
- **Settings** — polling rate, sleep, stability mode, adaptive calibration, wake mode, backup, factory reset
- **Profiles** — unlimited, host-side; switch, rename, duplicate, import/export (`.fcc.json`)

## Safety

- Only commands the official driver sends are used; there is no firmware-update code at all.
- Every chunk waits for the keyboard's acknowledgement; writes are serialized and never interleave.
- All values are range-clamped before encoding; unknown bytes are preserved.
- A full backup is taken on every connect (last 5 in browser storage + *Download full backup*).
- The Fn key cannot be remapped (it guards the Fn layer). Factory reset is always available.

Protocol reference: [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Layout

```
app/src/hid/       protocol, transport (WebHID / mock), device queue, codecs
app/src/data/      physical layout, HID keycode tables
app/src/components panels and UI
backups/           device dumps
docs/              protocol notes
```
