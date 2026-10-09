import { useEffect, useMemo, useRef, useState } from 'react'
import { clearAdvanced } from '../hid/advanced'
import {
  MACRO_INDEX_BYTES,
  MACRO_MAX,
  MACRO_REGION,
  decodeBinding,
  decodeInfo,
  decodeMacros,
  encodeMacros,
  remapMacroBindings,
  withBinding,
  type MacroEvent,
} from '../hid/codec'
import { hidFromCode, hidName } from '../data/keycodes'
import { KEY_BY_ID, isFnKey } from '../data/layout'
import { useStore } from '../store'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  CopyIcon,
  MouseIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Keyboard } from './Keyboard'
import { KeyPicker } from './KeyPicker'
import { Segmented } from './ui'

interface DraftMacro {
  uid: string
  /** index on the keyboard when loaded, null for new macros */
  orig: number | null
  name: string
  events: MacroEvent[]
}

const MOUSE = [
  { code: 1, label: 'Left click' },
  { code: 2, label: 'Right click' },
  { code: 4, label: 'Middle click' },
]
const eventName = (e: MacroEvent) => (e.mouse ? MOUSE.find((m) => m.code === e.code)?.label ?? `Mouse ${e.code}` : hidName(e.code))
const uid = () => Math.random().toString(36).slice(2, 9)
const keyName = (id: number) => KEY_BY_ID.get(id)?.label || 'Space'

function load(buf: Uint8Array, names: string[] = []): DraftMacro[] {
  return decodeMacros(buf).map((events, i) => ({ uid: uid(), orig: i, name: names[i] || `Macro ${i + 1}`, events }))
}

export function MacroPanel() {
  const regions = useStore((s) => s.regions)!
  const updateMany = useStore((s) => s.updateMany)
  const setMacroNames = useStore((s) => s.setMacroNames)
  const names = useStore((s) => s.profiles.find((p) => p.id === s.activeProfileId)?.meta?.macroNames)
  const activeId = useStore((s) => s.activeProfileId)

  const [draft, setDraft] = useState<DraftMacro[]>(() => load(regions.macros, names))
  const [dirty, setDirty] = useState(false)
  const [sel, setSel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Reload when the keyboard data changes underneath us (profile switch, re-read) and there are no local edits.
  const lastLoaded = useRef(regions.macros)
  useEffect(() => {
    if (regions.macros !== lastLoaded.current && !dirty) {
      lastLoaded.current = regions.macros
      setDraft(load(regions.macros, names))
    }
  }, [regions.macros, dirty, names])

  // Unsaved edits belong to the profile they were made on; drop them when the profile changes.
  const lastProfile = useRef(activeId)
  useEffect(() => {
    if (activeId === lastProfile.current) return
    lastProfile.current = activeId
    lastLoaded.current = regions.macros
    setDraft(load(regions.macros, names))
    setDirty(false)
    setSel(0)
  }, [activeId, regions.macros, names])

  const capacity = Math.min(decodeInfo(regions.info).macroCapacity || MACRO_REGION, MACRO_REGION)
  const used = MACRO_INDEX_BYTES + draft.reduce((n, m) => n + 4 + m.events.length * 4, 0)
  const cur = draft[sel] as DraftMacro | undefined

  const edit = (fn: (d: DraftMacro[]) => DraftMacro[]) => {
    setDraft((d) => fn(d))
    setDirty(true)
    setError(null)
  }
  const editCur = (fn: (m: DraftMacro) => DraftMacro) => edit((d) => d.map((m, i) => (i === sel ? fn(m) : m)))

  /** Writes the macro table and fixes key bindings whose macro moved or was deleted. Returns the saved list. */
  const save = (list = draft): boolean => {
    let bytes: Uint8Array
    try {
      bytes = encodeMacros(list.map((m) => m.events), capacity)
    } catch (e) {
      setError((e as Error).message)
      return false
    }
    const keys = remapMacroBindings(regions.keys, (old) => {
      const i = list.findIndex((m) => m.orig === old)
      return i < 0 ? null : i
    })
    lastLoaded.current = bytes
    updateMany({ macros: bytes, keys })
    setMacroNames(list.map((m) => m.name))
    setDraft(list.map((m, i) => ({ ...m, orig: i })))
    setDirty(false)
    return true
  }

  const discard = () => {
    setDraft(load(regions.macros, names))
    setDirty(false)
    setError(null)
  }

  const add = () => {
    if (draft.length >= MACRO_MAX) return
    edit((d) => [...d, { uid: uid(), orig: null, name: `Macro ${d.length + 1}`, events: [] }])
    setSel(draft.length)
  }

  const remove = (i: number) => {
    edit((d) => d.filter((_, j) => j !== i))
    setSel((s) => Math.max(0, s >= i ? s - 1 : s))
  }

  const duplicate = (i: number) => {
    edit((d) => [...d, { ...structuredClone(d[i]), uid: uid(), orig: null, name: `${d[i].name} copy` }])
    setSel(draft.length)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Macros</CardTitle>
          <CardDescription className="tabular-nums">
            {used} / {capacity} bytes
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" onClick={add} disabled={draft.length >= MACRO_MAX}>
              <PlusIcon data-icon="inline-start" />
              New
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={Math.min(100, (used / capacity) * 100)} className={cn(used > capacity && '[&_[data-slot=progress-indicator]]:bg-destructive')} />
          {draft.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No macros yet.</p>
          ) : (
            <ul className="flex max-h-96 flex-col gap-0.5 overflow-auto">
              {draft.map((m, i) => (
                <li key={m.uid}>
                  <button
                    className={cn(
                      'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted/60',
                      i === sel && 'bg-muted font-medium',
                    )}
                    onClick={() => setSel(i)}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-medium',
                        i === sel ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{m.events.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(dirty || error) && (
            <div className="flex flex-col gap-2 border-t pt-3">
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => save()} disabled={!dirty}>
                  Save to keyboard
                </Button>
                <Button variant="ghost" onClick={discard} disabled={!dirty}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card key={cur?.uid ?? 'empty'} className="swap-in min-w-0">
        {cur ? (
          <MacroEditor
            key={cur.uid}
            macro={cur}
            onChange={(fn) => editCur(fn)}
            onDelete={() => remove(sel)}
            onDuplicate={() => duplicate(sel)}
          />
        ) : (
          <CardContent className="py-10 text-center text-sm text-muted-foreground">Create a macro to start recording.</CardContent>
        )}
      </Card>

      <div className="lg:col-span-2">
        <AssignCard macros={draft} sel={sel} dirty={dirty} save={save} />
      </div>
    </div>
  )
}

function MacroEditor({
  macro,
  onChange,
  onDelete,
  onDuplicate,
}: {
  macro: DraftMacro
  onChange(fn: (m: DraftMacro) => DraftMacro): void
  onDelete(): void
  onDuplicate(): void
}) {
  const [recording, setRecording] = useState(false)
  const [timing, setTiming] = useState<'real' | 'fixed'>('real')
  const [fixedDelay, setFixedDelay] = useState(20)
  const [cursor, setCursor] = useState<number | null>(null)
  const [pick, setPick] = useState(0)
  // keep the recorder's listeners stable across renders
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const insertAt = cursor == null ? macro.events.length : cursor + 1
  const insert = (evs: MacroEvent[]) => {
    onChange((m) => {
      const events = [...m.events]
      events.splice(insertAt, 0, ...evs)
      return { ...m, events }
    })
    setCursor(insertAt + evs.length - 1)
  }

  useEffect(() => {
    if (!recording) return
    let last = performance.now()
    let held = new Set<string>()
    const on = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.repeat) return
      const down = e.type === 'keydown'
      if (down === held.has(e.code)) return
      const code = hidFromCode(e.code)
      if (!code) return
      held = new Set(held)
      if (down) held.add(e.code)
      else held.delete(e.code)
      const now = performance.now()
      const gap = timing === 'real' ? Math.min(65535, Math.round(now - last)) : fixedDelay
      last = now
      onChangeRef.current((m) => {
        const events = m.events.map((ev, i) => (i === m.events.length - 1 ? { ...ev, delay: gap } : ev))
        return { ...m, events: [...events, { code, down, mouse: false, delay: timing === 'real' ? 10 : fixedDelay }] }
      })
    }
    window.addEventListener('keydown', on, true)
    window.addEventListener('keyup', on, true)
    return () => {
      window.removeEventListener('keydown', on, true)
      window.removeEventListener('keyup', on, true)
    }
  }, [recording, timing, fixedDelay])

  const setEvent = (i: number, p: Partial<MacroEvent>) =>
    onChange((m) => ({ ...m, events: m.events.map((e, j) => (j === i ? { ...e, ...p } : e)) }))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= macro.events.length) return
    onChange((m) => {
      const events = [...m.events]
      ;[events[i], events[j]] = [events[j], events[i]]
      return { ...m, events }
    })
    setCursor(j)
  }
  const del = (i: number) => onChange((m) => ({ ...m, events: m.events.filter((_, j) => j !== i) }))

  const totalMs = macro.events.reduce((n, e) => n + e.delay, 0)

  return (
    <>
      <CardHeader>
        <CardTitle>
          <Input
            className="h-8 border-transparent bg-transparent px-1.5 text-base font-semibold shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
            value={macro.name}
            onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))}
            aria-label="Macro name"
          />
        </CardTitle>
        <CardDescription className="tabular-nums">
          {macro.events.length} actions · {(totalMs / 1000).toFixed(2)} s{cursor != null && ` · inserting after #${cursor + 1}`}
        </CardDescription>
        <CardAction className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <CopyIcon data-icon="inline-start" />
            Duplicate
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant={recording ? 'destructive' : 'default'} onClick={() => setRecording(!recording)}>
            {recording ? <SquareIcon data-icon="inline-start" /> : <CircleIcon data-icon="inline-start" className="fill-current" />}
            {recording ? 'Stop recording' : 'Record'}
          </Button>
          <Segmented<'real' | 'fixed'>
            value={timing}
            options={[
              { value: 'real', label: 'Real delays' },
              { value: 'fixed', label: 'Fixed delay' },
            ]}
            onChange={setTiming}
          />
          {timing === 'fixed' && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Input
                type="number"
                className="h-7 w-20"
                min={0}
                max={65535}
                value={fixedDelay}
                onChange={(e) => setFixedDelay(Math.max(0, Math.min(65535, Number(e.target.value) || 0)))}
              />
              ms
            </div>
          )}
          {recording ? (
            <span className="flex items-center gap-2 text-sm text-red-400">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" /> Recording — type on your keyboard
            </span>
          ) : (
            macro.events.length > 0 && <span className="text-xs text-muted-foreground">Recording appends to the end.</span>
          )}
        </div>

        <div className="max-h-96 overflow-auto rounded-md border">
          {macro.events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No actions. Hit Record and type, or insert actions below.</p>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Then wait</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {macro.events.map((e, i) => (
                  <TableRow
                    key={i}
                    data-state={cursor === i ? 'selected' : undefined}
                    className="cursor-pointer"
                    onClick={() => setCursor(cursor === i ? null : i)}
                  >
                    <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <span className={cn('flex items-center gap-1 text-xs font-medium', e.down ? 'text-foreground' : 'text-muted-foreground')}>
                        {e.down ? <ArrowDownIcon className="size-3" /> : <ArrowUpIcon className="size-3" />}
                        {e.down ? 'press' : 'release'}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{eventName(e)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          className="h-7 w-20 tabular-nums"
                          min={0}
                          max={65535}
                          value={e.delay}
                          onClick={(ev) => ev.stopPropagation()}
                          onChange={(ev) => setEvent(i, { delay: Math.max(0, Math.min(65535, Number(ev.target.value) || 0)) })}
                        />
                        <span className="text-xs text-muted-foreground">ms</span>
                      </div>
                    </TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon-xs" onClick={() => move(i, -1)} aria-label="Move up">
                          <ChevronUpIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => move(i, 1)} aria-label="Move down">
                          <ChevronDownIcon />
                        </Button>
                        <Button variant="ghost" size="icon-xs" onClick={() => del(i)} aria-label="Delete">
                          <XIcon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Insert</span>
          <KeyPicker value={pick} onChange={setPick} placeholder="Key…" />
          <Button variant="outline" size="sm" disabled={!pick} onClick={() => insert([{ code: pick, down: true, mouse: false, delay: 20 }, { code: pick, down: false, mouse: false, delay: 20 }])}>
            Tap
          </Button>
          <Button variant="ghost" size="sm" disabled={!pick} onClick={() => insert([{ code: pick, down: true, mouse: false, delay: 20 }])}>
            Press
          </Button>
          <Button variant="ghost" size="sm" disabled={!pick} onClick={() => insert([{ code: pick, down: false, mouse: false, delay: 20 }])}>
            Release
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          {MOUSE.map((m) => (
            <Button
              key={m.code}
              variant="ghost"
              size="sm"
              onClick={() => insert([{ code: m.code, down: true, mouse: true, delay: 20 }, { code: m.code, down: false, mouse: true, delay: 20 }])}
            >
              <MouseIcon data-icon="inline-start" />
              {m.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </>
  )
}

const MODES = [
  { value: 0, label: 'Play once' },
  { value: 1, label: 'Repeat' },
  { value: 2, label: 'Until pressed again' },
] as const

function AssignCard({ macros, sel, dirty, save }: { macros: DraftMacro[]; sel: number; dirty: boolean; save(list?: DraftMacro[]): boolean }) {
  const regions = useStore((s) => s.regions)!
  const updateMany = useStore((s) => s.updateMany)
  const [key, setKey] = useState<number | null>(null)
  const [mode, setMode] = useState<0 | 1 | 2>(0)
  const [repeat, setRepeat] = useState(3)

  const bound = useMemo(() => {
    const m = new Map<number, number>()
    for (const id of KEY_BY_ID.keys()) {
      const b = decodeBinding(regions.keys, id)
      if (b.type === 'macro') m.set(id, b.index)
    }
    return m
  }, [regions.keys])

  const assign = () => {
    if (key == null || !macros[sel]) return
    if (dirty && !save()) return
    const state = useStore.getState().regions!
    const cleared = clearAdvanced(state.keys, state.dks, [key])
    updateMany({ dks: cleared.dks, keys: withBinding(cleared.keys, [key], { type: 'macro', index: sel, mode, repeat }) })
  }

  const unassign = () => {
    if (key == null) return
    updateMany({ keys: withBinding(regions.keys, [key], { type: 'default' }) })
  }

  const current = key != null ? bound.get(key) : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign to a key</CardTitle>
        <CardDescription>
          {key == null ? `Click a key to bind “${macros[sel]?.name ?? 'a macro'}” to it. Keys marked M# play a macro.` : 'Choose how the macro plays.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Keyboard
          selected={new Set(key != null ? [key] : [])}
          onSelectionChange={() => {}}
          onKeyClick={(id) => setKey(isFnKey(KEY_BY_ID.get(id)) || id === key ? null : id)}
          face={(k) => {
            const i = bound.get(k.id)
            return i != null ? { main: `M${i + 1}`, sub: k.label || 'Space', marked: true } : {}
          }}
        />
        {key != null && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">{keyName(key)}</span>
            {current != null && <Badge variant="secondary">plays {macros[current]?.name ?? `M${current + 1}`}</Badge>}
            <Segmented value={mode} options={MODES} onChange={(v) => setMode(v as 0 | 1 | 2)} />
            {mode === 1 && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Input
                  type="number"
                  className="h-7 w-16"
                  min={1}
                  max={255}
                  value={repeat}
                  onChange={(e) => setRepeat(Math.max(1, Math.min(255, Number(e.target.value) || 1)))}
                />
                times
              </div>
            )}
            <div className="ml-auto flex gap-2">
              {current != null && (
                <Button variant="ghost" onClick={unassign}>
                  Unassign
                </Button>
              )}
              <Button disabled={!macros[sel]} onClick={assign}>
                {dirty ? 'Save & assign' : 'Assign'} {macros[sel] ? `“${macros[sel].name}”` : ''}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
