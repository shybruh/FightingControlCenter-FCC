<div align="center">

# Fighting Control Center

**A fast, modern configurator for Hall-effect keyboards.**
Works with ~135 Sonix-based boards (MCHOSE, AULA, Ajazz, Epomaker …) ~280 RongYuan-based ones (MonsGeek FUN60, FUN68, M1 V5 HE, Akko …) and MCHOSE's ACE / JET / MIX range.
Tested end to end on the Fekker × VTER **Fighting68 HE** so far: [report yours](#report-your-keyboard) to get it verified.

Rapid trigger · Live key travel · Lighting · Remapping · Advanced keys · Macros · Profiles

Windows desktop app (Tauri, ~2 MB) and a web version (Chrome / Edge)

<img src="docs/screenshots/lighting.png" alt="Lighting page with a live wave effect preview" width="900">

</div>

---

## Why

Most Sonix-based HE keyboards are configured through the same official web driver. It works, but it's slow, cluttered
and easy to get lost in. FCC is a from-scratch replacement: the same keyboard protocol (reverse-engineered and documented in [docs/PROTOCOL.md](docs/PROTOCOL.md)),
wrapped in a clean, dark, keyboard-first UI, plus the things a desktop app should have: profiles you can switch
mid-game, a tray icon, hotkeys and per-game auto-switching.

## Features

### Performance & rapid trigger

Per-key actuation, rapid trigger with separate press/release sensitivity, continuous RT, bottom-out optimisation
and rampage mode. Select one key, a few, or the whole board.

<img src="docs/screenshots/performance.png" alt="Performance page" width="900">

### Live key travel

See exactly how far every key is pressed, in 0.01 mm, with your actuation point and rapid-trigger distances on the
gauge. Doubles as travel calibration.

<img src="docs/screenshots/live-travel.png" alt="Live key travel meter" width="900">

### Lighting

All 19 firmware effects with a live on-screen preview (reactive effects respond to your typing), brightness,
speed, direction, single colour or rainbow, and per-key painting.

<img src="docs/screenshots/lighting-presets.png" alt="Lighting presets" width="900">

16 built-in per-key designs (Sunset, Vaporwave, Fire, WASD focus…) and your own saved lighting presets.

### Keymap

Remap any key to another key, key + modifier combos, media keys, mouse buttons or the scroll wheel.

<img src="docs/screenshots/keymap.png" alt="Keymap editor" width="900">

### Advanced keys

**Rappy Snappy**, **SOCD** (last input, key 1 / key 2 priority, neutral), **Dynamic Keystroke** (4 keys × 4 stages,
tap or hold, per-stage trigger points), **Mod-Tap** and **Toggle**.

<img src="docs/screenshots/advanced-dks.png" alt="Dynamic keystroke editor" width="900">

### Macros

Record with real or fixed delays, edit and reorder every action, insert keys and mouse clicks, watch the memory
meter, and bind to a key: play once, repeat N times, or until pressed again.

<img src="docs/screenshots/macros.png" alt="Macro editor" width="900">

### Profiles & desktop app

- **Unlimited profiles**, switched from the sidebar, the **tray**, **global hotkeys** (Ctrl+Alt+1…9) or
  **automatically when a game is focused** (and back when you leave it)
- **On-screen popup** shows the new profile over your game, without ever stealing focus
- **Start with Windows** quietly in the tray; close-to-tray; single instance
- Switching only rewrites what differs on the keyboard, so it's near-instant
- Import / export profiles as files

### Settings

Polling rate (up to 8 kHz), sleep, stability mode, adaptive calibration, wake mode, full backup and factory reset.

<img src="docs/screenshots/settings.png" alt="Settings page" width="900">

## Supported keyboards

| Status | Boards | |
|---|---|---|
| ✅ Verified | **Fighting68 HE** (`0c45:8030`) | Tested end to end on real hardware |
| ⚠️ Untested | 135 wired boards: AULA F65, Ajazz AK820 MAX, EWEADN BAT68, Royal Kludge RK-series, MCHOSE, Looting, QSENN, Epomaker HE80, LEOBOG… | Detected automatically; open **read-only** until you choose *Allow changes* |
| ⚠️ Untested | 285 RongYuan RY5088 boards: **MonsGeek FUN60** / FUN68 / M1 V5 HE, Akko MOD007B HE, … | Every feature, over MonsGeek's own protocol. The board reports its exact model. Read-only until *Allow changes* |
| ⚠️ Untested | 28 MCHOSE boards: **ACE 60** / 60 Pro / 68 / 68 Air / 75, JET 75, ZERO 75X, MIX 87, … | Lighting, per-key RGB, keymap, actuation, rapid trigger, mod-tap, toggle, macros, settings. DKS / SOCD / live travel later. Read-only until *Allow changes* |
| 🧪 Experimental | **Royal Kludge M75** family (`258a:0147`, `0163`, `0175`, `01ac`) | Keymap, lighting, per-key RGB and sleep. Not a Hall-effect board, so no rapid trigger, advanced keys or macros. Write-only: FCC shows your saved profile |
| ⛔ Not yet | Wireless 2.4 GHz dongles | Use the USB cable instead |

The Sonix boards use the same firmware family as the Fighting68, and the RongYuan boards follow MonsGeek's own driver
([docs/PROTOCOL-RY.md](docs/PROTOCOL-RY.md)), so they *should* work. The full list with
USB ids and switch limits is in **[docs/DEVICES.md](docs/DEVICES.md)**. The M75 is a side project for a non-HE board
that speaks Royal Kludge's own protocol ([docs/PROTOCOL-RK.md](docs/PROTOCOL-RK.md)).

## Report your keyboard

Tried FCC on a board that isn't verified yet? In the app, open **Settings → Report this keyboard** (or use the button
on the yellow banner) and press **Open GitHub issue**. The report holds what's needed to verify or fix your board:
USB id, firmware and the settings read from it (macro contents are left out). Tick what worked, add notes, submit.

For maintainers: `node tools/report/decode.js <issue.md>` summarises a report, `--dump <dir>` extracts the raw
regions and `--verify` marks the board verified in `app/src/devices/verified.json`.

## Install

**Windows:** download `Fighting Control Center_x64-setup.exe` from [Releases](../../releases) and run it.
The installer isn't code-signed yet, so SmartScreen may warn you: *More info → Run anyway*.

**Portable:** download `FCC-portable-<version>.zip`, unzip anywhere (a USB stick works) and run the exe. While
`portable.txt` sits next to it, profiles and settings stay in an `FCC-data` folder beside the exe. Build it with
`npm run desktop:portable`.

**Browser:** run the web version (below) in Chrome or Edge; no install needed.

## Build from source

Requirements: Node.js 20+, and for the desktop app, Rust and the Microsoft C++ build tools.

```bash
git clone https://github.com/shybruh/FightingControlCenter---FCC.git
cd FightingControlCenter---FCC
npm --prefix app install

npm --prefix app run dev              # web version on http://localhost:5174
npm --prefix app run desktop          # desktop app with hot reload
npm --prefix app run desktop:build    # release build + installer (app/src-tauri/target/release/bundle/nsis)
```

No keyboard handy? Click **Try demo mode** for a simulated board (or **Demo: Royal Kludge M75**).

## Safety

FCC writes to your keyboard's memory, so it's deliberately careful:

- Only the commands the official driver itself sends are used. **There is no firmware-flashing code.**
- Every packet waits for the keyboard's acknowledgement; writes are serialized and never interleave.
- All values are clamped to each board's limits before encoding; unknown bytes are preserved.
- A full backup of the keyboard is taken on every connect.
- Untested boards start read-only. The Fn key can't be remapped. Factory reset is always one click away.

## Tech

React 19 · TypeScript · Vite · Tailwind CSS 4 · shadcn/ui · zustand · Tauri 2 (Rust, hidapi) · WebHID

```
app/src/hid/        protocol, transports (WebHID / Tauri / demo), device queue, codecs
app/src/devices/    keyboard catalogue + detection
app/src/components/ pages and UI
app/src-tauri/      desktop shell: native HID bridge, tray, hotkeys, popup
docs/               protocol notes (Sonix, RongYuan, MCHOSE, Royal Kludge), supported devices, screenshots
tools/catalog/      scripts that regenerate the device catalogue
tools/report/       board report decoder
```

## Credits

The RongYuan protocol notes of **monsgeek-akko-linux** were the starting point for the RY5088 driver, checked against
MonsGeek's web driver. The Royal Kludge packet layout was learned from the open-source projects **Rangoli** and
**Kludge Knight**. FCC's implementations are its own. Per-model RK key layouts come from the layout files shipped with Royal Kludge's software.

## Disclaimer

Fighting Control Center is an independent project and is not affiliated with Fekker, VTER, Sonix, RongYuan, MonsGeek, Akko, MCHOSE, Royal Kludge or any keyboard
brand listed here. Use it at your own risk; a factory reset from the app (or the keyboard) restores default settings.
