// App-level form helpers built on shadcn primitives.
import { useEffect, useState, type ReactNode } from 'react'
import { Label } from '@/components/ui/label'
import { Slider as ShadSlider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

/** Slider that renders live while dragging but only commits on release / keyboard step. */
export function Slider({
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled,
  className,
}: {
  min: number
  max: number
  step?: number
  value: number
  onChange(v: number): void
  disabled?: boolean
  className?: string
}) {
  const [local, setLocal] = useState(value)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!dragging) setLocal(value)
  }, [value, dragging])
  const num = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number))
  return (
    <ShadSlider
      className={cn('py-1.5', className)}
      min={min}
      max={max}
      step={step}
      value={[local]}
      disabled={disabled}
      onValueChange={(v) => {
        setDragging(true)
        setLocal(num(v))
      }}
      onValueCommitted={(v) => {
        setDragging(false)
        if (num(v) !== value) onChange(num(v))
      }}
    />
  )
}

export function Field({ label, value, hint, children }: { label: ReactNode; value?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        {value != null && <span className="text-sm font-medium tabular-nums text-muted-foreground">{value}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: readonly { value: T; label: string }[]
  onChange(v: T): void
  className?: string
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      spacing={0}
      className={cn('flex-wrap', className)}
      value={[String(value)]}
      onValueChange={(v) => {
        const next = options.find((o) => String(o.value) === v[0])
        if (next) onChange(next.value)
      }}
    >
      {options.map((o) => (
        <ToggleGroupItem key={String(o.value)} value={String(o.value)} className="px-3">
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 border-t py-3 first:border-t-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-6 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  )
}
