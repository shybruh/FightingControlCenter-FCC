# Changelog

## 0.3.0

This is the first version that updates itself. Install it once by hand; after that FCC offers new versions on its own.

### New keyboards
- **MCHOSE magnetic boards** (ACE 60 / 68 / 75, JET 75, ZERO 75X, MIX 87 …, 28 models): lighting, per-key RGB,
  keymap, actuation, rapid trigger, mod-tap, toggle, macros and settings, with each board's real layout. Untested so
  far: they open read-only until you choose *Allow changes*.

### New
- **Auto-updates:** the installed app checks GitHub for new versions at startup and every few hours. *Update* in the
  top bar shows what's new and installs it with one click (the download is signature-checked first). Portable copies
  get a link to the new release. *Desktop → App* shows the version and has *Check now*.
- **Settings survive reinstalls:** profiles and settings are saved to `%APPDATA%\Fighting Control Center\settings.json`,
  shared by the installer and portable builds, so reinstalling, updating or deleting a portable copy keeps them.
  *Desktop → Open folder* shows it. The portable zip no longer includes `portable.txt`; add one to keep data beside
  the exe as before.
- **Diagnostics** (connect page → *Not detected? Diagnostics*, or Settings → *Diagnostics*):
  - *Devices*: every HID device and collection the PC sees, the reports each one declares, and whether (and why) FCC
    would use it. *Listen* shows a collection's live input reports. *Copy scan* for sharing.
  - *Log*: a detailed, timestamped log of detection, connecting, reading, writing (every packet) and errors. Copy or
    save it.
- **Game profiles:** choose *While focused* or *While running* (on from launch until the game closes, even when you
  alt-tab), and whether opening FCC counts as leaving the game.

### Fixed
- Game profiles switch back when the game closes, even if nothing else gets focus, and when you alt-tab into FCC. A
  switch missed while the keyboard was reconnecting is applied once it's ready. Games whose process can't be opened
  (some anti-cheat) are recognised too.
- Royal Kludge:
  - A known M75 is picked over other devices that share the Sinowealth USB vendor id.
  - On Windows, settings go to the collection that declares them, sized the way it declares them.
  - Boards whose firmware uses RK's newer protocol now say so on connect instead of failing on every change.
- RongYuan: only listed keyboards are picked up, never a RongYuan mouse or receiver.

## 0.2.0

### New keyboards
- **RongYuan RY5088 boards** (MonsGeek FUN60 / FUN68 / M1 V5 HE, Akko and ~280 more): lighting, per-key RGB, keymap,
  actuation, rapid trigger, DKS, mod-tap, toggle, snap tap, macros, live key travel and keyboard settings. The board
  reports its exact model. Untested so far: they open read-only until you choose *Allow changes*.
- **Royal Kludge M75** family (experimental): keymap, lighting, per-key RGB and sleep timer.

### New
- **Report this keyboard** (Settings and the untested-board banner) opens a prefilled GitHub issue with everything
  needed to verify or fix a board.
- First-run intro, with Skip; replay it from Settings.
- Portable build: unzip and run; with `portable.txt` next to the exe, settings stay in an `FCC-data` folder beside it.
- Pages and options follow what each keyboard supports.

### Fixed
- The connect page no longer flashes up again on a cold start (the keyboard was being opened twice).

## 0.1.0

First release: Fighting68 HE and ~135 Sonix-based HE boards. Rapid trigger, live key travel, lighting with live
preview, remapping, advanced keys, macros, profiles, tray, hotkeys, per-game profiles, on-screen popup.
