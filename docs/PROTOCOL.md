# Fighting68 HE (VTER) — HID protocol

## Device

| | |
|---|---|
| VID | `0x0C45` (3141, Sonix) |
| PID | `0x8030` (32816) — wired "Fighting68". `0x8051` (32849) is another Fighting68 variant in the driver. |
| Config interface | usagePage `0xFF68`, usage `0x61` |
| Report | output/input report ID `0`, **64 bytes** (usagePage `0xFF68` ⇒ 64; other pages ⇒ 32, wireless dongle) |

## Packet

```
byte 0     0xAA                 magic
byte 1     cmd
byte 2     len                  payload length in this packet (≤ 56)
byte 3..4  offset (u16 LE)      byte offset into the region
byte 5..7  0
byte 8..63 payload (56 bytes)
```

Bulk transfer ("sendReportSuper"): split the region into 56-byte chunks, send chunk 0, **wait for the device to
echo a packet with the same `cmd`**, then send the next chunk. Last chunk carries `len = remainder`.
Reads work the same way: send read cmd with offset/len, the reply carries the data at `[8 .. 8+len)`.
Official timeout: resend after 5 s of silence, give up after 4 tries.

Single-command packets ("sendReportCmd"): `[0xAA, cmd, a0, a1, a2, a3, 0...]` (args start at byte 2).

## Regions

| Region | Read | Write | Size | Notes |
|---|---|---|---|---|
| Device info | `0x10` | — | 24 | `[2..3]` macro capacity (`b2 + (b3&0x7f)<<8`), `[8..9]` firmware version BCD-ish, `[17]` battery %, `[20..21]` switch model |
| Keyboard settings | `0x11` | `0x21` | 32 (16 written) | `[3]` sleep minutes (0–30), `[5]` polling (3=1K, 5=4K, 6=8K), `[8]` top dead zone, `[9]` bottom dead zone, `[11]` stability mode, `[14]` adaptive calibration, `[15]` all-key wake |
| Key map | `0x12` | `0x22` | 512 | 4 bytes × 128 key indices (see bindings) |
| LED | `0x13` | `0x23` | 16 | see LED |
| Per-key color | `0x14` | `0x24` | 512 (504 used) | 4 bytes × 126: `[index, R, G, B]` |
| Macros | `0x15` | `0x25` | 4008 | see Macros. Read stops early when a chunk past offset 400 is all zero |
| Fn layer | `0x16` | `0x26` | 512 | same format as key map. **Not used by fw 1.25** — see below |
| Rapid trigger | `0x17` | `0x27` | 1024 | 8 bytes × 128 keys, see RT |
| DKS | `0x18` | `0x28` | 1024 | 16 bytes × 64 slots, see DKS |

All multi-byte values are little endian.

## Fn layer: not supported (tested 2026-10-09, fw 1.25)

The Fn region accepts writes and reads them back, but the firmware ignores it: with Fn+B overridden to
`[2, 0, 0x1b, 0]` (type "x") and committed, Fn+B still typed "b". The Fn functions (F-row, RESET,
lighting controls) are hard-coded. The official driver never writes this region either (its only writer,
a bulk "write all" routine, is never called). The region was restored to all zeros after the test.

## Commands

| cmd | args | meaning |
|---|---|---|
| `0x00` | `[0,0,0,0]` bulk | sent after write batches (RT, profile apply) — commit/apply |
| `0x0F` | `[0xFF]` | **factory reset all** |
| `0x0F` | `[0x05]` | close key-check / reset key state |
| `0x62` | — | status |
| `0x64` (100) | — | start travel calibration — device streams `0xFB` sensor packets (see below) |
| `0x65` (101) | — | end/save calibration |
| `0x66` / `0x67` | — | **unknown** — sent by an unlabeled toggle next to "Selectable Axles". Not a travel monitor (the driver never displays any travel). Not used by FCC. |
| in `0xFC` | `[2]=4` | device disconnect notice |

## Live sensor stream (calibration mode)

Verified on fw 1.25 (probe, 2026-10-09): after `0x64` the keyboard streams ~3,600 packets/s on the
config interface, round-robin over all 68 keys, until `0x65`. Replies use `0x55` instead of `0xAA` in byte 0.

```
[1]     0xFB
[2]     key index
[3]     status (1 = has calibration)
[4..5]  sensor reading at rest (top)
[6..7]  calibrated bottom reading, bit 15 = flag. Tracks the minimum seen, so it only ever gets deeper
[8..9]  live sensor reading (falls as the key is pressed)
[10..11] live travel, 0.01 mm (0 at rest, ~330 bottomed out, noise ≤ 0.28 mm at rest)
[12]    full travel, 0.1 mm (34 = 3.4 mm)
```

Ending calibration (`0x65`) saves; keys not pressed during the session keep their previous bottom.
No stream exists outside calibration mode (`0x66` only gets an ACK, nothing else).

## Key binding (4 bytes per key index)

| type `b0` | b1 | b2 | b3 | meaning |
|---|---|---|---|---|
| 0 | | | | default (key's native function) |
| 1 | mouse kind (1 button, 3 wheel) | value (btn mask 1 L,2 R,4 M,8 back,16 fwd; wheel 1 up / 255 down) | 0 | mouse |
| 2 | modifier mask (HID: 1 LCtrl, 2 LShift, 4 LAlt, 8 LGui, 16 RCtrl, 32 RShift, 64 RAlt, 128 RGui) | HID usage | 0 | keyboard |
| 3 | usage lo | usage hi | 0 | consumer (media) usage |
| 6 | macro index | mode (0 once, 1 repeat N, 2 until pressed again) | repeat count | macro |
| 8 | DKS slot (dksOffset/16) | 0 | 0 | dynamic keystroke |
| 9 | hold key (HID) | tap key (HID) | hold time / 10 ms | mod-tap (MT) |
| 10 | key (HID) | 0 | 0 | toggle (TGL) |
| 11 | mode (SOCD) | key1 | key2 | SOCD — written to both keys |
| 12 | 0 | key1 | key2 | Rappy Snappy (RS) — written to both keys |

## Rapid trigger (8 bytes per key index)

```
[0]    switch type id (0 = default)
[1]    flags: bit0 full-travel RT ("whole"), bit1 bottom optimisation, bit2 "rampage" mode
[2..3] actuation point, 0.01 mm
[4..5] press (down) RT sensitivity, 0.01 mm  (0 = RT off)
[6..7] release (up) RT sensitivity, 0.01 mm  (0 = RT off)
```

Fighting68 (`0x8030`) limits from the driver: travel 3.3 mm, default actuation 1.2 mm,
sensitivity 0.08–2.40 mm (step 0.10 in the UI), default 0.16 mm. RT is "on" when both sensitivities are non-zero.

## LED (16 bytes)

```
[0]  effect (0 = off, 0x01–0x13 effects, 0x80 = custom per-key)
[1..3] R, G, B
[4]  255
[8]  colourful/rainbow (1) vs single color (0)
[9]  brightness 1–5
[10] speed 1–5
[11] direction 0/1
[14] 0xAA  [15] 0x55
```

Effects: 1 Static, 2 Single On, 3 Single Off, 4 Starry, 5 Snowfall, 6 Floral (no color), 7 Breathing,
8 Spectrum cycle (no color), 9 Fountain, 10 Interchange (dir), 11 Waves (dir), 12 Turning peaks (dir),
13 One-touch, 14 Two birds, 15 Ripples, 16 Endless flow (dir), 17 Layered mountains, 18 Rain (dir),
19 Back and forth, 0x80 Custom.

## Macros (4008 bytes)

```
0..399      100 × u32 absolute address of each macro (0 = unused)
@addr       u16 n = 2 × recordCount, u16 0
            recordCount × [u16 delay ms, u8 keycode, u8 flags]
            flags: bit7 down (else up), bit5 keyboard (else mouse button)
            ⇒ 0xB0 key down, 0x30 key up, 0x90 mouse down, 0x10 mouse up
```

## DKS (16 bytes per slot, slot n at offset 16n; slot 0 unused by official UI)

```
[0..3]   trigger point per stage, 0.1 mm (1–33): press start, bottom, lift from bottom, full release
         official defaults 16, 30, 30, 16
[5],[7],[9],[11]  HID keycodes for the 4 bound keys (modifiers as 0xE0–0xE7)
[12..15] action bitmap per stage; for key m: bit m = tap at this stage,
         bit m+4 = held from this stage until the next (chain for longer holds; last stage can't hold)
```

A slot is "used" when any of bytes 0–3 is non-zero. Binding `[8, slot, 0, 0]` points a key at it.

## Advanced-key values

- SOCD modes: 3 last input wins, 1 key 1 priority, 2 key 2 priority, 4 neutral. Same bytes written to both keys.
- RS / SOCD key1/key2 are the two physical keys' native HID codes.
- MT: `[9, hold HID, tap HID, ms/10]`, 10–1000 ms, default 400.
- Max 40 advanced keys per profile (official UI limit).
- Macro names are host-only; the keyboard stores just the event data.

## Fighting68 key indices

```
Esc 0  1 17 2 18 3 19 4 20 5 21 6 22 7 23 8 24 9 25 0 26 - 27 = 28 Bksp 92 Ins 103
Tab 32 Q 33 W 34 E 35 R 36 T 37 Y 38 U 39 I 40 O 41 P 42 [ 43 ] 44 \ 60 Del 106
Caps 48 A 49 S 50 D 51 F 52 G 53 H 54 J 55 K 56 L 57 ; 58 ' 59 Enter 76 PgUp 105
LShift 64 Z 65 X 66 C 67 V 68 B 69 N 70 M 71 , 72 . 73 / 74 RShift 75 Up 90 PgDn 108
LCtrl 80 Win 81 LAlt 82 Space 83 RAlt 84 Fn 85 RCtrl 87 Left 88 Down 89 Right 91
```

## Profiles

The official driver keeps profiles **host-side** (localStorage). Switching a profile writes
keys `0x22`, LED `0x23`, colors `0x24`, macros `0x25`, RT `0x27`, DKS `0x28`, then `0x00`.
