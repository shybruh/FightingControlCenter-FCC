import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { KEYS, LAYOUT_HEIGHT, LAYOUT_WIDTH, type KeyDef } from '../data/layout'
import './keyboard.css'

export interface KeyFace {
  main?: ReactNode
  sub?: ReactNode
  /** overlay tint, e.g. per-key LED color */
  tint?: string
  /** highlights remapped / non-default keys */
  marked?: boolean
  /** 0–1 bottom-up fill, e.g. live key travel */
  fill?: number
  /** colour of the fill */
  fillColor?: string
}

interface Props {
  selected: Set<number>
  onSelectionChange(next: Set<number>): void
  face(key: KeyDef): KeyFace
  /** single-select mode (e.g. keymap) */
  single?: boolean
  /** when set, clicks are reported instead of changing the selection */
  onKeyClick?(id: number): void
  /** how strongly key tints show, in percent (default 40) */
  tintMix?: number
}

export function Keyboard({ selected, onSelectionChange, face, single, onKeyClick, tintMix = 40 }: Props) {
  const dragging = useRef<null | { adding: boolean }>(null)

  const apply = (id: number, adding: boolean) => {
    const next = new Set(selected)
    if (adding) next.add(id)
    else next.delete(id)
    onSelectionChange(next)
  }

  const down = (e: React.PointerEvent, k: KeyDef) => {
    e.preventDefault()
    if (onKeyClick) {
      onKeyClick(k.id)
      return
    }
    if (single) {
      onSelectionChange(selected.has(k.id) && selected.size === 1 ? new Set() : new Set([k.id]))
      return
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      const adding = !selected.has(k.id)
      dragging.current = { adding }
      apply(k.id, adding)
    } else {
      const adding = !(selected.has(k.id) && selected.size === 1)
      dragging.current = { adding: true }
      onSelectionChange(adding ? new Set([k.id]) : new Set())
    }
  }

  const enter = (k: KeyDef) => {
    if (!dragging.current || single) return
    if (selected.has(k.id) !== dragging.current.adding) apply(k.id, dragging.current.adding)
  }

  return (
    <div
      className="kb-wrap"
      onPointerUp={() => (dragging.current = null)}
      onPointerLeave={() => (dragging.current = null)}
    >
      <div className="kb" style={{ '--cols': LAYOUT_WIDTH, '--rows': LAYOUT_HEIGHT, '--tint-mix': `${tintMix}%` } as CSSProperties}>
        {KEYS.map((k) => {
          const f = face(k)
          const isSel = selected.has(k.id)
          return (
            <button
              key={k.id}
              type="button"
              className={`key${isSel ? ' sel' : ''}${f.marked ? ' marked' : ''}`}
              style={
                {
                  '--x': k.x,
                  '--y': k.y,
                  '--w': k.w,
                  '--h': k.h ?? 1,
                  '--tint': f.tint ?? 'var(--secondary)',
                } as CSSProperties
              }
              onPointerDown={(e) => down(e, k)}
              onPointerEnter={() => enter(k)}
              aria-pressed={isSel}
              aria-label={k.label || 'Space'}
            >
              <span className="key-cap">
                {f.fill != null && (
                  <span
                    className="key-fill"
                    style={{ height: `${Math.min(1, Math.max(0, f.fill)) * 100}%`, background: f.fillColor }}
                  />
                )}
                <span className="key-main">{f.main ?? (k.label || 'Space')}</span>
                {f.sub != null && <span className="key-sub">{f.sub}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SelectionBar({
  selected,
  onChange,
}: {
  selected: Set<number>
  onChange(s: Set<number>): void
}) {
  const all = KEYS.map((k) => k.id)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        {selected.size ? `${selected.size} key${selected.size > 1 ? 's' : ''} selected` : 'Click or drag to select keys · Shift/Ctrl+click to add'}
      </span>
      <div className="flex gap-1">
        <Button variant="ghost" size="xs" onClick={() => onChange(new Set(all))}>All</Button>
        <Button variant="ghost" size="xs" onClick={() => onChange(new Set(all.filter((id) => !selected.has(id))))}>Invert</Button>
        <Button variant="ghost" size="xs" onClick={() => onChange(new Set())} disabled={!selected.size}>None</Button>
      </div>
    </div>
  )
}
