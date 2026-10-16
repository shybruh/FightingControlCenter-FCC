import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen } from '@tauri-apps/api/event'
import { ChevronLeftIcon, ChevronRightIcon, KeyboardIcon, PowerIcon, SquareArrowOutUpRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { Slider } from '../components/ui'
import { applyTheme } from '../theme'
import type { TrayAction, TrayState } from './integration'

const act = (a: TrayAction) => void emitTo('main', 'tray-action', a).catch(() => undefined)

/**
 * The panel by the tray icon (a small window, see src-tauri/src/desktop.rs): profiles and lighting without opening FCC.
 * The main window owns the keyboard: this only shows the state it sends and asks it to change things.
 */
export function TrayPanel() {
  const [s, setS] = useState<TrayState | null>(null)

  useEffect(() => {
    const off = listen<TrayState>('tray-state', (e) => {
      setS(e.payload)
      applyTheme(e.payload.theme, e.payload.accent)
    })
    // ask for the state now, and each time the panel opens (it may have missed changes while hidden)
    const hello = () => act({ kind: 'hello' })
    void off.then(hello)
    window.addEventListener('focus', hello)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && void invoke('tray_hide')
    window.addEventListener('keydown', esc)
    return () => {
      void off.then((u) => u())
      window.removeEventListener('focus', hello)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  const effectIdx = s ? s.effects.findIndex((e) => e.id === s.effect) : -1
  const step = (d: number) => {
    if (!s || !s.effects.length) return
    const i = effectIdx < 0 ? 0 : (effectIdx + d + s.effects.length) % s.effects.length
    act({ kind: 'effect', id: s.effects[i].id })
  }
  const lightOn = !!s && !s.lightsOff && s.effect !== 0

  return (
    <div className="h-full p-2">
      <div className="tray-card flex h-full flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-2xl">
        <div className="flex items-center gap-2.5 border-b px-3.5 py-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <KeyboardIcon className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{s?.keyboard ?? 'Fighting Control Center'}</span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={cn('size-1.5 rounded-full', s?.connected ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
              {s?.connected ? 'Connected' : 'No keyboard connected'}
            </span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
          {s?.connected && (
            <section className="flex flex-col gap-0.5">
              <span className="px-1.5 pb-1 text-xs font-medium text-muted-foreground">Profiles</span>
              {s.profiles.map((p, i) => {
                const active = p.id === s.active
                return (
                  <button
                    key={p.id}
                    onClick={() => !active && act({ kind: 'profile', id: p.id })}
                    className={cn('flex h-8 items-center gap-2.5 rounded-md px-1.5 text-left text-sm transition-colors hover:bg-accent', active && 'bg-accent font-medium')}
                  >
                    <span
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-medium',
                        active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="truncate">{p.name}</span>
                  </button>
                )
              })}
            </section>
          )}

          {s?.canLight && (
            <section className="flex flex-col gap-2 px-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Lighting</span>
                <Switch checked={lightOn} onCheckedChange={(on) => act({ kind: 'lights', on })} aria-label="Lights" />
              </div>
              <div className={cn('flex flex-col gap-2', !lightOn && 'opacity-50')}>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Previous effect" disabled={!lightOn} onClick={() => step(-1)}>
                    <ChevronLeftIcon />
                  </Button>
                  <span className="flex-1 truncate text-center text-sm">{s.effect === 0 ? 'Off' : (s.effects[effectIdx]?.name ?? "Keyboard's own effect")}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Next effect" disabled={!lightOn} onClick={() => step(1)}>
                    <ChevronRightIcon />
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-16 text-xs text-muted-foreground">Brightness</span>
                  <Slider min={1} max={5} value={s.brightness} disabled={!lightOn} onChange={(v) => act({ kind: 'brightness', value: v })} className="flex-1" />
                </div>
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-2 py-2">
          <Button variant="ghost" size="sm" onClick={() => void invoke('tray_open_main')}>
            <SquareArrowOutUpRightIcon data-icon="inline-start" />
            Open FCC
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void invoke('tray_quit')}>
            <PowerIcon data-icon="inline-start" />
            Quit
          </Button>
        </div>
      </div>
    </div>
  )
}
