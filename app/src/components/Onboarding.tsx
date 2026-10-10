import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { FlagIcon, KeyboardIcon, LayersIcon, ShieldCheckIcon, type LucideIcon } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'
import { StatusBadge } from './DeviceGate'

export interface TourPage {
  id: string
  label: string
  icon: LucideIcon
  blurb: string
}

interface Step {
  id: string
  icon: LucideIcon
  title: string
  body: ReactNode
}

/** First-run walkthrough, shown once after the first connect; skippable, and reopened from Settings. */
export function Onboarding({ pages }: { pages: TourPage[] }) {
  const open = useStore((s) => s.introOpen)
  const close = useStore((s) => s.closeIntro)
  const device = useStore((s) => s.device)
  const demo = useStore((s) => s.demo)
  const readOnly = useStore((s) => s.readOnly)
  // wait until the model has been picked when several share a USB id
  const choosing = useStore((s) => !!s.deviceChoices?.length)
  const [index, setIndex] = useState(0)
  // start from the first step each time it opens (resetting on close would flash step 1 while fading out)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setIndex(0)
  }

  const writeOnly = device?.caps.readBack === false
  const steps: Step[] = [
    {
      id: 'welcome',
      icon: KeyboardIcon,
      title: 'Welcome to Fighting Control Center',
      body: (
        <>
          <p>
            A fast configurator for Hall-effect keyboards: MonsGeek, MCHOSE, AULA, Ajazz, Epomaker and many more. So far it has been tested
            end to end on the Fekker × VTER Fighting68 HE.
          </p>
          {device && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
              <KeyboardIcon className="size-4 text-muted-foreground" />
              <span className="flex-1 truncate font-medium text-foreground">{device.name}</span>
              {demo && <Badge variant="secondary">demo</Badge>}
              <StatusBadge status={device.status} />
            </div>
          )}
        </>
      ),
    },
    {
      id: 'safety',
      icon: ShieldCheckIcon,
      title: 'Careful with your keyboard',
      body: (
        <ul className="flex list-disc flex-col gap-1.5 pl-4">
          <li>FCC only sends the commands the official software sends. It never touches firmware.</li>
          {writeOnly ? (
            <li>This keyboard can't report its settings, so FCC shows your saved profile and sends it when you change something.</li>
          ) : (
            <li>Every time the keyboard connects, its settings are read and backed up first.</li>
          )}
          <li>
            Boards that haven't been tested yet open <span className="text-foreground">read-only</span> until you choose{' '}
            <span className="text-foreground">Allow changes</span>
            {readOnly ? ' in the yellow banner.' : '.'}
          </li>
        </ul>
      ),
    },
    {
      id: 'profiles',
      icon: LayersIcon,
      title: 'Profiles',
      body: (
        <ul className="flex list-disc flex-col gap-1.5 pl-4">
          <li>Every change is saved to the active profile and sent to the keyboard right away. There is no save button.</li>
          <li>Make a new profile with + in the sidebar, then switch with one click. Switching writes the whole profile to the keyboard.</li>
          {isTauri() && <li>Switch from the tray, with a hotkey, or automatically when a game starts (Desktop page).</li>}
        </ul>
      ),
    },
    {
      id: 'pages',
      icon: KeyboardIcon,
      title: 'Where things are',
      body: (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {pages.map((p) => (
            <li key={p.id} className="flex items-start gap-2.5 rounded-lg border bg-muted/20 px-3 py-2">
              <p.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{p.label}</span>
                <span className="text-xs">{p.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: 'report',
      icon: FlagIcon,
      title: 'Help support more keyboards',
      body: (
        <p>
          {device?.status === 'verified'
            ? 'Your keyboard is verified. If something ever acts up, '
            : "Your keyboard hasn't been verified yet. Once you've tried it, "}
          <span className="text-foreground">Settings → Report this keyboard</span> builds a report for GitHub with everything needed to fix or
          verify it. It's how new boards get supported.
        </p>
      ),
    },
  ]

  const step = steps[Math.min(index, steps.length - 1)]
  const last = index >= steps.length - 1
  const finish = () => close()

  return (
    <AlertDialog open={open && !choosing} onOpenChange={(o) => !o && finish()}>
      <AlertDialogContent className="max-w-lg gap-5">
        <AutoHeight watch={step.id}>
          <div key={step.id} className="swap-in flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <step.icon className="size-4" />
              </div>
              <AlertDialogTitle>{step.title}</AlertDialogTitle>
            </div>
            <AlertDialogDescription render={<div />} className="flex flex-col gap-3 text-sm text-muted-foreground">
              {step.body}
            </AlertDialogDescription>
          </div>
        </AutoHeight>

        <div className="flex items-center gap-2">
          <div className="flex flex-1 gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
            {steps.map((s, i) => (
              <button
                key={s.id}
                aria-label={`Go to step ${i + 1}`}
                className={cn('h-1.5 rounded-full transition-all duration-300', i === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60')}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          {!last && (
            <Button variant="ghost" onClick={finish}>
              Skip
            </Button>
          )}
          {index > 0 && (
            <Button variant="outline" onClick={() => setIndex(index - 1)}>
              Back
            </Button>
          )}
          <Button onClick={() => (last ? finish() : setIndex(index + 1))}>{last ? 'Get started' : 'Next'}</Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Animates its height to follow the content, so steps of different sizes grow and shrink instead of jumping. */
/** `watch` changes when the content is swapped, so the new height is applied straight away. */
function AutoHeight({ children, watch }: { children: ReactNode; watch?: unknown }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    if (inner.current) setHeight(inner.current.offsetHeight)
  }, [watch])
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="auto-height" style={{ height }}>
      <div ref={inner}>{children}</div>
    </div>
  )
}
