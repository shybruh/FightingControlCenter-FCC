// Builds small USBPcap captures (.pcapng) for testing usb-capture.js without real hardware.
//
//   const { pcapng, control, interrupt } = require('./fixture')
//   fs.writeFileSync('test.pcapng', pcapng([control(...), interrupt(...)]))

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }

let irp = 1

/** USBPcap packet header + data. */
function usbpcap({ fromDevice, dev, ep, xfer, stage = null, data, id }) {
  const hlen = stage === null ? 27 : 28
  const h = Buffer.alloc(hlen)
  h.writeUInt16LE(hlen, 0)
  h.writeBigUInt64LE(BigInt(id), 2)
  h.writeUInt16LE(xfer === 2 ? 0x08 : 0x09, 14)
  h[16] = fromDevice ? 1 : 0
  h.writeUInt16LE(1, 17) // bus
  h.writeUInt16LE(dev, 19)
  h[21] = ep
  h[22] = xfer
  h.writeUInt32LE(data.length, 23)
  if (stage !== null) h[27] = stage
  return Buffer.concat([h, data])
}

const setup = (type, req, value, index, length) => Buffer.concat([Buffer.from([type, req]), u16(value), u16(index), u16(length)])

/**
 * A control transfer as USBPcap records it: the request (with OUT data), then the completion (with IN data).
 * `split` puts the OUT data in its own packet, as some captures do.
 */
function control(t, dev, s, { out = Buffer.alloc(0), reply = Buffer.alloc(0), split = false } = {}) {
  const id = irp++
  const packets = split
    ? [
        { t, d: usbpcap({ fromDevice: false, dev, ep: 0, xfer: 2, stage: 0, data: s, id }) },
        { t, d: usbpcap({ fromDevice: false, dev, ep: 0, xfer: 2, stage: 1, data: out, id }) },
      ]
    : [{ t, d: usbpcap({ fromDevice: false, dev, ep: 0, xfer: 2, stage: 0, data: Buffer.concat([s, out]), id }) }]
  packets.push({ t: t + 0.001, d: usbpcap({ fromDevice: true, dev, ep: 0x80, xfer: 2, stage: 3, data: reply, id }) })
  return packets
}

/** An interrupt transfer: OUT data goes with the request, IN data with the completion. */
function interrupt(t, dev, ep, data) {
  const id = irp++
  const isIn = (ep & 0x80) !== 0
  return [{ t, d: usbpcap({ fromDevice: isIn, dev, ep, xfer: 1, data, id }) }]
}

function block(type, body) {
  const pad = Buffer.alloc((4 - (body.length % 4)) % 4)
  const len = 12 + body.length + pad.length
  return Buffer.concat([u32(type), u32(len), body, pad, u32(len)])
}

/** A pcapng file with one USBPcap interface (microsecond timestamps). */
function pcapng(groups) {
  const shb = block(0x0a0d0d0a, Buffer.concat([u32(0x1a2b3c4d), u16(1), u16(0), Buffer.alloc(8, 0xff)]))
  const idb = block(1, Buffer.concat([u16(249), u16(0), u32(65535)]))
  const epbs = groups.flat().sort((a, b) => a.t - b.t).map(({ t, d }) => {
    const us = Math.round(t * 1e6)
    return block(6, Buffer.concat([u32(0), u32(Math.floor(us / 2 ** 32)), u32(us % 2 ** 32), u32(d.length), u32(d.length), d]))
  })
  return Buffer.concat([shb, idb, ...epbs])
}

module.exports = { pcapng, control, interrupt, setup }
