#!/usr/bin/env node
// Reads a USB capture (Wireshark + USBPcap on Windows: .pcapng or .pcap) and shows what a keyboard's own software
// said to the keyboard: HID SET_REPORT / GET_REPORT requests with their data and answers, and interrupt OUT writes.
// Packets are grouped into the steps the person capturing took (from --marks, or by pauses), repeated packets are
// folded, and the bytes that changed since the previous packet of the same command are shown in [brackets].
//
//   node tools/capture/usb-capture.js capture.pcapng                 devices in the capture, then the busiest one
//   node tools/capture/usb-capture.js capture.pcapng --device 1.5    a given device (bus.address from the list)
//   node tools/capture/usb-capture.js capture.pcapng --marks "12=brightness 3, 20.5=wave"   name the steps
//   node tools/capture/usb-capture.js capture.pcapng --gap 2         a new step after 2 s without traffic (default 1)
//   node tools/capture/usb-capture.js capture.pcapng --key 6,7       bytes that name a command, for change marks
//                                                                    (default 0,1; 6,7 for Razer's 90-byte reports)
//   node tools/capture/usb-capture.js capture.pcapng --all-in        include short reports from the device too
//                                                                    (left out by default: they're usually keypresses)
//   node tools/capture/usb-capture.js capture.pcapng --json out.json everything decoded, for scripts
//
// Nothing here is sent anywhere; it only reads the file.

const fs = require('fs')

// ---------- arguments ----------
const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  const [, v] = args.splice(i, 2)
  return v
}
const flag = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return false
  args.splice(i, 1)
  return true
}
const deviceArg = opt('--device', null)
const marksArg = opt('--marks', null)
const gap = Number(opt('--gap', '1'))
const keyArg = opt('--key', null)
const jsonOut = opt('--json', null)
const allIn = flag('--all-in')
const file = args[0]

// ---------- capture files ----------
const LINK_USBPCAP = 249

/** Every packet in a pcapng or pcap file: { t (seconds), link, data }. */
function readCapture(buf) {
  const magic = buf.readUInt32LE(0)
  if (magic === 0x0a0d0d0a) return readPcapng(buf)
  if ([0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1].includes(magic)) return readPcap(buf)
  throw new Error('not a .pcapng or .pcap file')
}

function readPcap(buf) {
  const m = buf.readUInt32LE(0)
  const le = m === 0xa1b2c3d4 || m === 0xa1b23c4d
  const nano = m === 0xa1b23c4d || m === 0x4d3cb2a1
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  const link = u32(20)
  const out = []
  for (let o = 24; o + 16 <= buf.length; ) {
    const len = u32(o + 8)
    out.push({ t: u32(o) + u32(o + 4) / (nano ? 1e9 : 1e6), link, data: buf.subarray(o + 16, o + 16 + len) })
    o += 16 + len
  }
  return out
}

function readPcapng(buf) {
  const out = []
  let le = true
  let ifaces = []
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o))
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o))
  for (let o = 0; o + 12 <= buf.length; ) {
    let type = buf.readUInt32LE(o)
    if (type === 0x0a0d0d0a) {
      // section header: its byte-order magic decides how everything after it reads
      le = buf.readUInt32LE(o + 8) === 0x1a2b3c4d
      ifaces = []
    }
    type = u32(o)
    const len = u32(o + 4)
    if (len < 12) break
    const body = o + 8
    if (type === 1) {
      // interface description: link type, and the timestamp unit (option 9)
      let res = 1e-6
      for (let p = body + 8; p + 4 <= o + len - 4; ) {
        const code = u16(p)
        const olen = u16(p + 2)
        if (code === 0) break
        if (code === 9) {
          const v = buf[p + 4]
          res = v & 0x80 ? 2 ** -(v & 0x7f) : 10 ** -v
        }
        p += 4 + Math.ceil(olen / 4) * 4
      }
      ifaces.push({ link: u16(body), res })
    } else if (type === 6) {
      const iface = ifaces[u32(body)] ?? { link: LINK_USBPCAP, res: 1e-6 }
      const ts = u32(body + 4) * 2 ** 32 + u32(body + 8)
      const cap = u32(body + 12)
      out.push({ t: ts * iface.res, link: iface.link, data: buf.subarray(body + 20, body + 20 + cap) })
    } else if (type === 3) {
      const iface = ifaces[0] ?? { link: LINK_USBPCAP }
      out.push({ t: 0, link: iface.link, data: buf.subarray(body + 4, o + len - 4) })
    }
    o += len
  }
  return out
}

// ---------- USBPcap packets -> HID events ----------
const TRANSFER = { 0: 'iso', 1: 'interrupt', 2: 'control', 3: 'bulk' }
const REPORT_TYPE = { 1: 'input', 2: 'output', 3: 'feature' }

/** USBPcap's packet header (little-endian), then the transfer's data. */
function usbpcap(d) {
  const hlen = d.readUInt16LE(0)
  const xfer = d[22]
  return {
    irp: d.readBigUInt64LE(2).toString(16),
    fromDevice: (d[16] & 1) === 1,
    dev: `${d.readUInt16LE(17)}.${d.readUInt16LE(19)}`,
    ep: d[21],
    xfer: TRANSFER[xfer] ?? String(xfer),
    stage: xfer === 2 && hlen >= 28 ? d[27] : null,
    data: d.subarray(hlen, hlen + d.readUInt32LE(23)),
  }
}

function decode(packets) {
  const unsupported = new Set(packets.filter((p) => p.link !== LINK_USBPCAP).map((p) => p.link))
  if (unsupported.size && unsupported.size === new Set(packets.map((p) => p.link)).size) {
    throw new Error(`link type ${[...unsupported].join(', ')} isn't USBPcap (249): capture on Windows with Wireshark + USBPcap`)
  }
  const t0 = packets.length ? packets[0].t : 0
  const devices = new Map()
  const dev = (id) => {
    if (!devices.has(id)) devices.set(id, { id, vid: null, pid: null, product: '', iProduct: null, strings: {}, events: 0, hidDescriptors: {} })
    return devices.get(id)
  }
  const pending = new Map()
  const events = []
  const push = (e) => {
    events.push(e)
    dev(e.dev).events++
  }

  for (const p of packets) {
    if (p.link !== LINK_USBPCAP || p.data.length < 27) continue
    const u = usbpcap(p.data)
    const t = +(p.t - t0).toFixed(6)
    dev(u.dev)
    if (u.xfer === 'control') {
      if (!u.fromDevice && u.stage === 0 && u.data.length >= 8) {
        const s = u.data
        const setup = { type: s[0], req: s[1], value: s.readUInt16LE(2), index: s.readUInt16LE(4), length: s.readUInt16LE(6) }
        const entry = { t, setup, out: Buffer.from(s.subarray(8)) }
        pending.set(u.irp, entry)
        // HID class request to an interface: SET_REPORT carries its data with the request
        if (setup.type === 0x21 && setup.req === 0x09) {
          entry.event = { t, dev: u.dev, kind: 'set', report: REPORT_TYPE[setup.value >> 8] ?? `type ${setup.value >> 8}`, id: setup.value & 0xff, iface: setup.index, data: entry.out }
          if (entry.out.length) push(entry.event)
        }
      } else if (!u.fromDevice && u.stage === 1) {
        // some captures put an OUT request's data in its own packet
        const entry = pending.get(u.irp)
        if (entry?.event && !entry.event.data.length) {
          entry.event.data = Buffer.from(u.data)
          push(entry.event)
        }
      } else if (u.fromDevice) {
        const entry = pending.get(u.irp)
        if (!entry || !u.data.length) continue
        pending.delete(u.irp)
        const { setup } = entry
        if (setup.type === 0xa1 && setup.req === 0x01) {
          push({ t, dev: u.dev, kind: 'get', report: REPORT_TYPE[setup.value >> 8] ?? `type ${setup.value >> 8}`, id: setup.value & 0xff, iface: setup.index, data: Buffer.from(u.data), asked: entry.t })
        } else if ((setup.type & 0x80) && setup.req === 0x06) {
          // GET_DESCRIPTOR answers: who the device is, and its HID report descriptors
          const kind = setup.value >> 8
          const d = dev(u.dev)
          if (kind === 1 && u.data.length >= 18) {
            d.vid = u.data.readUInt16LE(8)
            d.pid = u.data.readUInt16LE(10)
            d.iProduct = u.data[15]
          } else if (kind === 3 && (setup.value & 0xff) !== 0) {
            d.strings[setup.value & 0xff] = u.data.subarray(2, u.data[0]).toString('utf16le')
          } else if (kind === 0x22) {
            d.hidDescriptors[setup.index] = Buffer.from(u.data).toString('hex')
          }
        }
      }
    } else if (u.xfer === 'interrupt' && u.data.length) {
      const isIn = (u.ep & 0x80) !== 0
      if (!isIn && !u.fromDevice) push({ t, dev: u.dev, kind: 'out', ep: u.ep, data: Buffer.from(u.data) })
      else if (isIn && u.fromDevice && (allIn || u.data.length >= 16)) push({ t, dev: u.dev, kind: 'in', ep: u.ep & 0x7f, data: Buffer.from(u.data) })
    }
  }
  for (const d of devices.values()) if (d.iProduct && d.strings[d.iProduct]) d.product = d.strings[d.iProduct]
  return { devices: [...devices.values()], events }
}

// ---------- printing ----------
const h2 = (n) => n.toString(16).padStart(2, '0')
const h4 = (n) => n.toString(16).padStart(4, '0')

function label(e) {
  if (e.kind === 'set') return `SET ${e.report} 0x${h2(e.id)} if${e.iface}`
  if (e.kind === 'get') return `GET ${e.report} 0x${h2(e.id)} if${e.iface}`
  if (e.kind === 'out') return `OUT ep${e.ep}`
  return `IN  ep${e.ep}`
}

/** Bytes up to the last non-zero one, runs of 4+ zeros shortened to 00×n; changed bytes (vs `prev`) in [brackets]. */
function bytes(data, prev) {
  let end = data.length
  while (end > 1 && data[end - 1] === 0) end--
  const changed = (i) => prev && prev.length === data.length && prev[i] !== data[i]
  const out = []
  for (let i = 0; i < end; ) {
    let run = 0
    while (i + run < end && data[i + run] === 0 && !changed(i + run)) run++
    if (run >= 4) {
      out.push(`00×${run}`)
      i += run
      continue
    }
    out.push(changed(i) ? `[${h2(data[i])}]` : h2(data[i]))
    i++
  }
  return out.join(' ') + (end < data.length ? `  …${data.length - end} × 00` : '')
}

const keyPositions = (data) => (keyArg ? keyArg.split(',').map(Number) : data.length === 90 ? [6, 7] : [0, 1])
const commandKey = (e) => `${label(e)}|${e.data.length}|${keyPositions(e.data).map((i) => e.data[i]).join(',')}`

function parseMarks(text) {
  if (!text) return []
  return text
    .split(',')
    .map((s) => s.trim().match(/^([\d.]+)\s*=\s*(.+)$/))
    .filter(Boolean)
    .map((m) => ({ t: Number(m[1]), name: m[2].trim() }))
    .sort((a, b) => a.t - b.t)
}

function main() {
  if (!file) {
    console.error('Usage: node tools/capture/usb-capture.js <capture.pcapng> [--device bus.addr] [--marks "t=name, ..."] [--gap s] [--key i,j] [--all-in] [--json out.json]')
    process.exit(1)
  }
  const { devices, events } = decode(readCapture(fs.readFileSync(file)))
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({ devices, events: events.map((e) => ({ ...e, data: e.data.toString('hex') })) }, null, 1))
    console.log(`Written ${jsonOut}`)
  }

  const busy = devices.filter((d) => d.events).sort((a, b) => b.events - a.events)
  console.log('Devices with configuration traffic')
  if (!busy.length) console.log('  none: no HID reports in this capture (was the right USBPcap interface captured?)')
  for (const d of busy) console.log(`  ${d.id.padEnd(7)} ${d.vid != null ? `${h4(d.vid)}:${h4(d.pid)}` : '????:????'}  ${d.product || ''}  ${d.events} packets`)
  const chosen = deviceArg ? devices.find((d) => d.id === deviceArg) : busy[0]
  if (!chosen) {
    if (deviceArg) console.error(`\nNo device ${deviceArg} in this capture.`)
    return
  }
  console.log(`\nShowing ${chosen.id}${chosen.vid != null ? ` (${h4(chosen.vid)}:${h4(chosen.pid)}${chosen.product ? ` ${chosen.product}` : ''})` : ''}`)
  const hid = Object.keys(chosen.hidDescriptors)
  if (hid.length) console.log(`HID report descriptors captured for interface ${hid.join(', ')} (in --json)`)

  const mine = events.filter((e) => e.dev === chosen.id)
  const marks = parseMarks(marksArg)
  // steps: named by --marks (each runs until the next mark), otherwise split wherever the traffic pauses
  const stepOf = (t) => {
    if (marks.length) {
      let name = 'before the first mark'
      for (const m of marks) if (t >= m.t) name = `${m.t}s ${m.name}`
      return name
    }
    return null
  }
  let step = undefined
  let lastT = -Infinity
  const prevByKey = new Map()
  let fold = null
  const flush = () => {
    if (fold && fold.count > 1) console.log(`${' '.repeat(10)}… the same ${fold.count - 1} more time${fold.count > 2 ? 's' : ''}, until ${fold.until.toFixed(3)} s`)
    fold = null
  }
  for (const e of mine) {
    const s = marks.length ? stepOf(e.t) : e.t - lastT > gap ? `from ${e.t.toFixed(2)} s` : step
    if (s !== step) {
      flush()
      step = s
      console.log(`\n── ${s} ${'─'.repeat(Math.max(4, 60 - s.length))}`)
    }
    lastT = e.t
    const key = commandKey(e)
    const sig = `${key}|${e.data.toString('hex')}`
    if (fold && fold.sig === sig) {
      fold.count++
      fold.until = e.t
      continue
    }
    flush()
    fold = { sig, count: 1, until: e.t }
    console.log(`${e.t.toFixed(3).padStart(9)}  ${label(e).padEnd(24)} [${String(e.data.length).padStart(2)}] ${bytes(e.data, prevByKey.get(key))}`)
    prevByKey.set(key, e.data)
  }
  flush()
  if (!mine.length) console.log('No HID reports for this device.')
}

if (require.main === module) {
  try {
    main()
  } catch (e) {
    console.error(`Couldn't read ${file}: ${e.message}`)
    process.exit(1)
  }
}

module.exports = { readCapture, decode }
