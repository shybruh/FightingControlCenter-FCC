# SteelSeries protocol notes

FCC's notes on the lighting protocol of SteelSeries Apex keyboards (listed in [DEVICES.md](DEVICES.md#steelseries)).
The encoder lives in `app/src/hid/steelseries.ts` and the native transport in `app/src-tauri/src/steelseries.rs`. The
packet layout follows what the open-source **OpenRGB** project documents for its SteelSeries Apex driver
(GPL-2.0-or-later), plus notes from the **sanshoku** project on Gen 3 boards; FCC's implementation is its own.

Only lighting is covered. Actuation, rapid trigger, key remapping and the OLED screen have no public documentation and
need a USB capture of SteelSeries GG.

## Transport

| | |
|---|---|
| Vendor id | `0x1038` |
| Interface | 1 on the wired boards (the collection that declares feature report 0 of 642 bytes) |
| Report | feature report 0, 642 bytes after the report id; FCC pads every command to the declared size |
| Answers | none for lighting |

## Packets

| Byte 0 | Meaning |
|---|---|
| `0x4b` | Gen 3: start a lighting session. Sent once before the first frame; harmless where it isn't needed |
| `0x40` | Gen 3 / 2023 wired boards: per-key frame |
| `0x3a` | first-generation Apex Pro: per-key frame |
| `0x61` | wireless Gen 3 boards: per-key frame (not used by FCC yet) |
| `0x41` | "onboard lighting": **never sent**. It reboots Gen 3 boards |

A frame is `[packet, n, (key, r, g, b) × n]`, at most 160 keys. `key` is the key's HID keyboard usage (A = `0x04`,
Left Ctrl = `0xe0` …); the Fn key is `0xf0`.

## Effects

Gen 3 boards have no lighting effects in firmware. SteelSeries GG computes every frame on the PC and streams it (about
18 a second), and brightness is applied by scaling the colours. FCC does the same: it renders frames with the same code
as its on-screen preview, about 20 a second for moving effects and once a second for still ones, so the keyboard keeps
showing them. Nothing is stored on the keyboard: when FCC exits, the last frame stays until the board resets.

## Open questions

- OpenRGB sends the full-size Apex Pro Gen 3 (`1038:1640`) the first-generation frame (`0x3a`), although its own notes say
  every OmniPoint 3.0 board takes the Gen 3 packets. FCC defaults to Gen 3 (`0x4b` + `0x40`) and offers
  *Settings → Lighting commands → Original* to try `0x3a`; a real board decides.
