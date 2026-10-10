import { useState } from 'react'
import { ShieldAlertIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DeviceDef } from '../devices/registry'
import { useStore } from '../store'
import { ReportButton } from './ReportDialog'

export function StatusBadge({ status }: { status: DeviceDef['status'] }) {
  if (status === 'verified') return <Badge className="bg-emerald-500/15 text-emerald-400">Verified</Badge>
  if (status === 'untested') return <Badge className="bg-amber-400/15 text-amber-300">Untested</Badge>
  return <Badge variant="secondary">Unsupported</Badge>
}

/** Banner shown while an untested board is read-only. */
export function ReadOnlyBanner() {
  const readOnly = useStore((s) => s.readOnly)
  const device = useStore((s) => s.device)
  const allowWrites = useStore((s) => s.allowWrites)
  const writeOnly = device?.caps.readBack === false
  if (!readOnly) return null
  return (
    <div className="swap-in flex flex-wrap items-center gap-3 border-b border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5 text-sm md:px-6">
      <ShieldAlertIcon className="size-4 shrink-0 text-amber-300" />
      <span className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{device ? `${device.name} hasn't been tested with FCC yet.` : 'Unknown keyboard.'}</span>{' '}
        {writeOnly
          ? "It can't report its settings, so FCC shows your saved profile. Changes are off until you allow them; the protocol matches existing Royal Kludge tools, so it should work. Tell us if it does!"
          : device?.protocol === 'ry'
            ? "Its settings are read and backed up, but changes are off until you allow them. FCC follows the same protocol as MonsGeek's own driver, so it should work. Tell us if it does!"
            : 'Its settings are read and backed up, but changes are off until you allow them. It uses the same protocol as the boards FCC is tested on, so it should work. Tell us if it does!'}
      </span>
      {device && (
        <div className="flex gap-2">
          <ReportButton size="sm" variant="ghost" />
          <Button size="sm" variant="outline" onClick={allowWrites}>
            Allow changes
          </Button>
        </div>
      )}
    </div>
  )
}

/** Asks which model is connected when several share the board's USB id. */
export function DeviceChoiceDialog() {
  const choices = useStore((s) => s.deviceChoices)
  const current = useStore((s) => s.device)
  const chooseDevice = useStore((s) => s.chooseDevice)
  const [picked, setPicked] = useState<string | null>(null)
  const open = !!choices && choices.length > 0
  const selected = picked ?? current?.id ?? null

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Which keyboard is this?</AlertDialogTitle>
          <AlertDialogDescription>
            Several models share this keyboard's USB id. Pick yours so the layout and switch limits are right. You can change it later in Settings.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="flex max-h-72 flex-col gap-1 overflow-auto">
          {choices?.map((d) => (
            <li key={d.id}>
              <button
                className={cn(
                  'flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50',
                  selected === d.id ? 'border-primary bg-muted/60' : 'border-transparent',
                )}
                onClick={() => setPicked(d.id)}
              >
                <span className="flex-1 truncate font-medium">{d.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.productId.toString(16).padStart(4, '0')}</span>
                <StatusBadge status={d.status} />
              </button>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <Button disabled={!selected} onClick={() => selected && chooseDevice(selected)}>
            Use this model
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
