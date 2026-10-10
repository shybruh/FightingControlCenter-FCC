import { useState } from 'react'
import {
  ADVANCED_TYPES,
  MAX_ADVANCED,
  SOCD_MODES,
  TYPE_INFO,
  clearAdvanced,
  entryFor,
  listAdvanced,
  type AdvancedEntry,
  type AdvancedType,
} from '../hid/advanced'
import {
  DKS_DEFAULT_POINTS,
  DKS_POINT_MAX,
  DKS_POINT_MIN,
  freeDksSlot,
  withBinding,
  withDks,
  type DksAction,
  type DksSlot,
} from '../hid/codec'
import { hidName } from '../data/keycodes'
import { KEY_BY_ID, isFnKey } from '../data/layout'
import { useStore } from '../store'
import { Keyboard } from './Keyboard'
import { KeyPicker } from './KeyPicker'
import { ArrowLeftRightIcon, CircleIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Field, Slider } from './ui'


interface Draft {
  type: AdvancedType
  ids: number[]
  /** ids of the entry being edited, cleared on save */
  editing: number[]
  mode: number
  hold: number
  tap: number
  ms: number
  code: number
  dks: DksSlot
}

const keyName = (id: number) => KEY_BY_ID.get(id)?.label || 'Space'
const nativeHid = (id: number) => KEY_BY_ID.get(id)?.hid ?? 0

function defaultDks(hid: number): DksSlot {
  return {
    points: [...DKS_DEFAULT_POINTS],
    keys: [hid, 0, 0, 0],
    actions: [
      ['hold', 'hold', 'hold', 'none'],
      ['none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none'],
      ['none', 'none', 'none', 'none'],
    ],
  }
}

function newDraft(type: AdvancedType, ids: number[]): Draft {
  const hid = ids[0] != null ? nativeHid(ids[0]) : 0
  return { type, ids, editing: [], mode: 3, hold: 0, tap: hid, ms: 400, code: hid, dks: defaultDks(hid) }
}

function draftFromEntry(e: AdvancedEntry): Draft {
  const d = newDraft(e.type, e.ids)
  d.editing = e.ids
  const b = e.binding
  if (b.type === 'socd') d.mode = b.mode
  if (b.type === 'modtap') Object.assign(d, { hold: b.hold, tap: b.tap, ms: b.ms })
  if (b.type === 'toggle') d.code = b.code
  if (e.dks) d.dks = structuredClone(e.dks)
  return d
}

function describe(e: AdvancedEntry): string {
  const b = e.binding
  switch (b.type) {
    case 'rs':
      return `${keyName(e.ids[0])} ⇄ ${keyName(e.ids[1] ?? e.ids[0])}`
    case 'socd':
      return `${keyName(e.ids[0])} ⇄ ${keyName(e.ids[1] ?? e.ids[0])} · ${SOCD_MODES.find((m) => m.value === b.mode)?.label ?? `mode ${b.mode}`}`
    case 'modtap':
      return `${keyName(e.ids[0])}: tap ${hidName(b.tap)}, hold ${hidName(b.hold)} (${b.ms} ms)`
    case 'toggle':
      return `${keyName(e.ids[0])}: toggles ${hidName(b.code)}`
    case 'dks':
      return `${keyName(e.ids[0])}: ${e.dks?.keys.filter(Boolean).map(hidName).join(', ') || 'empty'}`
    default:
      return keyName(e.ids[0])
  }
}

export function AdvancedPanel() {
  const regions = useStore((s) => s.regions)!
  const updateMany = useStore((s) => s.updateMany)
  const kinds = useStore((s) => s.device?.caps.advanced)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const entries = listAdvanced(regions.keys, regions.dks)

  const clickKey = (id: number) => {
    setError(null)
    if (isFnKey(KEY_BY_ID.get(id))) return setError('The Fn key can’t hold an advanced function.')
    if (draft) {
      const pair = TYPE_INFO[draft.type].keys === 2
      if (pair) {
        const ids = draft.ids.includes(id) ? draft.ids.filter((x) => x !== id) : [...draft.ids, id].slice(-2)
        setDraft({ ...draft, ids })
      } else if (!draft.editing.length) {
        setDraft({ ...newDraft(draft.type, [id]), mode: draft.mode, ms: draft.ms })
      } else {
        setDraft({ ...draft, ids: [id] })
      }
      return
    }
    const existing = entryFor(regions.keys, regions.dks, id)
    if (existing) {
      setDraft(draftFromEntry(existing))
      setPicked(null)
    } else {
      setPicked(picked === id ? null : id)
    }
  }

  const start = (type: AdvancedType) => {
    setError(null)
    setDraft(newDraft(type, picked != null ? [picked] : []))
    setPicked(null)
  }

  const save = () => {
    if (!draft) return
    const need = TYPE_INFO[draft.type].keys
    if (draft.ids.length !== need) return setError(`Select ${need} key${need > 1 ? 's' : ''} on the keyboard.`)
    const replacing = new Set(
      [...draft.ids, ...draft.editing].flatMap((id) => entryFor(regions.keys, regions.dks, id)?.ids.join('-') ?? []),
    )
    if (entries.length - replacing.size + 1 > MAX_ADVANCED) return setError(`A profile can hold at most ${MAX_ADVANCED} advanced keys.`)

    let { keys, dks } = clearAdvanced(regions.keys, regions.dks, [...draft.ids, ...draft.editing])
    const [a, b] = draft.ids
    switch (draft.type) {
      case 'rs':
        keys = withBinding(keys, draft.ids, { type: 'rs', key1: nativeHid(a), key2: nativeHid(b) })
        break
      case 'socd':
        keys = withBinding(keys, draft.ids, { type: 'socd', mode: draft.mode, key1: nativeHid(a), key2: nativeHid(b) })
        break
      case 'modtap':
        if (!draft.tap || !draft.hold) return setError('Pick both a tap key and a hold key.')
        keys = withBinding(keys, [a], { type: 'modtap', hold: draft.hold, tap: draft.tap, ms: draft.ms })
        break
      case 'toggle':
        if (!draft.code) return setError('Pick the key to toggle.')
        keys = withBinding(keys, [a], { type: 'toggle', code: draft.code })
        break
      case 'dks': {
        const used = draft.dks.keys.some((k, m) => k && draft.dks.actions[m].some((x) => x !== 'none'))
        if (!used) return setError('Give at least one key an action.')
        const slot = freeDksSlot(dks)
        if (slot === null) return setError('No free DKS slots left.')
        dks = withDks(dks, slot, draft.dks)
        keys = withBinding(keys, [a], { type: 'dks', slot })
        break
      }
    }
    updateMany({ dks, keys })
    setDraft(null)
    setError(null)
  }

  const remove = (ids: number[]) => {
    const { keys, dks } = clearAdvanced(regions.keys, regions.dks, ids)
    updateMany({ dks, keys })
    setDraft(null)
  }

  const highlighted = new Set(draft ? draft.ids : picked != null ? [picked] : [])

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <Keyboard
            selected={highlighted}
            onSelectionChange={() => {}}
            onKeyClick={clickKey}
            face={(k) => {
              const e = entries.find((x) => x.ids.includes(k.id))
              return e ? { main: TYPE_INFO[e.type].short, sub: k.label || 'Space', marked: true } : {}
            }}
          />
          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {draft
                ? TYPE_INFO[draft.type].keys === 2
                  ? `Select 2 keys · ${draft.ids.map(keyName).join(' + ') || 'none yet'}`
                  : `Key: ${draft.ids.map(keyName).join('') || 'click a key'}`
                : 'Click a key to edit its advanced function, or pick a type below.'}
            </span>
            <span className="tabular-nums">
              {entries.length} / {MAX_ADVANCED} advanced keys
            </span>
          </div>
        </CardContent>
      </Card>

      {draft ? (
        <Card key={`${draft.type}-${draft.editing.join('-')}`} className="swap-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge variant="secondary">{TYPE_INFO[draft.type].short}</Badge>
              {TYPE_INFO[draft.type].name}
              {draft.editing.length > 0 && <span className="font-normal text-muted-foreground">· editing</span>}
            </CardTitle>
            <CardDescription>{TYPE_INFO[draft.type].desc}</CardDescription>
            <CardAction className="flex gap-2">
              {draft.editing.length > 0 && (
                <Button variant="destructive" onClick={() => remove(draft.editing)}>
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button onClick={save}>Save to keyboard</Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Editor draft={draft} setDraft={setDraft} />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{picked != null ? `Add to ${keyName(picked)}` : 'Add an advanced key'}</CardTitle>
              {error && <CardDescription className="text-destructive">{error}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {ADVANCED_TYPES.filter((t) => !kinds || kinds.includes(t)).map((t) => (
                  <button
                    key={t}
                    className="lift flex flex-col items-start gap-2 rounded-lg border p-3 text-left text-sm hover:bg-muted/50"
                    onClick={() => start(t)}
                  >
                    <Badge variant="secondary">{TYPE_INFO[t].short}</Badge>
                    <span className="font-medium">{TYPE_INFO[t].name}</span>
                    <span className="text-xs text-muted-foreground">{TYPE_INFO[t].desc}</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>On this profile</CardTitle>
            </CardHeader>
            <CardContent>
              {entries.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No advanced keys yet.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {entries.map((e) => (
                    <li key={e.ids.join('-')} className="flex items-center gap-3 py-2">
                      <Badge variant="secondary" className="w-12">
                        {TYPE_INFO[e.type].short}
                      </Badge>
                      <span className="flex-1 truncate text-sm">{describe(e)}</span>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(draftFromEntry(e))}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(e.ids)}>
                        Delete
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function Editor({ draft, setDraft }: { draft: Draft; setDraft(d: Draft): void }) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p })
  switch (draft.type) {
    case 'rs':
      return (
        <PairKeys ids={draft.ids}>
          <p className="text-xs text-muted-foreground">Tip: turn on Rapid Trigger for both keys in the Performance tab for the snappiest switching.</p>
        </PairKeys>
      )
    case 'socd':
      return (
        <PairKeys ids={draft.ids}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SOCD_MODES.filter((m) => useStore.getState().device?.caps.socdModes.includes(m.value) ?? true).map((m) => (
              <button
                key={m.value}
                className={cn(
                  'lift flex flex-col gap-1 rounded-lg border p-3 text-left text-sm hover:bg-muted/50',
                  draft.mode === m.value && 'border-primary bg-muted/60',
                )}
                onClick={() => set({ mode: m.value })}
              >
                <span className="font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.hint}</span>
              </button>
            ))}
          </div>
        </PairKeys>
      )
    case 'modtap':
      return (
        <div className="grid items-start gap-6 sm:grid-cols-3">
          <Field label="Tap">
            <KeyPicker value={draft.tap} onChange={(tap) => set({ tap })} />
          </Field>
          <Field label="Hold">
            <KeyPicker value={draft.hold} onChange={(hold) => set({ hold })} />
          </Field>
          <Field label="Hold time" value={`${draft.ms} ms`} hint="How long the key must be held to count as a hold.">
            <Slider min={10} max={1000} step={10} value={draft.ms} onChange={(ms) => set({ ms })} />
          </Field>
        </div>
      )
    case 'toggle':
      return (
        <Field label="Key to toggle">
          <div>
            <KeyPicker value={draft.code} onChange={(code) => set({ code })} />
          </div>
        </Field>
      )
    case 'dks':
      return <DksEditor slot={draft.dks} onChange={(dks) => set({ dks })} />
  }
}

function PairKeys({ ids, children }: { ids: number[]; children?: React.ReactNode }) {
  const slot = (i: number) => (
    <div
      className={cn(
        'flex min-w-32 flex-col gap-0.5 rounded-lg border px-4 py-2.5',
        ids[i] != null ? 'border-primary' : 'border-dashed text-muted-foreground',
      )}
    >
      <span className="text-xs text-muted-foreground">Key {i + 1}</span>
      <span className="font-medium">{ids[i] != null ? keyName(ids[i]) : 'Click a key'}</span>
    </div>
  )
  return (
    <>
      <div className="flex items-center gap-3">
        {slot(0)}
        <ArrowLeftRightIcon className="size-4 text-muted-foreground" />
        {slot(1)}
      </div>
      {children}
    </>
  )
}

const STAGES = [
  { label: 'Press', hint: 'key starts going down' },
  { label: 'Bottom', hint: 'fully pressed' },
  { label: 'Lift', hint: 'rising from bottom' },
  { label: 'Release', hint: 'fully released' },
]

function DksEditor({ slot, onChange }: { slot: DksSlot; onChange(s: DksSlot): void }) {
  const cycle = (m: number, j: number) => {
    const order: DksAction[] = j === 3 ? ['none', 'tap'] : ['none', 'tap', 'hold']
    const cur = slot.actions[m][j]
    const next = order[(order.indexOf(cur) + 1) % order.length]
    const actions = slot.actions.map((row) => [...row])
    actions[m][j] = next
    onChange({ ...slot, actions })
  }

  return (
    <div className="flex flex-col gap-3 overflow-x-auto">
      <div className="grid min-w-[560px] grid-cols-[minmax(7rem,9rem)_repeat(4,minmax(7rem,1fr))] gap-y-2">
        <div className="self-end pb-2 text-xs text-muted-foreground">Trigger point</div>
        {STAGES.map((s, j) => (
          <div key={s.label} className="flex flex-col gap-1 border-l px-3 pb-3">
            <span className="text-sm font-medium">{s.label}</span>
            <span className="text-xs text-muted-foreground">{s.hint}</span>
            <span className="text-sm tabular-nums">{(slot.points[j] / 10).toFixed(1)} mm</span>
            <Slider
              min={DKS_POINT_MIN}
              max={DKS_POINT_MAX}
              value={slot.points[j]}
              onChange={(v) => {
                const points = [...slot.points] as DksSlot['points']
                points[j] = v
                onChange({ ...slot, points })
              }}
            />
          </div>
        ))}

        {slot.keys.map((hid, m) => (
          <div key={m} className="contents">
            <KeyPicker
              value={hid}
              allowClear
              placeholder={`Key ${m + 1}`}
              onChange={(v) => {
                const keys = [...slot.keys] as DksSlot['keys']
                keys[m] = v
                onChange({ ...slot, keys })
              }}
            />
            {slot.actions[m].map((a, j) => (
              <button
                key={j}
                disabled={!hid}
                onClick={() => cycle(m, j)}
                title={a === 'hold' ? 'Held until the next stage' : a === 'tap' ? 'Tapped at this stage' : 'No action'}
                className={cn(
                  'relative mx-3 flex h-9 items-center justify-center rounded-md border text-sm transition-colors disabled:opacity-30',
                  a === 'none' && 'border-dashed text-muted-foreground hover:bg-muted/50',
                  a === 'tap' && 'border-primary text-foreground',
                  a === 'hold' && 'border-primary bg-primary',
                  // holds visually bridge into the next stage
                  a === 'hold' && j < 3 && 'after:absolute after:top-1/2 after:left-full after:h-2 after:w-[calc(1.5rem+2px)] after:-translate-y-1/2 after:bg-primary',
                )}
              >
                {a === 'tap' ? <CircleIcon className="size-2.5 fill-current" /> : a === 'none' ? '·' : null}
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Click a cell to cycle: nothing → tap → hold. A hold keeps the key down until the next stage; chain holds to keep it down longer.
      </p>
    </div>
  )
}
