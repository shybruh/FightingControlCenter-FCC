import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcwIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { hidFromCode } from '../data/keycodes'
import { KEYS, type KeyDef } from '../data/layout'
import { Keyboard } from './Keyboard'
import { Stat } from './ui'

// Key tester: every key that registers turns green; keys that never did are listed. A press that follows its own
// release within a few milliseconds is "chatter", the switch fault behind double-typed letters. Works with any board
// (it listens to the keys Windows receives), including the ones FCC can't show key travel for.

/** a new press this soon after the release is the switch bouncing, not a finger */
const CHATTER_MS = 30

interface KeyStats {
  presses: number
  chatter: number
  lastUp: number
  downAt: number | null
  lastHold: number | null
}

const fresh = (): KeyStats => ({ presses: 0, chatter: 0, lastUp: -Infinity, downAt: null, lastHold: null })

/** Keys Windows can report: everything with a HID usage (Fn and underglow lights have none). */
const testable = (k: KeyDef) => k.hid > 0 && !k.light

export function KeyTestPanel() {
  const stats = useRef(new Map<number, KeyStats>())
  const [, redraw] = useState(0)
  const [last, setLast] = useState<{ id: number; code: string } | null>(null)
  const byHid = useMemo(() => {
    const m = new Map<number, number[]>()
    for (const k of KEYS) if (testable(k)) m.set(k.hid, [...(m.get(k.hid) ?? []), k.id])
    return m
  }, [])

  useEffect(() => {
    const ids = (e: KeyboardEvent) => byHid.get(hidFromCode(e.code) ?? -1) ?? []
    const statsOf = (id: number) => {
      if (!stats.current.has(id)) stats.current.set(id, fresh())
      return stats.current.get(id)!
    }
    const onDown = (e: KeyboardEvent) => {
      // the keys belong to the test while this page is open: no reload on F5, no focus moving on Tab, no Alt menu
      e.preventDefault()
      if (e.repeat) return
      const now = performance.now()
      for (const id of ids(e)) {
        const s = statsOf(id)
        s.presses++
        if (now - s.lastUp < CHATTER_MS) s.chatter++
        s.downAt = now
        setLast({ id, code: e.code })
      }
      redraw((n) => n + 1)
    }
    const onUp = (e: KeyboardEvent) => {
      e.preventDefault()
      const now = performance.now()
      for (const id of ids(e)) {
        const s = statsOf(id)
        // Windows sends Print Screen's release only: count it as a press
        if (s.downAt === null && s.presses === 0) s.presses = 1
        if (s.downAt !== null) s.lastHold = now - s.downAt
        s.downAt = null
        s.lastUp = now
        setLast({ id, code: e.code })
      }
      redraw((n) => n + 1)
    }
    // switching windows mid-press would leave keys "held"
    const onBlur = () => {
      for (const s of stats.current.values()) s.downAt = null
      redraw((n) => n + 1)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [byHid])

  const reset = () => {
    stats.current.clear()
    setLast(null)
    redraw((n) => n + 1)
  }

  const keys = KEYS.filter(testable)
  const tested = keys.filter((k) => (stats.current.get(k.id)?.presses ?? 0) > 0)
  const missing = keys.filter((k) => !stats.current.get(k.id)?.presses)
  const chattering = keys.filter((k) => (stats.current.get(k.id)?.chatter ?? 0) > 0)
  const lastKey = last ? KEYS.find((k) => k.id === last.id) : null
  const lastStats = last ? stats.current.get(last.id) : undefined

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle>Key test</CardTitle>
          <CardDescription>Press every key once. Keys turn green when they register and light up while held.</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={reset}>
              <RotateCcwIcon data-icon="inline-start" />
              Start over
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Keyboard
            tintMix={100}
            selected={new Set()}
            onSelectionChange={() => {}}
            onKeyClick={() => {}}
            face={(k) => {
              const s = stats.current.get(k.id)
              if (!testable(k)) return { tint: 'transparent' }
              if (s?.downAt != null) return { tint: 'rgb(212 212 212)' }
              if (s?.chatter) return { tint: 'rgb(180 83 9)', marked: true }
              if (s?.presses) return { tint: 'rgb(21 128 61)' }
              return {}
            }}
          />
          <p className="text-xs text-muted-foreground">
            Fn works inside the keyboard, so Windows (and this test) never sees it. The Windows key may open the Start menu, and global shortcuts
            (FCC's own Ctrl+Alt+1…9 included) still run.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {tested.length} of {keys.length} keys registered
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Progress value={keys.length ? (tested.length / keys.length) * 100 : 0} />
          {missing.length === 0 ? (
            <p className="text-sm text-emerald-400">Every key registered.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Not pressed yet</span>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-auto">
                {missing.map((k) => (
                  <Badge key={k.id} variant="secondary" className="font-mono">
                    {k.label || 'Space'}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Chatter</CardTitle>
          <CardDescription>A key that registers twice within {CHATTER_MS} ms of letting go: the cause of double-typed letters.</CardDescription>
        </CardHeader>
        <CardContent>
          {chattering.length === 0 ? (
            <p className="text-sm text-muted-foreground">None so far.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {chattering.map((k) => (
                <Stat key={k.id} label={k.label || 'Space'}>
                  <span className="text-amber-400">
                    {stats.current.get(k.id)!.chatter}× in {stats.current.get(k.id)!.presses} presses
                  </span>
                </Stat>
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                Now and then is normal on a fast double tap. If one key keeps doing it, clean or replace that switch, or check your keyboard's debounce
                setting.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last key</CardTitle>
          <CardDescription>What Windows reported.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lastKey && last ? (
            <>
              <div className="text-2xl font-semibold tracking-tight">{lastKey.label || 'Space'}</div>
              <Separator />
              <Stat label="Code">
                <span className="font-mono text-xs">{last.code}</span>
              </Stat>
              <Stat label="HID usage">
                <span className="font-mono text-xs">0x{lastKey.hid.toString(16).padStart(2, '0')}</span>
              </Stat>
              <Stat label="Presses">{lastStats?.presses ?? 0}</Stat>
              <Stat label="Last hold">{lastStats?.lastHold != null ? `${Math.round(lastStats.lastHold)} ms` : '—'}</Stat>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Press any key.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
