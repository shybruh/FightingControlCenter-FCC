# Supported keyboards

FCC talks to keyboards that use the Sonix-based HE firmware behind the VTER / driveall.cn web driver. The list below is extracted from that driver (see `app/src/devices/catalog.json`).

It also supports some Royal Kludge boards over RK's own protocol; see [Royal Kludge](#royal-kludge) at the end.

## Verified (1)

Tested end to end on real hardware.

| Model | USB id | Travel | Rapid trigger |
|---|---|---|---|
| Fighting68 | `0c45:8030` | 3.30 mm | 0.08–2.40 mm |

## Untested (135)

Wired boards that speak the same protocol. FCC detects them, reads and backs up their settings, and opens them **read-only** until you choose *Allow changes*. If yours works (or doesn't), send a report from the app (*Settings → Report this keyboard*) so it can be marked verified.

| Model | USB id | Travel | Rapid trigger |
|---|---|---|---|
| 61KEY-CZ Gaming keyboard | `0c45:8097` | 3.30 mm | 0.02–3.30 mm |
| 61KEY-CZ Gaming keyboard | `0c45:8098` | 3.80 mm | 0.08–3.80 mm |
| 8K Gaming Keyboard | `0c45:8032` | 3.40 mm | 0.04–2.40 mm |
| A80 PRO | `0c45:8039` | 3.40 mm | 0.01–2.40 mm |
| A80RT | `0c45:80a2` | 3.30 mm | 0.01–3.30 mm |
| A80RT U | `0c45:80a1` | 3.30 mm | 0.01–3.30 mm |
| AJAZZ AK680 MAX | `0c45:80b2` | 3.40 mm | 0.01–3.40 mm |
| AK820MAX | `0c45:8033` | 3.30 mm | 0.01–3.30 mm |
| AK820MAX | `0c45:8044` | 3.30 mm | 0.01–3.30 mm |
| AK820MAX | `0c45:8070` | 4.00 mm | 0.08–4.00 mm |
| AK820MAX | `0c45:809b` | 3.30 mm | 0.01–3.30 mm |
| AK820MAX | `0c45:80a0` | 3.30 mm | 0.01–3.30 mm |
| AK820MAX | `0c45:80a5` | 3.30 mm | 0.01–3.30 mm |
| AK820MAX | `0c45:80b1` | 3.40 mm | 0.08–3.40 mm |
| AK980 | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| AK980 MAX | `0c45:8043` | 3.30 mm | 0.01–3.30 mm |
| AKS068 | `0c45:8033` | 3.40 mm | 0.01–2.40 mm |
| AMG65 Dongle | `05ac:024f` | 3.40 mm | 0.01–3.40 mm |
| Ato87 | `0c45:8030` | 3.40 mm | 0.08–2.40 mm |
| Ato87 | `0c45:8051` | 3.30 mm | 0.02–2.40 mm |
| AULA F65 | `0c45:8032` | 3.40 mm | 0.04–2.40 mm |
| AULA F65M | `0c45:8031` | 3.40 mm | 0.02–2.40 mm |
| Battle68Pro | `0c45:8036` | 3.30 mm | 0.02–2.40 mm |
| CIDOO C60 | `0c45:8092` | 3.60 mm | 0.02–2.40 mm |
| cz-206 | `0c45:808c` | 3.60 mm | 0.02–2.40 mm |
| Epomaker HE80 | `0c45:8092` | 3.30 mm | 0.02–3.30 mm |
| ES75-MAG | `05ac:024f` | 3.90 mm | 0.08–2.40 mm |
| ES75T | `0c45:8030` | 3.30 mm | 0.01–2.40 mm |
| ET-7531 | `0c45:80a6` | 3.40 mm | 0.02–3.40 mm |
| EWEADN BAT61 | `0c45:8035` | 3.30 mm | 0.08–3.30 mm |
| EWEADN BAT61 | `0c45:8036` | 3.30 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:8035` | 3.30 mm | 0.08–2.40 mm |
| EWEADN BAT68 | `0c45:8036` | 3.30 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:8037` | 3.30 mm | 0.04–2.40 mm |
| EWEADN BAT68 | `0c45:806a` | 3.40 mm | 0.08–2.40 mm |
| EWEADN BAT68 | `0c45:806b` | 3.60 mm | 0.08–2.40 mm |
| EWEADN BAT68 | `0c45:8071` | 3.30 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:807e` | 3.20 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:809c` | 3.50 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:809d` | 3.40 mm | 0.02–2.40 mm |
| EWEADN BAT68 | `0c45:809e` | 3.50 mm | 0.08–3.30 mm |
| Fighting68 | `0c45:8051` | 3.40 mm | 0.02–2.40 mm |
| Fighting98 | `0c45:8030` | 3.30 mm | 0.08–2.40 mm |
| FirstBlood B67 | `0c45:8090` | 3.40 mm | 0.02–2.40 mm |
| FK680 | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| Gaming keyboard | `0c45:80ac` | 4.00 mm | 0.01–4.00 mm |
| Gaming Keyboard | `0c45:8030` | 3.30 mm | 0.04–2.40 mm |
| Gaming Keyboard | `0c45:8057` | 3.70 mm | 0.10–2.40 mm |
| Gaming Keyboard | `0c45:80ad` | 4.00 mm | 0.08–4.00 mm |
| Gaming Keyboard | `0c45:80ae` | 4.00 mm | 0.08–4.00 mm |
| Gaming Keyboard | `0c45:80b0` | 3.30 mm | 0.01–3.30 mm |
| Gaming Keyboard | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| GamingKeyboard | `0c45:807d` | 3.30 mm | 0.01–2.40 mm |
| GK65 | `0c45:8800` | 4.00 mm | 0.01–2.40 mm |
| GK68 | `0c45:8053` | 3.40 mm | 0.04–2.40 mm |
| GK6902GW-PRO | `0c45:806f` | 3.50 mm | 0.01–2.40 mm |
| GK8622GW | `0c45:806f` | 3.50 mm | 0.01–3.50 mm |
| GS3068C | `0c45:8096` | 3.30 mm | 0.04–2.40 mm |
| GT60He | `0c45:8061` | 3.30 mm | 0.01–3.30 mm |
| hfd | `0c45:8030` | 3.30 mm | 0.01–2.40 mm |
| HK8301G | `0c45:8085` | 4.00 mm | 0.08–2.40 mm |
| IROK ND63 | `0c45:806f` | 4.00 mm | 0.01–2.40 mm |
| IYX MU68 ULTRA | `0c45:806f` | 3.40 mm | 0.01–3.40 mm |
| IYX Polar 75 | `0c45:8800` | 3.50 mm | 0.01–3.50 mm |
| Jeet65 | `0c45:8051` | 3.30 mm | 0.02–2.40 mm |
| Jeet65 | `0c45:8052` | 3.30 mm | 0.01–2.40 mm |
| Jeet68 | `0c45:8051` | 3.30 mm | 0.02–2.40 mm |
| Jeet75 | `0c45:8051` | 3.40 mm | 0.02–2.40 mm |
| Jet75 | `0c45:80a4` | 3.50 mm | 0.01–3.50 mm |
| K202S-C | `0c45:80a9` | 3.40 mm | 0.08–3.40 mm |
| K75 | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| K84 | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| K980 | `0c45:8800` | 4.00 mm | 0.10–2.40 mm |
| KB-820C | `0c45:8034` | 3.40 mm | 0.01–3.40 mm |
| KG964 | `0c45:806a` | 3.30 mm | 0.08–3.30 mm |
| KX68HE | `0c45:808e` | 3.40 mm | 0.04–2.40 mm |
| looting60 pro | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| Looting63 | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| looting66 pro | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| looting68 pro | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| looting75 pro | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| Lukit63 | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| Luminor 68 | `0c45:80a3` | 3.40 mm | 0.01–3.40 mm |
| M68HE Keyboard | `0c45:8030` | 3.30 mm | 0.04–2.40 mm |
| M68HE Keyboard | `0c45:8040` | 3.40 mm | 0.08–2.40 mm |
| M68HE Keyboard | `0c45:8041` | 3.30 mm | 0.02–2.40 mm |
| M68HE Keyboard | `0c45:8055` | 3.40 mm | 0.02–2.40 mm |
| M68HE Keyboard | `0c45:8065` | 3.30 mm | 0.04–2.40 mm |
| MC68 | `0c45:8077` | 3.40 mm | 0.04–3.40 mm |
| MC68 | `0c45:8078` | 3.40 mm | 0.02–3.40 mm |
| MC68 | `0c45:8079` | 3.40 mm | 0.01–3.40 mm |
| MC68 | `0c45:8089` | 3.40 mm | 0.02–3.40 mm |
| MC68 | `0c45:8094` | 3.40 mm | 0.01–3.40 mm |
| MC68 | `0c45:8095` | 3.40 mm | 0.04–3.40 mm |
| MC68 | `0c45:80a7` | 3.40 mm | 0.02–3.40 mm |
| MC68 | `0c45:80a8` | 3.40 mm | 0.01–3.40 mm |
| MC68 | `0c45:80aa` | 3.40 mm | 0.04–3.40 mm |
| MC68 | `0c45:80ab` | 3.40 mm | 0.04–3.40 mm |
| MCHOSE H75 | `0c45:80a4` | 3.50 mm | 0.01–3.50 mm |
| MINI 60 HE | `0c45:8032` | 3.40 mm | 0.01–3.40 mm |
| MINI 60 HE PRO | `0c45:80a2` | 3.40 mm | 0.01–3.40 mm |
| MINI60HE MAX | `0c45:80a1` | 3.40 mm | 0.01–3.40 mm |
| MK75Keyboard | `0c45:8093` | 3.40 mm | 0.08–2.40 mm |
| NK84 RT | `0c45:8800` | 4.00 mm | 0.10–4.00 mm |
| Onikua keyboard G67 | `0c45:8043` | 3.50 mm | 0.02–3.50 mm |
| QS87 | `0c45:8044` | 3.30 mm | 0.01–3.30 mm |
| QSENN DT35 104 | `0c45:8081` | 4.00 mm | 0.10–2.40 mm |
| QSENN Q75 8K | `0c45:80ad` | 4.00 mm | 0.10–4.00 mm |
| QSENN Q99 8K | `0c45:80ad` | 4.00 mm | 0.10–4.00 mm |
| red star 980 | `0c45:8063` | 3.60 mm | 0.02–2.40 mm |
| RK631 | `0c45:8049` | 3.30 mm | 0.02–2.40 mm |
| RK739 | `0c45:8048` | 3.50 mm | 0.02–2.40 mm |
| RK773 | `0c45:8046` | 3.70 mm | 0.08–2.40 mm |
| SG2810 | `0c45:8031` | 3.40 mm | 0.02–2.40 mm |
| SG8957 | `0c45:8043` | 3.40 mm | 0.02–3.40 mm |
| SI-2699C | `0c45:8031` | 3.30 mm | 0.02–2.40 mm |
| SI-2810 | `0c45:8031` | 3.30 mm | 0.02–2.40 mm |
| SI-2810C | `0c45:8039` | 3.40 mm | 0.01–2.40 mm |
| Smart875e HE | `0c45:8036` | 3.30 mm | 0.02–2.40 mm |
| STAR75-MAG | `0c45:809f` | 3.30 mm | 0.01–2.40 mm |
| STING68 LITE | `0c45:8030` | 3.30 mm | 0.08–2.40 mm |
| STING68 LITE | `0c45:8031` | 3.30 mm | 0.08–2.40 mm |
| STING87 | `0c45:8051` | 3.30 mm | 0.02–2.40 mm |
| Sunny75 | `0c45:8063` | 3.40 mm | 0.01–2.40 mm |
| Sunny80 HE | `0c45:8063` | 3.30 mm | 0.01–2.40 mm |
| Tank68 HE | `0c45:8036` | 3.30 mm | 0.02–2.40 mm |
| Tank68 HE | `0c45:8045` | 3.30 mm | 0.01–2.40 mm |
| Tank68 HE | `0c45:807f` | 3.30 mm | 0.02–2.40 mm |
| TH068 Keyboard | `0c45:809a` | 4.00 mm | 0.01–2.40 mm |
| TK200 | `0c45:80a4` | 3.40 mm | 0.01–3.40 mm |
| USB Keyboard | `0c45:80a3` | 3.40 mm | 0.01–3.40 mm |
| VARO VM87HE | `0c45:8092` | 3.50 mm | 0.02–2.40 mm |
| Vooting30 | `0c45:8051` | 3.40 mm | 0.02–2.40 mm |
| YYX64K | `0c45:807d` | 3.30 mm | 0.01–3.30 mm |
| ZAP68 | `0c45:8075` | 3.30 mm | 0.01–3.30 mm |

## Not supported yet (12)

Wireless dongles use a different (32-byte) packet format, and a few boards have no known config interface. Connect wireless boards with their USB cable instead.

| Model | USB id | Travel | Rapid trigger |
|---|---|---|---|
| 2.4G Dongle | `0c45:fefe` | 4.00 mm | 0.08–4.00 mm |
| A80RT U Dongle | `0c45:fefc` | 3.30 mm | 0.01–3.30 mm |
| AJAZZ AK820MAX | `0c45:fefc` | 3.30 mm | 0.01–3.30 mm |
| AJAZZ AK820MAX | `0c45:fefd` | 3.30 mm | 0.01–3.30 mm |
| AJAZZ AK820MAX | `0c45:fefe` | 3.30 mm | 0.01–3.30 mm |
| EWEADN BAT68 | `0c45:8080` | 3.30 mm | 0.02–2.40 mm |
| KT84 RGB | `0c45:8009` | 3.40 mm | 0.01–2.40 mm |
| LEOBOG AMG65 | `0c45:800a` | 3.40 mm | 0.01–3.40 mm |
| MINI 60 HE Dongle | `0c45:fefe` | 3.40 mm | 0.01–3.40 mm |
| MINI 60 HE PRO Dongle | `0c45:fefe` | 3.40 mm | 0.01–3.40 mm |
| MINI60HE MAX Dongle | `0c45:fefc` | 3.40 mm | 0.01–3.40 mm |
| X85 | `0c45:8006` | 4.00 mm | 0.08–4.00 mm |

Several models share a USB id; FCC tells them apart by the USB product name and asks when it can't. You can always change the model in Settings → Device.

## Royal Kludge

Older Royal Kludge boards (Sinowealth, the "legacy" RK software) use a different, write-only protocol, documented in
[PROTOCOL-RK.md](PROTOCOL-RK.md). FCC supports keymap, lighting modes, per-key RGB and the sleep timer on them. They
open **read-only** until you choose *Allow changes*, and since they can't be read back, FCC shows your saved profile.
Generated from RK's layout files by `tools/catalog/build-rk.js` (`app/src/devices/rk-catalog.json`).

| Model | USB id | Keys |
|---|---|---|
| RK M75 | `258a:0147` | 81 |
| RK M75 RGB (new layout) | `258a:0163` | 81 |
| RK M75 ISO | `258a:0175` | 82 |
| RK M75N ISO | `258a:01ac` | 82 |

## RongYuan RY5088 (MonsGeek, Akko …)

Hall-effect boards on RongYuan's RY5088 firmware, the ones MonsGeek's web driver configures. They speak a different
protocol ([PROTOCOL-RY.md](PROTOCOL-RY.md)); FCC supports lighting, per-key RGB, keymap, actuation, rapid trigger,
DKS, mod-tap, toggle, snap tap, macros, live key travel and the keyboard settings. All are **untested** so far and open
read-only until you choose *Allow changes*.

The keyboard reports its model id, so FCC knows the exact model even when several share a USB id. The list is generated
from the web driver by `tools/catalog/build-ry.js` (`app/src/devices/ry-catalog.json`); key positions come from each
layout's key order with standard key widths.

| Model | USB id | Model id |
|---|---|---|
| 5075B V2 HE (akko) | `3151:502f` | 2807 |
| 5075S HE (akko) | `3151:502d` | 3129 |
| 5087S V2 HE (akko) | `3151:5029` | 3131 |
| AGK75 U2 (蚂蚁电竞) | `3151:502f` | 2281 |
| AGK75 U2 (蚂蚁电竞) | `3151:502f` | 3064 |
| AK680 MAX (AJAZZMOUSE) | `3151:502d` | 2255 |
| AK680 MAX (AJAZZMOUSE) | `3151:502f` | 2336 |
| AK680 MAX (AJAZZMOUSE) | `3151:502f` | 2343 |
| AK680 MAX (AJAZZMOUSE) | `3151:502f` | 2371 |
| AK680MC (AJAZZMOUSE) | `3151:5030` | 2605 |
| AK680MC (AJAZZMOUSE) | `3151:5029` | 2608 |
| AK680MC (AJAZZMOUSE) | `3151:5030` | 2609 |
| ALUX68 AIR (AJAZZMOUSE) | `3151:5030` | 3025 |
| ALUX68 PRO (AJAZZMOUSE) | `3151:5030` | 2592 |
| ALUX68 PRO (AJAZZMOUSE) | `3151:5030` | 2593 |
| ALUX68 PRO (AJAZZMOUSE) | `3151:5030` | 2599 |
| B75 (蝴蝶) | `3151:502d` | 2928 |
| B87 (蝴蝶) | `3151:5029` | 3096 |
| B98 (蝴蝶) | `3151:5030` | 3040 |
| Beat65-keyboard (XinMengK65Keyboard) | `3151:502d` | 2326 |
| Beat65-keyboard (XinMengK65Keyboard) | `3151:502f` | 2436 |
| Beat65-keyboard (XinMengK65Keyboard) | `3151:502d` | 2535 |
| Beat68-keyboard (XinMengK65Keyboard) | `3151:502d` | 2589 |
| Beat68-keyboard (XinMengK65Keyboard) | `3151:502f` | 2590 |
| Beat68-keyboard (XinMengK65Keyboard) | `3151:5030` | 2671 |
| Beat68-keyboard (XinMengK65Keyboard) | `3151:502f` | 2680 |
| Beat75 (AttackShark) | `3151:5030` | 2633 |
| Beat75 (XinMengK65Keyboard) | `3151:5030` | 2770 |
| Beat75 (XinMengK65Keyboard) | `3151:502d` | 2797 |
| Beat75 | `3151:5030` | 2976 |
| Blend HE (腹灵) | `3151:5029` | 2699 |
| CAPTAIN87 (MageGee) | `3151:5030` | 2789 |
| Chronos 68 (Syntech) | `3151:502d` | 2446 |
| CX68-2 | `3151:5029` | 3087 |
| Cybrix29 (KiiBoom) | `3151:5029` | 2886 |
| Deep68 (EWEADNV) | `3151:5029` | 2955 |
| DEEP68 (EWEADNV) | `3151:5025` | 2578 |
| DEEP68 (EWEADNV) | `3151:5030` | 2710 |
| DEEP68 (EWEADNV) | `3151:5029` | 2711 |
| DEEP80 (EWEADNV) | `3151:5030` | 2574 |
| DEEP80 (EWEADNV) | `3151:5030` | 2652 |
| DEEP80 (EWEADNV) | `3151:5029` | 2653 |
| DEEP80 (EWEADNV) | `3151:502d` | 2906 |
| DEFENDER 68 (PIIFOXDRIVER) | `3151:502d` | 2499 |
| Defender 75 (PIIFOXDRIVER) | `3151:5029` | 3089 |
| DK82 HE | `3151:502f` | 2690 |
| EK368RT (EDRA) | `3151:5030` | 2835 |
| Epomaker 65 | `3151:502d` | 2870 |
| F68 (FREEWOLF) | `3151:5030` | 2634 |
| F68 PRO (FREEWOLF) | `3151:5030` | 2594 |
| Fib(68) (DARKFORCE) | `3151:5030` | 3055 |
| FK51D2 | `3151:5029` | 2991 |
| FK51D2 | `3151:5030` | 3002 |
| FK51H0-B | `3151:5029` | 3063 |
| FUN60 (MonsGeek) | `3151:502e` | 2299 |
| FUN60 MAX (MonsGeek) | `3151:5030` | 2306 |
| FUN60 MAX (MonsGeek) | `3151:5030` | 3299 |
| FUN60 MAX (MonsGeek) | `3151:5030` | 3906 |
| FUN60 PRO (MonsGeek) | `3151:502d` | 2304 |
| FUN60 PRO (MonsGeek) | `3151:502f` | 2305 |
| FUN60 PRO (MonsGeek) | `3151:502d` | 2464 |
| FUN60 PRO (MonsGeek) | `3151:5029` | 2600 |
| FUN60 PRO (MonsGeek) | `3151:5030` | 2785 |
| FUN60 PRO (MonsGeek) | `39ab:9016` | 4294 |
| FUN60 PRO ISO (MonsGeek) | `3151:5030` | 3722 |
| FUN60 Pro JP (MonsGeek) | `39ab:9016` | 4180 |
| FUN60 Ultra (MonsGeek) | `3151:5030` | 2307 |
| FUN60 Ultra (MonsGeek) | `3151:5029` | 2352 |
| FUN60 Ultra (MonsGeek) | `3151:502d` | 2381 |
| FUN60 Ultra (MonsGeek) | `3151:5030` | 2387 |
| FUN60 Ultra TMR (MonsGeek) | `38ee:0001` | 3853 |
| FUN68 (MonsGeek) | `3151:5030` | 2811 |
| FUN68 (MonsGeek) | `3151:5029` | 3091 |
| FUN68 ISO (MonsGeek) | `38ee:0009` | 3429 |
| FUN75 (MonsGeek) | `3151:502d` | 2648 |
| FUN87 HE (MonsGeek) | `38ee:0001` | 4088 |
| G84 HE (EPOMAKER) | `3151:5030` | 2642 |
| G84 HE (EPOMAKER) | `3151:5030` | 2959 |
| Gaming Keyboard | `3151:5030` | 2611 |
| Gaming Keyboard (MageGee) | `3151:5030` | 2677 |
| Gaming Keyboard (MageGee) | `3151:5030` | 2775 |
| Gaming Keyboard (YUNZII) | `3151:5029` | 2834 |
| Gaming Keyboard (MageGee) | `3151:5029` | 2848 |
| Gaming Keyboard (MageGee) | `3151:5030` | 2887 |
| Gaming Keyboard | `3151:502f` | 2892 |
| Gaming Keyboard | `3151:5029` | 2899 |
| Gaming Keyboard | `3151:5029` | 2996 |
| Gaming Keyboard | `3151:5029` | 2998 |
| Gaming Keyboard (MageGee) | `3151:5030` | 3054 |
| Gaming Keyboard | `3151:5030` | 3066 |
| Gaming Keyboard | `3151:5029` | 3067 |
| Gem02 (akko) | `3151:5030` | 2619 |
| GEO65HE (Hator) | `379a:1803` | 2791 |
| GK06-61 | `3151:5030` | 2618 |
| GK61 (Skyloong) | `3151:5029` | 2674 |
| GK61 (Skyloong) | `3151:5030` | 2999 |
| GK68 (Skyloong) | `3151:5029` | 2681 |
| GK68 (Skyloong) | `3151:5030` | 2967 |
| GK75 (Skyloong) | `3151:502d` | 2450 |
| GK75 (Skyloong) | `3151:502d` | 2507 |
| GK75 | `3151:5029` | 3075 |
| GKX68 (GKX68MAGNUM) | `3151:5030` | 2628 |
| GM870Pro | `3151:5029` | 2981 |
| GMK-82 (GTUNE) | `3151:5029` | 2912 |
| GP75HE (腹灵) | `3151:5030` | 2669 |
| GP87HE (DNS) | `3151:5029` | 2957 |
| GT60 | `3151:5029` | 2773 |
| H60 (SPYSELF) | `3151:5029` | 2866 |
| H60 (咪星人H60) | `3151:5029` | 3032 |
| H60 (咪星人H60) | `3151:5029` | 3033 |
| H60HE (IDJ) | `3151:5029` | 3078 |
| H60HE (IDJ) | `3151:5029` | 3079 |
| H60Pro (BOYIH60) | `3151:5029` | 2764 |
| H60Pro (BOYIH60) | `3151:5029` | 2875 |
| Hammerwolf | `3151:5029` | 3088 |
| HE68 Llte (EPOMAKER) | `3151:5030` | 2761 |
| HE68 Llte (EPOMAKER) | `3151:5029` | 2762 |
| HE68 Llte (EPOMAKER) | `3151:5029` | 2883 |
| HE75 Mag (EPOMAKER) | `3151:502f` | 2520 |
| HTK1860 (Hator) | `379a:1803` | 2918 |
| HTK1860UA (Hator) | `379a:1803` | 2917 |
| HTK1880 (Hator) | `379a:1803` | 2856 |
| HTK1880UA (Hator) | `379a:1803` | 2853 |
| HTK3860 (Hator) | `379a:1803` | 2919 |
| HTK3860EU (Hator) | `379a:1803` | 2920 |
| HTK3860UA (Hator) | `379a:1803` | 2876 |
| HTK3880 (Hator) | `379a:1803` | 2857 |
| HTK3880EU (Hator) | `379a:1803` | 2858 |
| HTK3880UA (Hator) | `379a:1803` | 2800 |
| IROK ND_63 | `3151:502d` | 3115 |
| JK82-1 (SUNROSE) | `3151:5030` | 2916 |
| K-68M (MICROPACK) | `3151:502d` | 2546 |
| K0039 (akko) | `3151:5030` | 2881 |
| K239 UK (腹灵) | `3151:5029` | 2708 |
| K2405 (Hator) | `379a:1803` | 2806 |
| K268 (腹灵) | `3151:5029` | 2664 |
| K5 (cherry) | `046a:0141` | 2626 |
| K67 | `3151:5029` | 2723 |
| K68 (EWEADNV) | `3151:502d` | 2301 |
| K85 (AttackShark) | `3151:502d` | 2552 |
| K85PROHE (AttackShark) | `3151:5030` | 2978 |
| K980 (XinMengK65Keyboard) | `3151:5030` | 2795 |
| K982D (XinMengK65Keyboard) | `3151:5030` | 2731 |
| KA67 (JINGSU) | `3151:5030` | 3106 |
| KC68 (凯酷) | `3151:5029` | 2344 |
| KF068 | `3151:5029` | 2278 |
| KF068 | `3151:5029` | 2338 |
| KIIBOOM-68C (EPOMAKER) | `3151:502d` | 2586 |
| KM9 (Acrox) | `3151:5030` | 2893 |
| LK75 (gamakay2) | `3151:5030` | 2709 |
| LK75 (gamakay2) | `3151:5030` | 2808 |
| Lomz 75S | `3151:5029` | 2737 |
| Lomz 75S (LOMZHUBWEB) | `3151:502d` | 2828 |
| M1 V5 HE (MonsGeek) | `3151:5030` | 2819 |
| M1 V5 TMR (MonsGeek) | `3151:5030` | 2247 |
| M1 V5 TMR (MonsGeek) | `3151:5030` | 2536 |
| M1 V5 TMR (MonsGeek) | `3151:5030` | 2679 |
| M1 V5 TMR (MonsGeek) | `3151:5030` | 2949 |
| M1 V5 TMR (MonsGeek) | `38ee:0040` | 4212 |
| M1 V5 TMR ISO (MonsGeek) | `38ee:0001` | 4158 |
| M1 V5 TMR ISO (MonsGeek) | `38ee:0040` | 4211 |
| M2 V5 (MonsGeek) | `3151:5030` | 2601 |
| M2 V5 HE (MonsGeek) | `3151:5030` | 2845 |
| M3 V5 (MonsGeek) | `3151:5030` | 2585 |
| M3 V5 HE (MonsGeek) | `3151:5030` | 2874 |
| M82HE (Mambasnake) | `3151:502d` | 2335 |
| MAG-68 HE | `3151:5029` | 3017 |
| MAG75 Max (VKMS) | `3151:5030` | 2398 |
| Mage x ZM | `3151:5029` | 2969 |
| MATATAKI (US) (AIM1Keys) | `3151:5029` | 2939 |
| Mineral01 (akko) | `3151:5030` | 2903 |
| Mineral02 (akko) | `3151:5030` | 2581 |
| Mineral02 (akko) | `3151:5030` | 2885 |
| MK-23 | `3151:5030` | 2766 |
| MK129 | `3151:5029` | 2763 |
| MK160B MAX (Gamepro) | `3151:502d` | 2930 |
| MK25020 (MageGee) | `3151:5030` | 2740 |
| MK25022 (MageGee) | `3151:5030` | 2712 |
| MK870 HE (腹灵) | `3151:5030` | 2703 |
| MOD007 V5 HE (akko) | `3151:5030` | 2453 |
| MOD007 V5 HE (akko) | `3151:502f` | 2839 |
| MOD007S V3-HE (akko) | `3151:5030` | 2683 |
| MOD007S V3-HE UK (akko) | `3151:5030` | 2704 |
| MX8.2 (cherry) | `046a:012d` | 2494 |
| N-J100 (sunsonny) | `3151:502d` | 2780 |
| NB68 (VKMS) | `374a:a228` | 2560 |
| NB68 Max (VKMS) | `374a:a236` | 2757 |
| NB68 Max (VKMS) | `374a:a236` | 3111 |
| Neon75 (VGNNEON) | `3151:502f` | 2781 |
| Neon75 (VGNNEON) | `3151:502f` | 2859 |
| Neon75 (VGNNEON) | `3151:502d` | 2904 |
| Neon75 (VGNNEON) | `3151:502f` | 2905 |
| NJ81-CP (Keydous) | `3151:5030` | 2454 |
| NJ98-CP (Keydous) | `3151:502f` | 2576 |
| NS67 (AJAZZMOUSE) | `3151:502d` | 2810 |
| NS67 PRO (AJAZZMOUSE) | `3151:502f` | 2746 |
| NS68 (gamakay2) | `3151:502d` | 2572 |
| NS68 (gamakay2) | `3151:502f` | 2638 |
| NS87 (AJAZZMOUSE) | `3151:5030` | 3065 |
| NS87 (AJAZZMOUSE) | `3151:5030` | 3112 |
| NX108 (ABKO) | `3151:5030` | 2973 |
| NX108 (腹灵) | `3151:5030` | 3012 |
| NX68pro (腹灵) | `3151:5030` | 2447 |
| Nyf HE 61K (NyfterUG) | `3151:5029` | 2960 |
| Phantom X68PG | `3151:5029` | 3044 |
| Phantom X68RB | `3151:5029` | 3043 |
| R75PROHE (AttackShark) | `3151:502f` | 2756 |
| R82HE (AttackShark) | `3151:502d` | 2844 |
| R82PROHE (AttackShark) | `3151:502f` | 2798 |
| R85Ultra (AttackShark) | `3151:5030` | 2968 |
| R86PROHE (AttackShark) | `3151:5030` | 2793 |
| R86PROHE (AttackShark) | `3151:5029` | 2982 |
| RAY68 (akko) | `3151:5030` | 2743 |
| RAY68 (akko) | `3151:5030` | 2924 |
| RK-X44-67 (WINSTAR) | `3151:502d` | 2796 |
| RT75 PRO (YUNZII) | `3151:5030` | 3100 |
| RT75PRO (YUNZII) | `3151:5030` | 2865 |
| RTS1 V2 (DELUX) | `3151:5029` | 2563 |
| SEEK75 (EWEADNV) | `3151:5030` | 2799 |
| SG8905 | `3151:5030` | 2776 |
| SG8905 | `3151:5030` | 2972 |
| SG8992 | `3151:5030` | 2772 |
| SG8992 | `3151:5030` | 2966 |
| Shine60 (Veekos) | `3151:5030` | 2832 |
| Shine60 (Veekos) | `3151:5029` | 2836 |
| Shine68 (MonsGeek) | `38ee:0001` | 3269 |
| Shine68 (MonsGeek) | `38ee:0009` | 3270 |
| SMART 875 (EWEADNV) | `3151:5030` | 2637 |
| Storm68 (TITANHUB) | `3151:5029` | 2816 |
| SUPER68 | `3151:5029` | 2879 |
| SUPER75 (SUPER68) | `3151:5029` | 2802 |
| TAC75 HE (akko) | `3151:502d` | 2782 |
| TIRUS HE80 (GAMEPOWER) | `3151:5030` | 3108 |
| TITAN60 (TITANHUB) | `3151:5029` | 2220 |
| TITAN68HE (TITANHUB) | `3151:5029` | 2116 |
| TK35 | `3151:5030` | 3069 |
| TK35 | `3151:5030` | 3070 |
| TK75-HE (gamakay2) | `3151:5029` | 2334 |
| TK75-HE (gamakay2) | `3151:5029` | 2501 |
| Varna Atlas (Ninjadog) | `3151:5030` | 3076 |
| Verve68 (MonsGeek) | `3151:5030` | 2721 |
| Verve68 (MonsGeek) | `3151:5029` | 3099 |
| Verve68 (MonsGeek) | `3151:5029` | 3463 |
| Verve68T (MonsGeek) | `3151:5030` | 3460 |
| VK MAG 75 (VKMS) | `374a:a216` | 2246 |
| VK MAG68 (VKMS) | `374a:a225` | 2320 |
| VK MAG75 Pro (VKMS) | `374a:a216` | 2227 |
| VK99 (VKMS) | `3151:5030` | 2410 |
| VK99 Gaming (VKMS) | `374a:a219` | 2831 |
| X107 | `3151:502d` | 2386 |
| X60 (AttackShark) | `3151:5029` | 2929 |
| X60HE (Mambasnake) | `3151:502f` | 2368 |
| X65 (AttackShark) | `3151:5029` | 2942 |
| X65HE (AttackShark) | `3151:502d` | 2268 |
| X65PRO (AttackShark) | `3151:502f` | 2308 |
| X65PRO (AttackShark) | `3151:5030` | 2938 |
| X68 (ROYALAXE) | `3151:502d` | 2485 |
| X68 Pro | `3151:5029` | 2897 |
| X68HE (AttackShark) | `3151:502d` | 2270 |
| X68HE (AttackShark) | `3151:502d` | 2472 |
| X68HE (AttackShark) | `3151:502d` | 2902 |
| X68MAX (AttackShark) | `3151:502d` | 2755 |
| X68PRO HE (AttackShark) | `3151:502f` | 2370 |
| X68PRO HE (AttackShark) | `3151:502f` | 2901 |
| X68Ultra (AttackShark) | `3151:5030` | 2650 |
| X68Ultra (AttackShark) | `3151:5030` | 2833 |
| X80HE (腹灵) | `3151:5030` | 2988 |
| X82HE (AttackShark) | `3151:5030` | 3086 |
| X82PRO HE (AttackShark) | `3151:502f` | 2356 |
| X85Ultra (AttackShark) | `3151:5030` | 2769 |
| X87Ultra (AttackShark) | `3151:502d` | 2660 |
| X87Ultra (AttackShark) | `3151:5030` | 2852 |
| X96HE (AttackShark) | `3151:5030` | 2792 |
| X96HE (AttackShark) | `3151:5030` | 2964 |
| YC100 | `3151:5030` | 2624 |
| ZAP68 (EWEADNV) | `3151:502d` | 2348 |
| ZAP68 (EWEADNV) | `3151:5030` | 2426 |
| ZAP68 (EWEADNV) | `3151:5029` | 3035 |
| ZAP68 (EWEADNV) | `3151:5030` | 3036 |
| ZAP68Ultra (EWEADNV) | `3151:5030` | 2510 |
| ZAP68Ultra (EWEADNV) | `3151:5029` | 2554 |
| ZAP87 (EWEADNV) | `3151:5030` | 2527 |
| ZAP87 (EWEADNV) | `3151:5030` | 3011 |
| ZENITH PRO (ZENITHPROSoftware) | `3151:502d` | 2310 |
| 万能驱 | `3151:5029` | 9999 |

## MCHOSE (first generation)

MCHOSE's magnetic boards on their first-generation firmware speak their own protocol
([PROTOCOL-MC.md](PROTOCOL-MC.md)). FCC supports lighting, per-key RGB, keymap, actuation, rapid trigger, mod-tap,
toggle, macros (play once) and the keyboard settings; DKS, SOCD and live key travel come later. All are **untested** so
far and open read-only until you choose *Allow changes*. Generated by `tools/catalog/build-mc.js` from MCHOSE's web
driver (`app/src/devices/mc-catalog.json`), with each board's own drawn layout.

| Model | USB id |
|---|---|
| MCHOSE Ace 60 | `41e4:2101`, `19f5:fc30` |
| MCHOSE Ace 60 Pro | `41e4:2103`, `19f5:fc31` |
| MCHOSE Ace 60 Pro ISO FR | `3837:3040` |
| MCHOSE Ace 60 Pro Nordic | `3837:3002` |
| MCHOSE Ace 60X | `41e4:2112` |
| MCHOSE Ace 60X | `41e4:2126` |
| MCHOSE Ace 68 | `41e4:2114` |
| MCHOSE Ace 68 | `41e4:2116` |
| MCHOSE Ace 68 Air 2 | `3837:300a` |
| MCHOSE Ace 68 Air (Esports) | `41e4:2120` |
| MCHOSE Ace 68 Air (Ultra) | `41e4:2132` |
| MCHOSE Ace 68 GT | `3837:3007` |
| MCHOSE Ace 68 Turbo(16K) | `3837:3026` |
| MCHOSE Ace 68 Turbo(8K) | `3837:3028` |
| MCHOSE Ace 68 V2 (Ultra) | `3837:3024` |
| MCHOSE Ace 68 (Ultra) | `3837:3003` |
| MCHOSE Ace 75 | `3837:303c` |
| MCHOSE Ace 75(16K) | `3837:301d` |
| MCHOSE G75 V2(8K) | `3837:2021`, `3837:3033` |
| MCHOSE G87 V2(8K) | `3837:2015`, `3837:3033` |
| MCHOSE Jet 75 | `41e4:2118` |
| MCHOSE Jet 75 | `41e4:211a` |
| MCHOSE Jet 75 | `3837:3008` |
| MCHOSE K87S | `3837:200e`, `3837:3033` |
| MCHOSE K99 V3 | `3837:2020`, `3837:3033` |
| MCHOSE Mix 87 | `41e4:2122` |
| MCHOSE Mix 87 | `3837:300d` |
| MCHOSE ZERO 75X | `41e4:211c` |
