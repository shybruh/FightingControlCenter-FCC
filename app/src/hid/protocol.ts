// Wire-level constants and packet helpers. See docs/PROTOCOL.md.

export const CONFIG_USAGE_PAGE = 0xff68
export const CONFIG_USAGE = 0x61

export const PACKET_LEN = 64
export const HEADER_LEN = 8
export const CHUNK = PACKET_LEN - HEADER_LEN // 56
export const MAGIC = 0xaa

export const Cmd = {
  Commit: 0x00,
  Reset: 0x0f,
  CalibrationStart: 0x64,
  CalibrationEnd: 0x65,
  EventCalibration: 0xfb,
  EventLink: 0xfc,
} as const

export const ResetArg = {
  FactoryAll: 0xff,
  KeyCheck: 0x05,
} as const

export type RegionName =
  | 'info'
  | 'settings'
  | 'keys'
  | 'led'
  | 'colors'
  | 'macros'
  | 'fn'
  | 'rt'
  | 'dks'

export interface RegionDef {
  read: number
  write: number | null
  size: number
}

export const REGIONS: Record<RegionName, RegionDef> = {
  info: { read: 0x10, write: null, size: 24 },
  settings: { read: 0x11, write: 0x21, size: 32 },
  keys: { read: 0x12, write: 0x22, size: 512 },
  led: { read: 0x13, write: 0x23, size: 16 },
  colors: { read: 0x14, write: 0x24, size: 512 },
  macros: { read: 0x15, write: 0x25, size: 4008 },
  fn: { read: 0x16, write: 0x26, size: 512 },
  rt: { read: 0x17, write: 0x27, size: 1024 },
  dks: { read: 0x18, write: 0x28, size: 1024 },
}

/** Number of bytes the official driver writes for the settings region. */
export const SETTINGS_WRITE_LEN = 16

export const READ_ORDER: RegionName[] = [
  'info',
  'settings',
  'keys',
  'led',
  'colors',
  'macros',
  'fn',
  'rt',
  'dks',
]

/** Regions a profile owns; written in this order when a profile is applied (matches official driver). */
export const PROFILE_REGIONS = ['keys', 'led', 'colors', 'macros', 'rt', 'dks'] as const
export type ProfileRegion = (typeof PROFILE_REGIONS)[number]

export function buildPacket(cmd: number, offset: number, payload: ArrayLike<number>): Uint8Array {
  if (payload.length > CHUNK) throw new Error(`payload too large: ${payload.length}`)
  const p = new Uint8Array(PACKET_LEN)
  p[0] = MAGIC
  p[1] = cmd
  p[2] = payload.length
  p[3] = offset & 0xff
  p[4] = (offset >> 8) & 0xff
  p.set(Array.from(payload, (v) => v & 0xff), HEADER_LEN)
  return p
}

export function buildCommand(cmd: number, args: number[] = []): Uint8Array {
  const p = new Uint8Array(PACKET_LEN)
  p[0] = MAGIC
  p[1] = cmd
  args.forEach((v, i) => (p[2 + i] = v & 0xff))
  return p
}

export interface ParsedReply {
  cmd: number
  len: number
  offset: number
  payload: Uint8Array
  raw: Uint8Array
}

export function parseReply(raw: Uint8Array): ParsedReply {
  return {
    cmd: raw[1],
    len: raw[2],
    offset: raw[3] | (raw[4] << 8),
    payload: raw.slice(HEADER_LEN, HEADER_LEN + Math.min(raw[2], CHUNK)),
    raw,
  }
}
