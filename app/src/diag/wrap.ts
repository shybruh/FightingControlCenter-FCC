// Wraps every transport so all traffic shows up in the diagnostic log, whatever the protocol or platform.

import type { Opened } from '../hid/connect'
import type { McExpect, McTransport } from '../hid/mc'
import type { FeatureTransport } from '../hid/rk'
import type { RyTransport } from '../hid/ry'
import type { RazerTransport } from '../hid/razer'
import type { SteelSeriesTransport } from '../hid/steelseries'
import type { SinowealthTransport } from '../hid/sinowealth'
import type { Transport } from '../hid/transport'
import { errorText, hex, log } from './log'

const who = (t: { name: string; identity: { vendorId: number; productId: number; productName: string } }) =>
  `${t.name} ${t.identity.vendorId.toString(16).padStart(4, '0')}:${t.identity.productId.toString(16).padStart(4, '0')}`

function sonix(t: Transport): Transport {
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async send(p) {
      log.packet('sonix', 'out', p)
      try {
        await t.send(p)
      } catch (e) {
        log.error('sonix', `send failed: ${hex(p, 16)}`, errorText(e))
        throw e
      }
    },
    onReport(l) {
      // 0xFB = sensor / calibration stream
      return t.onReport((d) => {
        log.packet('sonix', 'in', d, undefined, d[1] === 0xfb)
        l(d)
      })
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('sonix', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function rk(t: FeatureTransport): FeatureTransport {
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async sendFeature(id, data) {
      log.packet('rk', 'out', [id, ...data], `feature report 0x${id.toString(16)}`)
      try {
        await t.sendFeature(id, data)
      } catch (e) {
        log.error('rk', `feature report 0x${id.toString(16)} rejected`, errorText(e))
        throw e
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('rk', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function ry(t: RyTransport): RyTransport {
  let noisy = false
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async sendReport(d) {
      // 0xE5 / 254 = live travel polling
      noisy = d[0] === 0xe5 && d[1] === 254
      log.packet('ry', 'out', d, undefined, noisy)
      try {
        await t.sendReport(d)
      } catch (e) {
        log.error('ry', `send failed: ${hex(d, 16)}`, errorText(e))
        throw e
      }
    },
    async receiveReport() {
      try {
        const r = await t.receiveReport()
        log.packet('ry', 'in', r, undefined, noisy)
        return r
      } catch (e) {
        log.error('ry', 'receive failed', errorText(e))
        throw e
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('ry', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function mc(t: McTransport): McTransport {
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async request(p: Uint8Array, e: McExpect) {
      log.packet('mc', 'out', p, `cmd ${e.cmd} @${e.lo | (e.hi << 8)} len ${e.len}`)
      try {
        const r = await t.request(p, e)
        log.packet('mc', 'in', r)
        return r
      } catch (err) {
        log.error('mc', `no reply to cmd ${e.cmd} @${e.lo | (e.hi << 8)} len ${e.len}`, errorText(err))
        throw err
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('mc', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function razer(t: RazerTransport): RazerTransport {
  const h2 = (n: number) => `0x${n.toString(16).padStart(2, '0')}`
  const cmd = (r: ArrayLike<number>) => `command ${h2(r[6])} ${h2(r[7])}`
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async request(report) {
      // header and arguments; the rest of the 90 bytes is padding
      log.packet('razer', 'out', report.slice(0, 8 + Math.max(report[5], 1)), cmd(report))
      try {
        const reply = await t.request(report)
        log.packet('razer', 'in', reply.slice(0, 8 + Math.max(reply[5], 1)), `status ${h2(reply[0])}`)
        return reply
      } catch (e) {
        log.error('razer', `${cmd(report)} failed`, errorText(e))
        throw e
      }
    },
    async send(report) {
      log.packet('razer', 'out', report.slice(0, 8 + Math.max(report[5], 1)), `${cmd(report)} (no answer expected)`)
      try {
        await t.send(report)
      } catch (e) {
        log.error('razer', `${cmd(report)} failed`, errorText(e))
        throw e
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('razer', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function steelseries(t: SteelSeriesTransport): SteelSeriesTransport {
  // frames stream ~20 times a second: log the first of each kind and every 200th after it, not all of them
  const counts = new Map<number, number>()
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async send(report) {
      const n = counts.get(report[0]) ?? 0
      counts.set(report[0], n + 1)
      if (n % 200 === 0) log.packet('steelseries', 'out', report.slice(0, 2 + Math.min(report[1] ?? 0, 4) * 4), `report 0x${report[0].toString(16).padStart(2, '0')} #${n + 1}`)
      try {
        await t.send(report)
      } catch (e) {
        log.error('steelseries', `report 0x${report[0].toString(16).padStart(2, '0')} failed`, errorText(e))
        throw e
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('steelseries', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

function sinowealth(t: SinowealthTransport): SinowealthTransport {
  // frames stream ~20 times a second: log the first and every 200th, but every request in full
  let frames = 0
  return {
    get name() {
      return t.name
    },
    get identity() {
      return t.identity
    },
    async send(report) {
      if (frames++ % 200 === 0) log.packet('sinowealth', 'out', report.slice(0, 16), `frame #${frames}`)
      try {
        await t.send(report)
      } catch (e) {
        log.error('sinowealth', 'frame failed', errorText(e))
        throw e
      }
    },
    async request(report) {
      log.packet('sinowealth', 'out', report.slice(0, 8), 'model request')
      try {
        const answer = await t.request(report)
        log.packet('sinowealth', 'in', answer.slice(0, 24), `model 0x${(answer[13] ?? 0).toString(16).padStart(2, '0')}`)
        return answer
      } catch (e) {
        log.error('sinowealth', 'model request failed', errorText(e))
        throw e
      }
    },
    onDisconnect(l) {
      return t.onDisconnect(() => {
        log.warn('sinowealth', `disconnected: ${who(t)}`)
        l()
      })
    },
    close: () => t.close(),
  }
}

/** The same connection with every packet logged. */
export function withLogging(o: Opened): Opened {
  log.info('connect', `opened ${o.kind} transport: ${who(o.transport)}`, o.transport.identity)
  switch (o.kind) {
    case 'sonix':
      return { kind: 'sonix', transport: sonix(o.transport) }
    case 'rk':
      return { kind: 'rk', transport: rk(o.transport) }
    case 'ry':
      return { kind: 'ry', transport: ry(o.transport) }
    case 'mc':
      return { kind: 'mc', transport: mc(o.transport) }
    case 'razer':
      return { kind: 'razer', transport: razer(o.transport) }
    case 'steelseries':
      return { kind: 'steelseries', transport: steelseries(o.transport) }
    case 'sinowealth':
      return { kind: 'sinowealth', transport: sinowealth(o.transport) }
  }
}
