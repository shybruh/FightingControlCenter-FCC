# Changelog

## Unreleased

- **MCHOSE magnetic boards** (ACE 60 / 68 / 75, JET 75, ZERO 75X, MIX 87 …, 28 models): lighting, per-key RGB,
  keymap, actuation, rapid trigger, mod-tap, toggle, macros and settings, with each board's real layout. Untested so far.
- Royal Kludge: a known M75 is picked over other devices that share the Sinowealth USB vendor id.
- Royal Kludge (Windows): settings go to whichever collection of the config interface accepts them.
- **Diagnostics** (connect page → *Not detected? Diagnostics*, or Settings → *Diagnostics*):
  - *Devices*: every HID device and collection the PC sees, the reports each one declares, and whether (and why) FCC
    would use it. *Listen* shows a collection's live input reports. *Copy scan* for sharing.
  - *Log*: a detailed, timestamped log of detection, connecting, reading, writing (every packet) and errors. Copy or save it.
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
