import { useEffect, useMemo, useState } from 'react'
import { RT_FLAG, RT_LIMITS, decodeRT, rtEnabled, withRT, type KeyRT } from '../hid/codec'
import { KEYS } from '../data/layout'
import { useStore } from '../store'
import { Keyboard, SelectionBar } from './Keyboard'
import { SensorPanel } from './SensorPanel'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Field, Slider, SwitchRow } from './ui'

const mm = (v: number) => (v / 100).toFixed(2)

/** Most common value across the selection, so mixed selections show something sensible. */
function mode<T>(values: T[]): T {
  const counts = new Map<T, number>()
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1))
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export function PerformancePanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const [selected, setSelected] = useState<Set<number>>(() => new Set(KEYS.map((k) => k.id)))
  const [separate, setSeparate] = useState(false)

  const ids = [...selected]
  const sel = useMemo(() => ids.map((id) => decodeRT(regions.rt, id)), [regions.rt, selected])
  const cur: KeyRT | null = sel.length
    ? {
        switchType: mode(sel.map((k) => k.switchType)),
        flags: mode(sel.map((k) => k.flags)),
        actuation: mode(sel.map((k) => k.actuation)),
        press: mode(sel.map((k) => k.press)),
        release: mode(sel.map((k) => k.release)),
      }
    : null
  const mixed = (f: keyof KeyRT) => new Set(sel.map((k) => k[f])).size > 1
  const rtOn = cur ? rtEnabled(cur) : false

  useEffect(() => {
    if (cur && cur.press !== cur.release) setSeparate(true)
  }, [cur?.press, cur?.release])

  const patch = (p: Partial<KeyRT>) => ids.length && update('rt', withRT(regions.rt, ids, p))
  const setFlag = (flag: number, on: boolean) => {
    // flags differ per key, so toggle the bit on each key individually
    let rt = regions.rt
    for (const id of ids) {
      const k = decodeRT(rt, id)
      rt = withRT(rt, [id], { flags: on ? k.flags | flag : k.flags & ~flag })
    }
    update('rt', rt)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3">
          <Keyboard
            selected={selected}
            onSelectionChange={setSelected}
            face={(k) => {
              const r = decodeRT(regions.rt, k.id)
              return {
                main: k.label || 'Space',
                sub: (
                  <>
                    {mm(r.actuation)}
                    {rtEnabled(r) && <b className="rt-badge">RT</b>}
                  </>
                ),
                marked: rtEnabled(r),
              }
            }}
          />
          <SelectionBar selected={selected} onChange={setSelected} />
        </CardContent>
      </Card>

      {cur ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Actuation</CardTitle>
              <CardDescription>How far a key travels before it registers.</CardDescription>
            </CardHeader>
            <CardContent>
              <Field
                label="Actuation point"
                value={mixed('actuation') ? 'mixed' : `${mm(cur.actuation)} mm`}
                hint="Lower is faster, but easier to mis-press."
              >
                <Slider min={RT_LIMITS.actuationMin} max={RT_LIMITS.actuationMax} step={1} value={cur.actuation} onChange={(v) => patch({ actuation: v })} />
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>{mm(RT_LIMITS.actuationMin)}</span>
                  <span>{mm((RT_LIMITS.actuationMin + RT_LIMITS.actuationMax) / 2)}</span>
                  <span>{mm(RT_LIMITS.actuationMax)} mm</span>
                </div>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rapid Trigger</CardTitle>
              <CardDescription>Re-triggers as soon as the key moves the set distance in either direction.</CardDescription>
              <CardAction>
                <Switch
                  checked={rtOn}
                  aria-label="Rapid trigger"
                  onCheckedChange={(on) => patch(on ? { press: RT_LIMITS.sensDefault, release: RT_LIMITS.sensDefault } : { press: 0, release: 0 })}
                />
              </CardAction>
            </CardHeader>
            {rtOn && (
              <CardContent className="swap-in flex flex-col gap-5">
                {separate ? (
                  <>
                    <SensSlider label="Press sensitivity" value={cur.press} mixed={mixed('press')} onChange={(v) => patch({ press: v })} />
                    <SensSlider label="Release sensitivity" value={cur.release} mixed={mixed('release')} onChange={(v) => patch({ release: v })} />
                  </>
                ) : (
                  <SensSlider label="Sensitivity" value={cur.press} mixed={mixed('press')} onChange={(v) => patch({ press: v, release: v })} />
                )}
                <div className="flex flex-col">
                  <SwitchRow
                    label="Separate press / release"
                    checked={separate}
                    onChange={(v) => {
                      setSeparate(v)
                      if (!v) patch({ release: cur.press })
                    }}
                  />
                  <SwitchRow
                    label="Continuous rapid trigger"
                    hint="Active across the whole travel, not only below the actuation point."
                    checked={!!(cur.flags & RT_FLAG.continuous)}
                    onChange={(v) => setFlag(RT_FLAG.continuous, v)}
                  />
                  <SwitchRow
                    label="Bottom-out optimisation"
                    hint="Touching the bottom counts as fully pressed, avoiding accidental releases."
                    checked={!!(cur.flags & RT_FLAG.bottom)}
                    onChange={(v) => setFlag(RT_FLAG.bottom, v)}
                  />
                  <SwitchRow
                    label="Rampage mode"
                    hint="Even more extreme precision. Needs stable, well-seated switches."
                    checked={!!(cur.flags & RT_FLAG.rampage)}
                    onChange={(v) => setFlag(RT_FLAG.rampage, v)}
                  />
                </div>
              </CardContent>
            )}
          </Card>
        </>
      ) : (
        <Card className="lg:col-span-2">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">Select one or more keys to edit actuation and rapid trigger.</CardContent>
        </Card>
      )}

      <SensorPanel />
    </div>
  )
}

function SensSlider({ label, value, mixed, onChange }: { label: string; value: number; mixed: boolean; onChange(v: number): void }) {
  return (
    <Field label={label} value={mixed ? 'mixed' : `${mm(value)} mm`}>
      <Slider min={RT_LIMITS.sensMin} max={RT_LIMITS.sensMax} step={1} value={value || RT_LIMITS.sensDefault} onChange={onChange} />
    </Field>
  )
}

