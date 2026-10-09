import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { HID_GROUPS, hidFromCode, hidName } from '../data/keycodes'

/** Picks a single HID usage. Click to open a grid, or press any key while it's open. */
export function KeyPicker({
  value,
  onChange,
  placeholder = 'Pick key',
  allowClear,
}: {
  value: number
  onChange(hid: number): void
  placeholder?: string
  allowClear?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [group, setGroup] = useState(HID_GROUPS[0].name)

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      const hid = hidFromCode(e.code)
      e.preventDefault()
      e.stopPropagation()
      if (hid) {
        onChange(hid)
        setOpen(false)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [open, onChange])

  const g = HID_GROUPS.find((x) => x.name === group)!

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn('min-w-24 justify-start font-medium', !value && 'border-dashed font-normal text-muted-foreground')}
          />
        }
      >
        {value ? hidName(value) : placeholder}
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[min(28rem,90vw)] flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
          Press any key, or choose below
        </div>
        <Tabs value={group} onValueChange={(v) => setGroup(v as string)}>
          <TabsList className="h-auto flex-wrap">
            {HID_GROUPS.map((x) => (
              <TabsTrigger key={x.name} value={x.name} className="text-xs">
                {x.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid max-h-56 grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1 overflow-auto">
          {g.keys.map((k) => (
            <Button
              key={k.value}
              variant={k.value === value ? 'secondary' : 'ghost'}
              size="sm"
              className="text-xs"
              onClick={() => {
                onChange(k.value)
                setOpen(false)
              }}
            >
              {k.label}
            </Button>
          ))}
        </div>
        {allowClear && value !== 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start text-muted-foreground"
            onClick={() => {
              onChange(0)
              setOpen(false)
            }}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
