import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart'
import { GamepadIcon, PlusIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { useDesktopStatus } from '../desktop/integration'
import { acceleratorFromEvent, prettyHotkey, profileHotkey, useDesktop, type GameRule } from '../desktop/settings'
import { useStore } from '../store'
import { Segmented, SwitchRow } from './ui'

export function DesktopPanel() {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <GeneralCard />
        <HotkeysCard />
      </div>
      <GamesCard />
    </div>
  )
}

function GeneralCard() {
  const d = useDesktop()
  const [autostart, setAutostart] = useState<boolean | null>(null)

  useEffect(() => {
    autostartEnabled().then(setAutostart).catch(() => setAutostart(false))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>App</CardTitle>
        <CardDescription>Startup and tray behaviour.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        <SwitchRow
          label="Start with Windows"
          hint="Starts quietly in the tray so hotkeys and game profiles are always ready."
          checked={!!autostart}
          onChange={async (v) => {
            await (v ? enableAutostart() : disableAutostart())
            setAutostart(await autostartEnabled())
          }}
        />
        <SwitchRow
          label="On-screen popup"
          hint="Briefly shows the new profile over your game when a hotkey or game rule switches it."
          checked={d.osdEnabled}
          onChange={(v) => d.set({ osdEnabled: v })}
        />
        {d.osdEnabled && (
          <div className="flex items-center justify-between gap-3 pb-3">
            <span className="text-sm text-muted-foreground">Popup position</span>
            <div className="flex items-center gap-2">
              <Segmented
                value={d.osdPosition}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
                onChange={(v) => d.set({ osdPosition: v })}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const { profiles, activeProfileId } = useStore.getState()
                  const i = Math.max(0, profiles.findIndex((p) => p.id === activeProfileId))
                  invoke('show_osd', { title: profiles[i]?.name ?? 'Profile', subtitle: 'Preview', index: i + 1, position: d.osdPosition })
                }}
              >
                Preview
              </Button>
            </div>
          </div>
        )}
        <SwitchRow
          label="Close to tray"
          hint="Closing the window keeps FCC running in the tray. Quit from the tray menu."
          checked={d.closeToTray}
          onChange={(v) => d.set({ closeToTray: v })}
        />
      </CardContent>
    </Card>
  )
}

function HotkeysCard() {
  const d = useDesktop()
  const profiles = useStore((s) => s.profiles)
  const errors = useDesktopStatus((s) => s.hotkeyErrors)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global hotkeys</CardTitle>
        <CardDescription>Switch profiles from anywhere, including in game.</CardDescription>
        <CardAction>
          <Switch checked={d.hotkeysEnabled} onCheckedChange={(v) => d.set({ hotkeysEnabled: v })} aria-label="Enable hotkeys" />
        </CardAction>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-1', !d.hotkeysEnabled && 'pointer-events-none opacity-50')}>
        {profiles.map((p, i) => (
          <HotkeyRow
            key={p.id}
            label={p.name}
            index={i + 1}
            value={profileHotkey(d.profileHotkeys, p.id, i)}
            error={errors[p.id]}
            onChange={(acc) => d.set({ profileHotkeys: { ...d.profileHotkeys, [p.id]: acc } })}
          />
        ))}
        <HotkeyRow label="Next profile" value={d.cycleHotkey} error={errors.cycle} onChange={(acc) => d.set({ cycleHotkey: acc })} />
        <p className="pt-2 text-xs text-muted-foreground">Click a shortcut, then press the new combo. Backspace clears it, Esc cancels.</p>
      </CardContent>
    </Card>
  )
}

function HotkeyRow({
  label,
  index,
  value,
  error,
  onChange,
}: {
  label: string
  index?: number
  value: string | null
  error?: string
  onChange(acc: string | null): void
}) {
  const [recording, setRecording] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!recording) return
    // registered hotkeys would swallow the combo we're trying to record
    useDesktopStatus.setState({ recording: true })
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') return setRecording(false)
      if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey) {
        onChangeRef.current(null)
        return setRecording(false)
      }
      const acc = acceleratorFromEvent(e)
      if (acc) {
        onChangeRef.current(acc)
        setRecording(false)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      useDesktopStatus.setState({ recording: false })
    }
  }, [recording])

  return (
    <div className="flex items-center gap-3 border-t py-2 first:border-t-0">
      {index != null ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">{index}</span>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <span className="flex-1 truncate text-sm">{label}</span>
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        variant={recording ? 'secondary' : 'outline'}
        size="sm"
        className={cn('min-w-36 justify-center font-mono text-xs', !value && !recording && 'text-muted-foreground')}
        onClick={() => setRecording(!recording)}
        onBlur={() => setRecording(false)}
      >
        {recording ? 'Press a combo…' : prettyHotkey(value)}
      </Button>
    </div>
  )
}

function GamesCard() {
  const d = useDesktop()
  const profiles = useStore((s) => s.profiles)
  const focused = useDesktopStatus((s) => s.focused)
  const auto = useDesktopStatus((s) => s.autoSwitched)

  const profileItems = Object.fromEntries(profiles.map((p) => [p.id, p.name]))
  const revertValue = typeof d.revert === 'string' ? d.revert : `profile:${d.revert.profileId}`
  const revertItems: Record<string, string> = {
    previous: 'Previous profile',
    stay: 'Stay on the game profile',
    ...Object.fromEntries(profiles.map((p) => [`profile:${p.id}`, `Switch to ${p.name}`])),
  }

  const updateRule = (id: string, patch: Partial<GameRule>) => d.set({ rules: d.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })
  const addRule = (exe: string, label: string) => {
    if (d.rules.some((r) => r.exe.toLowerCase() === exe.toLowerCase())) return
    d.set({ rules: [...d.rules, { id: Math.random().toString(36).slice(2, 9), exe, label, profileId: profiles[0]?.id ?? '' }] })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Game profiles</CardTitle>
        <CardDescription>Switch profile automatically when a game is focused.</CardDescription>
        <CardAction>
          <Switch checked={d.rulesEnabled} onCheckedChange={(v) => d.set({ rulesEnabled: v })} aria-label="Enable game profiles" />
        </CardAction>
      </CardHeader>
      <CardContent className={cn('flex flex-col gap-4', !d.rulesEnabled && 'opacity-50')}>
        {d.rules.length === 0 ? (
          <p className="rounded-md border border-dashed py-6 text-center text-sm text-muted-foreground">
            No games yet. Start your game, then add it here.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border">
            {d.rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <GamepadIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{r.label || r.exe}</span>
                  <span className="truncate text-xs text-muted-foreground">{r.exe}</span>
                </div>
                {auto?.rule === r.id && <Badge variant="secondary">active</Badge>}
                <Select items={profileItems} value={r.profileId} onValueChange={(v) => updateRule(r.id, { profileId: v as string })}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.exe}`} onClick={() => d.set({ rules: d.rules.filter((x) => x.id !== r.id) })}>
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <AddGame onAdd={addRule} />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <span className="text-sm">When you leave the game</span>
          <Select
            items={revertItems}
            value={revertValue}
            onValueChange={(v) => {
              const s = v as string
              d.set({ revert: s.startsWith('profile:') ? { profileId: s.slice(8) } : (s as 'previous' | 'stay') })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(revertItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Focused now: <span className="font-mono">{focused?.exe ?? '—'}</span>
          {focused?.title && <span> · {focused.title}</span>}
        </p>
      </CardContent>
    </Card>
  )
}

function AddGame({ onAdd }: { onAdd(exe: string, label: string): void }) {
  const [open, setOpen] = useState(false)
  const [apps, setApps] = useState<{ exe: string; title: string }[]>([])
  const [manual, setManual] = useState('')
  const [filter, setFilter] = useState('')

  const refresh = () => invoke<{ exe: string; title: string }[]>('list_window_apps').then(setApps).catch(() => setApps([]))
  useEffect(() => {
    if (open) refresh()
  }, [open])

  const shown = apps.filter((a) => `${a.exe} ${a.title}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className="self-start" />}>
        <PlusIcon data-icon="inline-start" />
        Add game
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-[min(26rem,90vw)] flex-col gap-3">
        <div className="flex gap-2">
          <Input placeholder="Filter running apps…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <Button variant="ghost" size="icon" aria-label="Refresh" onClick={refresh}>
            <RefreshCwIcon />
          </Button>
        </div>
        <ul className="flex max-h-64 flex-col overflow-auto">
          {shown.length === 0 && <li className="py-4 text-center text-sm text-muted-foreground">No matching windows.</li>}
          {shown.map((a) => (
            <li key={a.exe}>
              <button
                className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                onClick={() => {
                  onAdd(a.exe, a.title)
                  setOpen(false)
                }}
              >
                <span className="truncate text-sm">{a.title}</span>
                <span className="truncate font-mono text-xs text-muted-foreground">{a.exe}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 border-t pt-3"
          onSubmit={(e) => {
            e.preventDefault()
            const exe = manual.trim()
            if (!exe) return
            onAdd(exe.toLowerCase().endsWith('.exe') ? exe : `${exe}.exe`, '')
            setManual('')
            setOpen(false)
          }}
        >
          <Input placeholder="or type an .exe name" value={manual} onChange={(e) => setManual(e.target.value)} className="font-mono text-xs" />
          <Button type="submit" variant="secondary">
            Add
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}
