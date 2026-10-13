# Razer protocol notes

FCC's notes on the command protocol of Razer keyboards (19 models, listed in [DEVICES.md](DEVICES.md#razer)). The encoder lives in `app/src/hid/razer.ts`
and the native transport in `app/src-tauri/src/razer.rs`. The packet layout and command bytes follow what the
open-source **OpenRazer** project documents (GPL-2.0-or-later); FCC's implementation is its own. Key positions in the LED
matrix follow **OpenRGB**'s Razer layouts.

## Transport

| | |
|---|---|
| Vendor id | `0x1532` |
| Product ids | per model, see [DEVICES.md](DEVICES.md#razer) (Huntsman V2: `0x026c`) |
| Interface | USB interface 1, 2 or 3 by model (Windows: the collection there that declares feature report 0 of 90 bytes) |
| Reports | HID **feature** report 0, 90 bytes, sent with SET_REPORT and answered with GET_REPORT |
| Timing | wait about 1 ms between a command and reading its answer |

Desktop only: browsers block the keyboard-type collection these commands go to.

## Differences between models

The command set is the same on every supported board (the "extended matrix" family). Per model, FCC records
(`app/src/devices/razer-catalog.json`, built by `tools/catalog/build-razer.js`):

- the USB interface for commands: 1, 2 or 3;
- transaction ids per kind of command: `0x1F` or `0x3F` for effects and brightness, sometimes a different one for
  per-key frames (BlackWidow V3: effects `0x3F`, frames `0x1F`);
- game mode storage: unsaved with id `0x1F` on the Huntsman V2 / V2 TKL, saved with id `0xFF` elsewhere;
- whether per-key frames get an answer (the BlackWidow V4 / V4 Pro / V4 75% don't: FCC sends them without reading one);
- whether the board has the polling-rate command and which rates, and whether it has keyswitch optimisation;
- the LED matrix size (5 x 15 up to 9 x 22) and where each key sits in it.
- lights that aren't keys (underglow, wrist rest). They continue the matrix where the keys end, numbered left to right
  from row 6, as OpenRGB lists them: BlackWidow V4 / V4 Pro: underglow left (9) and right (9) in row 6, then on the
  V4 Pro 5 unconnected LEDs and the wrist rest (20) in row 7; Huntsman Elite / V2 Analog: 66 underglow LEDs in rows
  6-8. FCC shows them as strips around the keys, in segments of a few LEDs each;
- how fast the firmware runs breathing, spectrum and wave, for the preview (the commands carry no speed; the newer
  boards are slower).

## Report layout

| Byte | Field |
|---|---|
| 0 | status: 0x00 in requests; in answers 0x02 ok, 0x01 busy (also fine), 0x03 failed, 0x04 timeout, 0x05 not supported |
| 1 | transaction id (`0x1F` on the Huntsman V2; per model and command, see above) |
| 2–3 | remaining packets (big endian), 0 |
| 4 | protocol type, 0 |
| 5 | argument size |
| 6 | command class |
| 7 | command id |
| 8–87 | arguments |
| 88 | checksum: XOR of bytes 2–87 |
| 89 | 0 |

An answer echoes class and id. On a garbled or busy answer, Razer's software retries up to 5 times, 10 ms apart.

## Commands FCC sends

Storage byte `0x01` = keep across power cycles, LED `0x05` = backlight.

| What | Class / id | Size | Arguments |
|---|---|---|---|
| Effect: off | `0F 02` | 6 | `01 05 00` |
| Effect: static | `0F 02` | 9 | `01 05 01 00 00 01 R G B` |
| Effect: breathing (colour / random) | `0F 02` | 9 / 6 | `01 05 02 01 00 01 R G B` / `01 05 02` |
| Effect: spectrum cycle | `0F 02` | 6 | `01 05 03` |
| Effect: wave | `0F 02` | 6 | `01 05 04 dir 28` (dir 1 or 2, `28` = speed) |
| Effect: reactive | `0F 02` | 9 | `01 05 05 00 speed 01 R G B` (speed 1–4) |
| Effect: starlight (colour / random) | `0F 02` | 9 / 6 | `01 05 07 00 speed 01 R G B` / `01 05 07 00 speed` (speed 1–3) |
| Effect: custom frame | `0F 02` | 12 | `00 00 08` |
| Per-key row | `0F 03` | 0x47 | `00 00 row first last` + 3 bytes per column |
| Brightness | `0F 04` | 3 | `01 05 level` (0–255) |
| Polling rate | `00 40` | 2 | `00 code` (`01` 8000, `02` 4000, `04` 2000, `08` 1000, `10` 500, `20` 250, `40` 125 Hz) |
| Game mode | `03 00` | 3 | `00 08 on` |
| Keyswitch: typing | `02 02` + `02 15` | 4 + 5 | `00 14 00 28 00` + `01 00 14 00 28 00` |
| Keyswitch: gaming | `02 02` + `02 15` | 4 + 5 | (none) + `01` |

Reads on connect: polling rate `00 C0` (answer argument 1 = code), game mode `03 80 00 08` (argument 2), keyswitch
`02 82` (argument 1 is `14` when typing).

Per-key colours: the Huntsman V2 matrix is 6 rows × 22 columns. FCC sends all six rows (columns 0–21) and then the
custom-frame effect. Key positions are in `app/src/devices/razer.ts`.

## Not covered

The lighting effect can't be read back, so FCC keeps lighting in the profile. Key remapping and on-board macros have no
documented command and aren't offered.
