# Changelog

## Unreleased

### Changed
- **Tidier pages.** *Settings* is now the app's own settings, at the foot of the sidebar: start with Windows, close to
  tray, updates, the settings folder, the intro and Diagnostics. The keyboard's options, model, backup and report moved
  to a **Keyboard** page, and hotkeys, game profiles and the switch popup to **Profile switching** (was *Desktop*).

## 0.3.6

### Fixes
- **AULA / LEOBOG and SteelSeries lighting:** colours on the keys now match the screen. Reds came out pink (and other
  mixed colours looked washed out) because LEDs show a small amount of a colour much brighter than a screen does;
  FCC now corrects for that before sending each frame.

## 0.3.5

### New keyboards
- **AULA F75**, **AULA F87 Pro** and **LEOBOG Hi75C Pro** (experimental, desktop app): lighting effects and per-key RGB,
  like the AULA F99. They share one USB id, so the board's answer to FCC's model check decides which one it is.

### Fixes
- The **AULA F99** was taken for a Royal Kludge keyboard (they share a vendor id) and refused with "newer firmware".
  FCC now looks for these boards before Royal Kludge ones, and the Royal Kludge driver never picks one up.

## 0.3.4

### New keyboards
- **AULA F99** (experimental, desktop app): lighting effects and per-key RGB, drawn by FCC and streamed like the
  SteelSeries boards. Other brands' keyboards share its USB id, so FCC first asks the board which model it is and
  leaves any other model alone.

### New
- **Key test** page: press every key and see it turn green as it registers, with a list of keys not pressed yet. It
  also spots **switch chatter** (a key that fires twice within 30 ms of letting go, the cause of double-typed letters).
  Works with every keyboard, including the ones FCC can't show key travel for.
- **What's new**: after an update, FCC shows that version's changes once. *Desktop → Updates → What's new* opens them
  again.
- **Share codes**: *Share code…* in a profile's menu turns its lighting and its actuation / rapid-trigger settings into
  one line of text; *Paste share code* adds one as a new profile. Codes work across keyboards: effects are matched by
  name, settings by key, and everything stays within the board's own limits. The import says what it left out
  (macros, advanced keys and the keymap are never included).
- **12 new lighting designs**: Sakura, Lava, Lagoon, Toxic, Peach, Gold rush, Monochrome, Galaxy, Checker, Candy
  stripes, and gaming layouts for FPS, MOBA and home-row typing.

### Improved
- Starts a little faster, and the on-screen profile popup no longer loads the whole keyboard list (its start-up code
  went from 1.1 MB to 0.2 MB). Pages load separately, in the background right after start.

## 0.3.3

### New keyboards
- **SteelSeries Apex Pro Gen 3** (experimental, desktop app): lighting effects (static, breathing, spectrum, wave) and
  per-key RGB. These boards have no effects of their own, so FCC draws every frame and streams it, like SteelSeries GG;
  effects run while FCC runs (also from the tray). Actuation, rapid trigger and the OLED screen need a USB capture first.

### Fixed
- The welcome tour, the update prompt and "Which keyboard is this?" open at their intended width again (they were
  squeezed into a narrow column).

### Other
- The app and installer name **shybruh** as publisher (Windows' file details and *Settings → Apps*), with the
  copyright and license.

## 0.3.2

### New
- **Request support for your keyboard**: when a keyboard FCC doesn't support yet is plugged in, the start screen says
  so and offers *Request support* (or press *Keyboard not supported?*). Add the brand and model, and FCC opens a GitHub
  issue with the board's USB id and the description it gives of its own USB interfaces, enough to tell which chip it
  uses. Wireless receivers, mice and plain office keyboards are left out, and any board can be hidden.

### Improved
- **Razer underglow**: the BlackWidow V4 / V4 Pro (left and right underglow, V4 Pro wrist rest), Huntsman Elite and
  Huntsman V2 Analog show their extra lights as strips around the keyboard. Paint them like keys; designs and presets
  include them.
- Razer previews of breathing, spectrum and wave follow each model's own pace (the BlackWidow V3 family runs them
  faster than the Huntsman V2).
- Saved lighting presets remember which kind of keyboard they were made on: on another brand the same effect is picked
  by name, or the colours are shown per key, instead of an unrelated effect with the same number.

### Fixed
- The board report dialog is wide enough again (it was squeezed to a narrow column).

## 0.3.1

### New keyboards
- **Razer keyboards** (experimental, desktop app), 19 models: Huntsman V2 / V2 TKL / V2 Analog / V3 Pro / V3 Pro TKL /
  Mini / Elite / Tournament Edition / original, BlackWidow V3 / V3 TKL / V3 Mini / V3 Pro / V4 / V4 Pro / V4 X / V4 75% /
  V4 TKL / Elite. Lighting effects, per-key RGB, brightness and game mode; polling rate (up to 8000 Hz) and keyswitch
  optimisation on the boards that have them. The Huntsman V2's lighting is confirmed on a real board; the rest are
  untested and open read-only until you choose *Allow changes*. Close Razer Synapse while using FCC.
- Razer previews: breathing, spectrum and wave play at the keyboard's own (slower) pace, and wave is shown in rainbow.

### Fixed
- The lighting preview no longer re-renders endlessly on boards whose effects are previewed through a Fighting68
  effect (RongYuan, MCHOSE, Royal Kludge), which could make the app sluggish.
- Demo mode no longer overwrites your real Fighting68 profiles: demo profiles live in memory only.

### Other
- FCC is now licensed under the GNU GPL v3.0 or later.

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
