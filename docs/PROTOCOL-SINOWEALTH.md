# Sinowealth "010c" protocol notes

FCC's notes on the lighting protocol of keyboards with USB id `258a:010c` (listed in [DEVICES.md](DEVICES.md#sinowealth)).
The encoder lives in `app/src/hid/sinowealth.ts`, the shared frame streaming in `app/src/hid/streamed.ts` and the
native transport in `app/src-tauri/src/sinowealth.rs`. The packets follow what the open-source **OpenRGB** project
documents in its Sinowealth 010c driver (GPL-2.0-or-later); FCC's implementation is its own.

Only lighting is covered. Key remapping, macros and the keyboard's own effects need a USB capture of the maker's software.

## Why the model check matters

`258a` is Sinowealth's vendor id and `010c` is shared by boards from several brands (AULA, LEOBOG, Redragon …).
OpenRGB disabled two other Sinowealth keyboard drivers after commands meant for one board **bricked Redragon keyboards**
with reused ids. So FCC asks every `010c` board which model it is before anything else, and only drives models it
lists. Any other answer is refused with a message, and nothing more is sent.

## Transport

| | |
|---|---|
| Vendor / product | `0x258a` / `0x010c` |
| Interface | 1 |
| Collection | vendor page `0xff00`, usage `0x01`; the board has two such collections, FCC uses the one that declares report `0x06` |
| Report | feature report `0x06`, 519 bytes after the id (520 in all) |

## Packets

| Packet | Bytes |
|---|---|
| Model request | send `06 82 01 00 01 00 06`, then read feature report `0x06`: byte 13 (counting the id as byte 0) is the model id |
| Frame | `06 08 00 00 01 00 7a 01`, then 3 bytes (r, g, b) per LED index from byte 8 |

The board leaves streamed lighting about a second after the last frame, so FCC sends a still picture again twice a
second and moving effects about 20 times a second. There's no "off" command: off is an all-black frame.

## Models

| Model id | Board | LED index |
|---|---|---|
| `0xa4` | AULA F99 (96%) | column × 6 + row on the board's grid (Esc 0, W 14, numpad Enter 112) |
| `0xcd` | AULA F75 (75%) | same scheme (F1 12, Del 85, Right 89) |
| `0x0b` | AULA F87 Pro (TKL) | same scheme (Print Screen 84, Right 101) |
| `0xa3` | LEOBOG Hi75C Pro (75%) | same scheme (Del 85, PgDn 88) |

The board's answer to the model request picks the model; a choice made by hand never overrides it.

OpenRGB also lists the Redragon K686 Eisa Pro (`0x20`, `0x05`). FCC leaves it out for now: its table mixes ANSI and ISO
keys in a way that doesn't map to one clear layout, and Redragon is the brand earlier bricks hit. Adding it is a layout
plus its model ids in `app/src/devices/sinowealth.ts` once someone with the board can confirm the keys.
