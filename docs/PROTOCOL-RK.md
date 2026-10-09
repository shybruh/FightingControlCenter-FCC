# Royal Kludge (legacy) protocol notes

FCC's notes on the protocol used by Royal Kludge's older Sinowealth-based boards (the "legacy" RK software). Only the
M75 family is wired up so far. This protocol is unrelated to the Sonix HE protocol in [PROTOCOL.md](PROTOCOL.md); the
two share nothing but the app around them.

The encoder lives in `app/src/hid/rk.ts`. It was written from these notes and checked byte for byte against the
packets produced by existing open-source RK tools (see *Credits*).

## Transport

| | |
|---|---|
| Vendor id | `0x258a` |
| Interface | the *System Control* collection: usage page `0x0001`, usage `0x0080` |
| Reports | HID **feature** reports, report id `0x0a`, 64 data bytes (65 with the id) |
| Direction | write only: the board never answers and can't be read back |

Because nothing can be read, FCC keeps the board's state in the active profile and sends that. *Settings → Write
profile to keyboard* resends everything if the board was changed elsewhere (Fn shortcuts, another app).

Every report below is shown with the report id as byte 0. Byte 1 is the number of reports in the transfer and byte 2
the 1-based index of this one; the first report of a transfer carries a short header before the data.

## Keymap: 9 reports

```
[0x0a, 0x09, n, ...data]          n = 1..9
first report only: [0x0a, 0x09, 0x01, 0x01, 0xf8, ...data]
```

The data bytes of all nine reports, concatenated, form one array of **4-byte slots**, one per key position. Slot order
comes from RK's per-model layout files (`tools/catalog/build-rk.js` turns them into `app/src/devices/rk-catalog.json`).
Each slot is a big-endian 32-bit code:

| Binding | Code |
|---|---|
| Key (+ modifiers) | `(mods << 16) \| (hid << 8)` |
| Modifier on its own | `(1 << (hid - 0xe0)) << 16` |
| Media / consumer | `0x01000000 \| usage` |
| Fn | `0x0000b000` |
| Unused slot | `0` |

`mods` uses the usual HID bit order: L-Ctrl, L-Shift, L-Alt, L-Win, R-Ctrl, R-Shift, R-Alt, R-Win.

## Lighting: 1 report

```
[0x0a, 0x01, 0x01, 0x02, 0x29, mode, 0x00, speed, brightness, r, g, b, random, sleep]
```

| Field | Values |
|---|---|
| mode | lighting mode index from the model's layout file (M75: 19 modes, default 10) |
| speed | 1–5 |
| brightness | 0–5 (0 is how FCC turns the lights off, keeping the mode) |
| r, g, b | colour for modes that take one |
| random | 1 = random / rainbow colours (r, g, b are sent as 0) |
| sleep | 1 = 5 min, 2 = 10 min, 3 = 20 min, 4 = 30 min, 5 = never |

## Per-key colours: 7 reports

```
[0x0a, 0x07, n, ...data]          n = 1..7
first report only: [0x0a, 0x07, 0x01, 0x03, 0x7e, 0x01, ...data]
```

The data is one array of 3-byte `r, g, b` entries in slot order (same slots as the keymap). The colours only show in
the per-key mode, so FCC sends them when that mode is switched on and when they change while it is on.

## Open questions (need someone with the board)

- The per-key mode index: the layout file calls mode 2 "Customize"; confirm it shows the per-key colours.
- Whether the Fn layer can be written the same way (FCC doesn't try).
- Wireless (2.4 GHz / Bluetooth): not supported; use the cable.

## Credits

The packet layout was learned by reading the open-source RK tools **Rangoli** and **Kludge Knight**, and the per-model
key layouts come from the layout files Royal Kludge ships with its own software. No code from those projects is
included in FCC.
