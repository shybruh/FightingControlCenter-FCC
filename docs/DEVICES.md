# Supported keyboards

FCC talks to keyboards that use the Sonix-based HE firmware behind the VTER / driveall.cn web driver. The list below is extracted from that driver (see `app/src/devices/catalog.json`).

It also supports some Royal Kludge boards over RK's own protocol; see [Royal Kludge](#royal-kludge) at the end.

## Verified (1)

Tested end to end on real hardware.

| Model | USB id | Travel | Rapid trigger |
|---|---|---|---|
| Fighting68 | `0c45:8030` | 3.30 mm | 0.08–2.40 mm |

## Untested (135)

Wired boards that speak the same protocol. FCC detects them, reads and backs up their settings, and opens them **read-only** until you choose *Allow changes*. If yours works (or doesn't), please open an issue so it can be marked verified.

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
