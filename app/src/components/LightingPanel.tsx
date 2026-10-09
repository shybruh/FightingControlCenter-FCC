import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { SaveIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CUSTOM_EFFECT, EFFECTS, decodeColor, decodeLed, encodeLed, withColor, withColorMap, type Led } from '../hid/codec'
import { hidFromCode } from '../data/keycodes'
import { KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH } from '../data/layout'
import { COLOR_PRESETS, presetColors, type ColorPreset } from '../lighting/presets'
import { REACTIVE, renderEffect, rgbCss, type PressEvent, type RGB } from '../lighting/preview'
import { useStore } from '../store'
import { Keyboard, SelectionBar } from './Keyboard'
import { Field, Segmented, Slider } from './ui'

const SWATCHES = ['#ffffff', '#ff2d55', '#ff9500', '#ffd60a', '#34c759', '#00e5ff', '#0a84ff', '#bf5af2', '#ff4fd8']
const SAVED_KEY = 'fcc.lightPresets.v1'
const FRAME_MS = 40

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
const rgb = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]

interface SavedPreset {
  id: string
  name: string
  led: number[]
  colors: number[]
}

function loadSaved(): SavedPreset[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
  } catch {
    return []
  }
}

/** Animates the on-screen keyboard like the real one; reactive effects follow key presses in this window. */
function useLedPreview(led: Led, colors: Uint8Array, paused: boolean) {
  const [frame, setFrame] = useState<Map<number, RGB>>(new Map())
  const presses = useRef<PressEvent[]>([])
  const t0 = useRef(performance.now())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof Element && e.target.closest('input, textarea'))) return
      const hid = hidFromCode(e.code)
      const key = KEYS.find((k) => k.hid === hid)
      if (key) presses.current = [...presses.current.slice(-30), { id: key.id, at: (performance.now() - t0.current) / 1000 }]
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const custom = (id: number) => decodeColor(colors, id) as RGB
    const draw = () => setFrame(renderEffect(led, (performance.now() - t0.current) / 1000, presses.current, custom))
    draw()
    if (paused || led.effect === 0) return
    const timer = setInterval(draw, FRAME_MS)
    return () => clearInterval(timer)
  }, [led, colors, paused])

  return frame
}

export function LightingPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const updateMany = useStore((s) => s.updateMany)
  const led = useMemo(() => decodeLed(regions.led), [regions.led])
  const lastEffect = useRef(led.effect || 0x01)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [paint, setPaint] = useState('#00e5ff')

  const on = led.effect !== 0
  if (on) lastEffect.current = led.effect
  const effect = EFFECTS.find((e) => e.id === led.effect)
  const custom = led.effect === CUSTOM_EFFECT
  const set = (patch: Partial<Led>) => update('led', encodeLed(regions.led, { ...led, ...patch }))
  const paintKeys = (ids: number[], color: string) => ids.length && update('colors', withColor(regions.colors, ids, rgb(color)))

  const applyDesign = (p: ColorPreset) =>
    updateMany({
      colors: withColorMap(regions.colors, presetColors(p)),
      led: encodeLed(regions.led, { ...led, effect: CUSTOM_EFFECT, brightness: led.brightness || 5 }),
    })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardContent className="flex flex-col gap-3">
          <LivePreview led={led} colors={regions.colors} selected={selected} onSelectionChange={setSelected} />
          {custom ? (
            <SelectionBar selected={selected} onChange={setSelected} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Live preview of the effect.{REACTIVE.has(led.effect) && ' It reacts to key presses while this window is focused.'}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Effect</CardTitle>
          <CardDescription>{on ? effect?.name ?? 'Unknown effect' : 'Lighting is off'}</CardDescription>
          <CardAction>
            <Switch checked={on} onCheckedChange={(v) => set({ effect: v ? lastEffect.current : 0 })} aria-label="Lighting" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className={cn('grid grid-cols-2 gap-1.5 sm:grid-cols-3', !on && 'pointer-events-none opacity-40')}>
            {EFFECTS.map((e) => (
              <Button
                key={e.id}
                variant={led.effect === e.id ? 'secondary' : 'ghost'}
                className={cn('justify-start', led.effect === e.id && 'ring-1 ring-ring')}
                onClick={() => set({ effect: e.id })}
              >
                {e.name}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{custom ? 'Paint keys' : 'Settings'}</CardTitle>
          <CardDescription>{custom ? 'Select keys on the keyboard, pick a color, paint.' : 'Brightness, speed and color for the current effect.'}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Brightness" value={`${led.brightness}/5`}>
            <Slider min={1} max={5} value={led.brightness || 1} onChange={(v) => set({ brightness: v })} disabled={!on} />
          </Field>

          {effect?.speed && (
            <Field label="Speed" value={`${led.speed}/5`}>
              <Slider min={1} max={5} value={led.speed || 1} onChange={(v) => set({ speed: v })} disabled={!on} />
            </Field>
          )}

          {effect?.direction && (
            <Field label="Direction">
              <Segmented
                value={led.direction}
                options={[
                  { value: 0, label: 'Forward' },
                  { value: 1, label: 'Reverse' },
                ]}
                onChange={(v) => set({ direction: v })}
              />
            </Field>
          )}

          {effect?.color && (
            <Field label="Color">
              <Segmented
                value={led.rainbow ? 1 : 0}
                options={[
                  { value: 0, label: 'Single color' },
                  { value: 1, label: 'Rainbow' },
                ]}
                onChange={(v) => set({ rainbow: v === 1 })}
              />
              {!led.rainbow && (
                <ColorPicker
                  value={hex(led.r, led.g, led.b)}
                  onChange={(h) => {
                    const [r, g, b] = rgb(h)
                    set({ r, g, b, rainbow: false })
                  }}
                />
              )}
            </Field>
          )}

          {custom && (
            <Field label="Paint color">
              <ColorPicker value={paint} onChange={setPaint} />
              <div className="flex flex-wrap gap-2">
                <Button disabled={!selected.size} onClick={() => paintKeys([...selected], paint)}>
                  Paint {selected.size || ''} selected
                </Button>
                <Button variant="outline" onClick={() => paintKeys(KEYS.map((k) => k.id), paint)}>
                  Fill all
                </Button>
                <Button variant="ghost" disabled={!selected.size} onClick={() => paintKeys([...selected], '#000000')}>
                  Turn off selected
                </Button>
              </div>
            </Field>
          )}
        </CardContent>
      </Card>

      <PresetsCard onApplyDesign={applyDesign} />
    </div>
  )
}

/** The animated keyboard. Kept separate so animation frames only re-render this component. */
function LivePreview({
  led,
  colors,
  selected,
  onSelectionChange,
}: {
  led: Led
  colors: Uint8Array
  selected: Set<number>
  onSelectionChange(s: Set<number>): void
}) {
  const custom = led.effect === CUSTOM_EFFECT
  // while painting, show the true colours without animation so selection is easy to read
  const frame = useLedPreview(led, colors, custom)
  return (
    <Keyboard
      tintMix={88}
      selected={custom ? selected : new Set()}
      onSelectionChange={(s) => custom && onSelectionChange(s)}
      face={(k) => {
        const c = frame.get(k.id)
        return { tint: led.effect !== 0 && c ? rgbCss(c) : 'rgb(0 0 0)' }
      }}
    />
  )
}

function PresetsCard({ onApplyDesign }: { onApplyDesign(p: ColorPreset): void }) {
  const regions = useStore((s) => s.regions)!
  const updateMany = useStore((s) => s.updateMany)
  const showToast = useStore((s) => s.showToast)
  const [tab, setTab] = useState<'designs' | 'saved'>('designs')
  const [saved, setSaved] = useState<SavedPreset[]>(loadSaved)
  const [name, setName] = useState('')

  const persist = (list: SavedPreset[]) => {
    setSaved(list)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list))
    } catch {
      /* storage unavailable: keep in memory */
    }
  }

  const saveCurrent = () => {
    const n = name.trim() || `Lighting ${saved.length + 1}`
    persist([...saved, { id: Math.random().toString(36).slice(2, 9), name: n, led: Array.from(regions.led), colors: Array.from(regions.colors) }])
    setName('')
    showToast(`Saved “${n}”`)
  }

  const designs = useMemo(() => COLOR_PRESETS.map((p) => ({ preset: p, colors: presetColors(p) })), [])

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Presets</CardTitle>
        <CardDescription>
          {tab === 'designs'
            ? 'Per-key color designs. Applying one switches to the custom per-key effect; you can tweak it with Paint keys afterwards.'
            : 'Your saved lighting setups: effect, color, speed and per-key paint.'}
        </CardDescription>
        <CardAction>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'designs' | 'saved')}>
            <TabsList>
              <TabsTrigger value="designs">Designs</TabsTrigger>
              <TabsTrigger value="saved">Saved{saved.length ? ` (${saved.length})` : ''}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tab === 'designs' ? (
          <div key="designs" className="swap-in grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {designs.map(({ preset, colors }) => (
              <button
                key={preset.id}
                className="lift group flex flex-col gap-2 rounded-lg border p-2 text-left hover:bg-muted/50"
                onClick={() => onApplyDesign(preset)}
              >
                <MiniBoard color={(id) => colors.get(id) ?? [0, 0, 0]} />
                <span className="px-1 text-sm font-medium">{preset.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div key="saved" className="swap-in flex flex-col gap-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                saveCurrent()
              }}
            >
              <Input placeholder="Name this lighting…" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
              <Button type="submit" variant="outline">
                <SaveIcon data-icon="inline-start" />
                Save current
              </Button>
            </form>
            {saved.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nothing saved yet. Set up lighting you like, then save it here.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {saved.map((p) => {
                  const l = decodeLed(Uint8Array.from(p.led))
                  const cols = Uint8Array.from(p.colors)
                  const preview = renderEffect(l, 1.2, [], (id) => decodeColor(cols, id) as RGB)
                  const effectName = l.effect === 0 ? 'Off' : (EFFECTS.find((e) => e.id === l.effect)?.name ?? 'Effect')
                  return (
                    <div key={p.id} className="lift group relative flex flex-col gap-2 rounded-lg border p-2 hover:bg-muted/50">
                      <button
                        className="flex flex-col gap-2 text-left"
                        onClick={() => {
                          updateMany({ colors: cols, led: Uint8Array.from(p.led) })
                          showToast(`Applied “${p.name}”`)
                        }}
                      >
                        <MiniBoard color={(id) => (l.effect === 0 ? [0, 0, 0] : (preview.get(id) ?? [0, 0, 0]))} />
                        <span className="flex flex-col px-1">
                          <span className="truncate text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{effectName}</span>
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="absolute right-2 bottom-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => persist(saved.filter((x) => x.id !== p.id))}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Tiny static keyboard thumbnail. */
function MiniBoard({ color }: { color(id: number): RGB }) {
  return (
    <div className="relative w-full rounded-md bg-black/40" style={{ aspectRatio: `${LAYOUT_WIDTH} / ${LAYOUT_HEIGHT}` } as CSSProperties}>
      {KEYS.map((k) => (
        <span
          key={k.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${(k.x / LAYOUT_WIDTH) * 100}%`,
            top: `${(k.y / LAYOUT_HEIGHT) * 100}%`,
            width: `${(k.w / LAYOUT_WIDTH) * 100}%`,
            height: `${100 / LAYOUT_HEIGHT}%`,
            padding: '1px',
          }}
        >
          <span className="block size-full rounded-[2px]" style={{ background: rgbCss(color(k.id)) }} />
        </span>
      ))}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange(hex: string): void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="relative size-9 shrink-0 cursor-pointer rounded-md border" style={{ background: value }}>
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Pick color" />
      </label>
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((s) => (
          <button
            key={s}
            className={cn('size-6 rounded-full border border-border transition-transform hover:scale-110', s === value.toLowerCase() && 'ring-2 ring-ring ring-offset-2 ring-offset-card')}
            style={{ background: s }}
            onClick={() => onChange(s)}
            aria-label={s}
          />
        ))}
      </div>
      <Input
        className="w-24 font-mono text-xs uppercase"
        key={value}
        defaultValue={value}
        onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && onChange(e.target.value.toLowerCase())}
        spellCheck={false}
      />
    </div>
  )
}
