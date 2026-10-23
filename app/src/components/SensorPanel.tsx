import { useEffect, useRef, useState } from 'react'
import { RT_LIMITS, decodeRT, rtEnabled } from '../hid/codec'
import { Cmd } from '../hid/protocol'
import { KEY_BY_ID, KEYS } from '../data/layout'
import { useStore } from '../store'
import { ActivityIcon, SquareIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Keyboard } from './Keyboard'
import { Stat } from './ui'

interface KeyLive {
  travel: number
  peak: number
  full: number
  rest: number
  bottom: number
  adc: number
  /**
   * the board's own flag (status byte of the stream): the key has a calibration, stored or from a full press now.
   * Without one it uses a placeholder bottom (1700 on a Fighting68, real ones are ~1230), so half a press counts as a
   * full one: actuation and rapid trigger come far too early
   */
  calibrated: boolean
}

/** Keys that reached this share of full travel this session count as bottomed out (boards without calibration flags). */
const BOTTOM_RATIO = 0.9
const FRAME_MS = 33

const mm = (v: number) => (v / 100).toFixed(2)
/** live travel (calibration mode) stops by itself after this long without a key moving */
const IDLE_STOP_MS = 2 * 60_000

/**
 * Live key travel. The firmware only streams sensor data in calibration mode, so this
 * view doubles as calibration: stopping it sends "end calibration", which saves the
 * deepest press seen per key (it can only improve the bottom reading).
 */
export function SensorPanel() {
  const kb = useStore((s) => s.kb)
  const readOnly = useStore((s) => s.readOnly)
  // the calibration check on connect uses calibration mode for a second
  const checking = useStore((s) => s.checkingCalibration)
  // RY boards report travel without entering calibration
  const calibrates = useStore((s) => s.device?.protocol !== 'ry')
  const rt = useStore((s) => s.regions!.rt)
  const [active, setActive] = useState(false)
  // a new connection (replug, reconnect) never resumes live travel by itself: it would put the fresh board straight
  // back into calibration mode
  const [activeFor, setActiveFor] = useState(kb)
  if (activeFor !== kb) {
    setActiveFor(kb)
    if (active) setActive(false)
  }
  const [snap, setSnap] = useState<Map<number, KeyLive>>(new Map())
  const [focus, setFocus] = useState<number | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const live = useRef(new Map<number, KeyLive>())
  const lastMoved = useRef<{ id: number; at: number } | null>(null)

  useEffect(() => {
    if (!kb || !active) return
    live.current = new Map()
    lastMoved.current = null
    const off = kb.sensor.on((e) => {
      const prev = live.current.get(e.key)
      live.current.set(e.key, {
        travel: e.travel,
        peak: Math.max(prev?.peak ?? 0, e.travel),
        full: e.full,
        rest: e.rest,
        bottom: e.bottom,
        adc: e.adc,
        calibrated: e.state === 1,
      })
      if (e.travel > 20 && (!prev || Math.abs(e.travel - prev.travel) > 2)) lastMoved.current = { id: e.key, at: performance.now() }
    })
    const started = performance.now()
    const timer = setInterval(() => {
      setSnap(new Map(live.current))
      if (lastMoved.current) setFocus(lastMoved.current.id)
      // calibration mode must not outlive its use: the board keeps re-learning every key from normal typing while
      // it's on. Stop after a while with no key moving.
      if (performance.now() - (lastMoved.current?.at ?? started) > IDLE_STOP_MS) setActive(false)
    }, FRAME_MS)
    // ... and as soon as FCC is hidden (closed to the tray, minimised): nobody's watching, and games would run on it
    const hidden = () => document.visibilityState === 'hidden' && setActive(false)
    document.addEventListener('visibilitychange', hidden)
    const block = (ev: KeyboardEvent) => ev.preventDefault()
    window.addEventListener('keydown', block, true)
    const leave = () => kb.command(Cmd.CalibrationEnd)
    window.addEventListener('pagehide', leave)
    kb.command(Cmd.CalibrationStart)
    return () => {
      off()
      clearInterval(timer)
      window.removeEventListener('keydown', block, true)
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', hidden)
      kb.command(Cmd.CalibrationEnd)
    }
  }, [kb, active])

  const shown = pinned ?? focus
  const cur = shown != null ? snap.get(shown) : undefined
  const keyRt = shown != null ? decodeRT(rt, shown) : null
  const full = cur?.full || RT_LIMITS.travel
  const pct = (v: number) => `${Math.min(100, (v / full) * 100)}%`
  // calibrating boards say which keys have a calibration; elsewhere a key counts once pressed to the bottom
  const done = (s: KeyLive) => (calibrates ? s.calibrated : s.peak >= s.full * BOTTOM_RATIO)
  const doneCount = KEYS.filter((k) => {
    const s = snap.get(k.id)
    return s && done(s)
  }).length
  const uncalibrated = calibrates ? KEYS.filter((k) => snap.get(k.id)?.calibrated === false) : []

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{calibrates ? 'Live key travel & calibration' : 'Live key travel'}</CardTitle>
        <CardDescription>
          {!calibrates
            ? 'Live per-key travel in 0.01 mm. Press keys to see how far they go.'
            : active
              ? 'Press keys to see their travel. Press each key fully to recalibrate it.'
              : 'Live per-key travel in 0.01 mm, and which keys are calibrated. Runs in calibration mode, so it also recalibrates the keys you press fully.'}
        </CardDescription>
        <CardAction>
          {active ? (
            <Button onClick={() => setActive(false)}>
              <SquareIcon data-icon="inline-start" />
              Stop &amp; save
            </Button>
          ) : (
            <Button variant="outline" disabled={readOnly || checking} onClick={() => setActive(true)}>
              <ActivityIcon data-icon="inline-start" />
              Start
            </Button>
          )}
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {!active ? (
          <p className="text-xs text-muted-foreground">
            {calibrates
              ? "The keyboard only reports travel in calibration mode. Stopping saves calibration, which only ever keeps the deepest press per key, so just looking can't make it worse. Typing in this window is paused while it runs."
              : 'Typing in this window is paused while it runs.'}
          </p>
        ) : (
          <div className="swap-in flex flex-col gap-5">
            <div className="flex flex-wrap items-stretch gap-6">
              <div className="flex min-w-64 flex-1 flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">
                    {shown != null ? KEY_BY_ID.get(shown)?.label || 'Space' : 'Press any key'}
                    {pinned != null && <span className="text-muted-foreground"> · pinned</span>}
                  </span>
                  <span className="text-3xl font-semibold tracking-tight tabular-nums">
                    {mm(cur?.travel ?? 0)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">mm</span>
                  </span>
                </div>
                <div className="relative h-8 overflow-hidden rounded-md border bg-muted/40">
                  <div
                    className={cn('absolute inset-y-0 left-0 transition-[width] duration-75', keyRt && cur && cur.travel >= keyRt.actuation ? 'bg-amber-400/80' : 'bg-foreground/70')}
                    style={{ width: pct(cur?.travel ?? 0) }}
                  />
                  {cur && <div className="absolute inset-y-0 w-px bg-foreground/50" style={{ left: pct(cur.peak) }} />}
                  {keyRt && (
                    <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: pct(keyRt.actuation) }}>
                      <span className="absolute top-0.5 left-1.5 text-[10px] font-medium text-red-400 tabular-nums">{mm(keyRt.actuation)}</span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>0.00</span>
                  <span>{mm(full / 2)}</span>
                  <span>{mm(full)} mm</span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-sm bg-red-500" /> actuation point
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-sm bg-amber-400" /> past actuation
                  </span>
                  <span className="flex items-center gap-1.5">
                    <i className="size-2 rounded-sm bg-foreground/50" /> session peak
                  </span>
                  {keyRt && rtEnabled(keyRt) && (
                    <span>
                      RT ↓{mm(keyRt.press)} ↑{mm(keyRt.release)} mm
                    </span>
                  )}
                </div>
              </div>
              {cur && (
                <div className="flex min-w-48 flex-col gap-1.5 rounded-md border p-3">
                  <Stat label="Peak">{mm(cur.peak)} mm</Stat>
                  <Stat label="Sensor">{cur.adc}</Stat>
                  <Stat label="Rest / bottom">
                    {cur.rest} / {cur.bottom}
                  </Stat>
                  <Stat label="Full travel">{mm(cur.full)} mm</Stat>
                  {calibrates && <Stat label="Calibrated">{cur.calibrated ? 'Yes' : 'No'}</Stat>}
                </div>
              )}
            </div>

            {uncalibrated.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-medium">
                  {uncalibrated.length === 1 ? '1 key isn’t calibrated' : `${uncalibrated.length} keys aren’t calibrated`}
                  {uncalibrated.length <= 8 && `: ${uncalibrated.map((k) => k.label || 'Space').join(', ')}`}
                </p>
                <p className="mt-1 text-muted-foreground">
                  They count half a press as a full one, so actuation and rapid trigger come far too early. Press each red key
                  slowly all the way down until it turns green, then Stop &amp; save. A keyboard reset or a firmware update
                  erases calibration.
                </p>
              </div>
            )}

            <Keyboard
              selected={new Set(pinned != null ? [pinned] : [])}
              onSelectionChange={() => {}}
              onKeyClick={(id) => setPinned(pinned === id ? null : id)}
              face={(k) => {
                const s = snap.get(k.id)
                if (!s) return { sub: '—' }
                const ok = done(s)
                return {
                  sub: mm(s.travel),
                  fill: s.travel / (s.full || RT_LIMITS.travel),
                  fillColor: s.travel >= decodeRT(rt, k.id).actuation ? 'rgb(251 191 36 / 0.55)' : undefined,
                  marked: ok,
                  tint: ok ? '#22c55e' : calibrates ? '#ef4444' : undefined,
                }
              }}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {calibrates
                  ? 'Click a key to pin it. Green = calibrated, red = not calibrated (press it slowly all the way down).'
                  : 'Click a key to pin it. Green = pressed to the bottom this session.'}
              </span>
              <span className="tabular-nums">
                {doneCount} / {KEYS.length} {calibrates ? 'calibrated' : 'bottomed out'}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
