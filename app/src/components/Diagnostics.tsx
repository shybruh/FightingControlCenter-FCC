import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { CopyIcon, DownloadIcon, EarIcon, PlusIcon, RadarIcon, SquareIcon, Trash2Icon, XIcon } from 'lucide-react'
import { AlertDialog, AlertDialogContent, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { usageName } from '../diag/descriptor'
import { clearLog, formatEntry, hex, logEntries, logSettings, logText, onLog, type Level } from '../diag/log'
import { listenTo, pickAnyDevice, scanDevices, scanText, type LiveReport, type ScannedCollection } from '../diag/scan'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'

export const useDiagnostics = create<{ open: boolean; tab: 'devices' | 'log'; show(tab?: 'devices' | 'log'): void; hide(): void }>((set) => ({
  open: false,
  tab: 'devices',
  show: (tab = 'devices') => set({ open: true, tab }),
  hide: () => set({ open: false }),
}))

const h4 = (n: number) => n.toString(16).padStart(4, '0')

function useHeader() {
  const device = useStore((s) => s.device)
  const status = useStore((s) => s.status)
  const kb = useStore((s) => s.kb)
  return {
    app: `FCC ${__APP_VERSION__} (${isTauri() ? 'desktop' : 'web'})`,
    status,
    keyboard: kb ? `${kb.name} ${h4(kb.identity.vendorId)}:${h4(kb.identity.productId)}` : 'none',
    model: device ? `${device.name} (${device.id}, ${device.protocol}, ${device.status})` : 'none',
  }
}

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function Diagnostics() {
  const { open, tab, hide } = useDiagnostics()
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && hide()}>
      <AlertDialogContent className="flex h-[85vh] w-[min(1000px,95vw)] max-w-none flex-col gap-3 sm:max-w-none">
        <div className="flex items-center gap-3">
          <AlertDialogTitle className="flex-1">Diagnostics</AlertDialogTitle>
          <Button variant="ghost" size="icon" onClick={hide} aria-label="Close">
            <XIcon />
          </Button>
        </div>
        <Tabs value={tab} onValueChange={(v) => useDiagnostics.setState({ tab: v as 'devices' | 'log' })} className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>
          <TabsContent value="devices" className="min-h-0 flex-1">
            <DevicesTab />
          </TabsContent>
          <TabsContent value="log" className="min-h-0 flex-1">
            <LogTab />
          </TabsContent>
        </Tabs>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ---------- devices ----------

function DevicesTab() {
  const [list, setList] = useState<ScannedCollection[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [onlyRelevant, setOnlyRelevant] = useState(true)
  const [listening, setListening] = useState<ScannedCollection | null>(null)
  const [copied, setCopied] = useState(false)

  const scan = async () => {
    setBusy(true)
    setError(null)
    try {
      setList(await scanDevices())
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => {
    void scan()
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, ScannedCollection[]>()
    for (const c of list ?? []) {
      const k = `${h4(c.vendorId)}:${h4(c.productId)} ${c.product}`
      map.set(k, [...(map.get(k) ?? []), c])
    }
    const all = [...map.entries()].map(([k, cs]) => ({ k, cs, relevant: cs.some((c) => c.claim !== 'Not a keyboard FCC knows') }))
    all.sort((a, b) => Number(b.relevant) - Number(a.relevant) || a.k.localeCompare(b.k))
    return onlyRelevant ? all.filter((g) => g.relevant) : all
  }, [list, onlyRelevant])

  const copy = async () => {
    if (!list) return
    await navigator.clipboard.writeText(scanText(list))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={scan} disabled={busy}>
          <RadarIcon data-icon="inline-start" />
          {busy ? 'Scanning…' : 'Scan again'}
        </Button>
        {!isTauri() && 'hid' in navigator && (
          <Button size="sm" variant="outline" onClick={() => pickAnyDevice().then(scan)}>
            <PlusIcon data-icon="inline-start" />
            Add a device
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={copy} disabled={!list}>
          <CopyIcon data-icon="inline-start" />
          {copied ? 'Copied' : 'Copy scan'}
        </Button>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={onlyRelevant} onChange={(e) => setOnlyRelevant(e.target.checked)} />
          Only keyboards FCC knows something about
        </label>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {!isTauri() && (
        <p className="text-xs text-muted-foreground">
          The browser only shows devices you've allowed. Use “Add a device” to pick any HID device; the desktop app sees everything.
        </p>
      )}
      <div className={cn('min-h-0 flex-1 overflow-auto rounded-md border', listening && 'max-h-[45%]')}>
        {groups.length === 0 && <p className="p-4 text-sm text-muted-foreground">{busy ? 'Scanning…' : 'Nothing found. Untick the filter to see every HID device.'}</p>}
        {groups.map((g) => (
          <div key={g.k} className="border-b p-3 last:border-b-0">
            <div className="mb-2 font-mono text-sm font-medium">{g.k || '(no name)'}</div>
            <div className="flex flex-col gap-2">
              {g.cs.map((c) => (
                <Collection key={c.key} c={c} active={listening?.key === c.key} onListen={() => setListening(c)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {listening && <Monitor c={listening} onClose={() => setListening(null)} />}
    </div>
  )
}

function Reports({ c }: { c: ScannedCollection }) {
  if (!c.reports) return <span className="text-muted-foreground">reports unknown</span>
  const parts = (['input', 'output', 'feature'] as const)
    .map((k) => {
      const e = Object.entries(c.reports![k])
      return e.length ? `${k}: ${e.map(([id, n]) => `0x${Number(id).toString(16)}${n ? ` (${n} B)` : ''}`).join(', ')}` : null
    })
    .filter(Boolean)
  return <span>{parts.length ? parts.join(' · ') : 'no reports'}</span>
}

function Collection({ c, active, onListen }: { c: ScannedCollection; active: boolean; onListen(): void }) {
  const ok = c.claim.includes('✓')
  return (
    <div className={cn('rounded-md border p-2 text-xs', ok && 'border-emerald-500/40 bg-emerald-500/5', active && 'ring-1 ring-primary')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{usageName(c.usagePage, c.usage)}</span>
        {c.interface != null && <Badge variant="secondary">interface {c.interface}</Badge>}
        <span className={cn('text-muted-foreground', ok && 'text-emerald-400')}>{c.claim}</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={onListen}>
          <EarIcon data-icon="inline-start" />
          Listen
        </Button>
      </div>
      <div className="mt-1 font-mono text-muted-foreground">
        <Reports c={c} />
      </div>
      {c.error && <div className="mt-1 text-amber-300">{c.error}</div>}
      {(c.descriptor || c.path) && (
        <details className="mt-1 text-muted-foreground">
          <summary className="cursor-pointer select-none">details</summary>
          {c.path && <div className="mt-1 break-all font-mono">path: {c.path}</div>}
          {c.descriptor && <div className="mt-1 break-all font-mono">descriptor: {hex(c.descriptor, 4096)}</div>}
        </details>
      )}
    </div>
  )
}

function Monitor({ c, onClose }: { c: ScannedCollection; onClose(): void }) {
  const [reports, setReports] = useState<LiveReport[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let stop: (() => void) | null = null
    let alive = true
    setReports([])
    setError(null)
    listenTo(
      c,
      (r) => alive && setReports((prev) => [r, ...prev].slice(0, 300)),
      (e) => alive && setError(e),
    )
      .then((s) => (alive ? (stop = s) : s()))
      .catch((e) => alive && setError(String(e)))
    return () => {
      alive = false
      stop?.()
    }
  }, [c])
  const copy = () => navigator.clipboard.writeText(reports.map((r) => `${new Date(r.at).toISOString().slice(11, 23)}  ${hex(r.data, 512)}`).join('\n'))
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">
          Listening: {h4(c.vendorId)}:{h4(c.productId)} {usageName(c.usagePage, c.usage)}
        </span>
        <span className="text-muted-foreground">{reports.length} report(s), newest first. Press keys or turn knobs to see what the device sends.</span>
        <Button size="xs" variant="ghost" className="ml-auto" onClick={copy}>
          <CopyIcon data-icon="inline-start" />
          Copy
        </Button>
        <Button size="xs" variant="outline" onClick={onClose}>
          <SquareIcon data-icon="inline-start" />
          Stop
        </Button>
      </div>
      {error && <p className="text-xs text-amber-300">{error} (Windows keeps keyboard and mouse collections to itself; vendor collections can be read.)</p>}
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px] leading-relaxed">
        {reports.map((r, i) => (
          <div key={reports.length - i}>
            <span className="text-muted-foreground">{new Date(r.at).toISOString().slice(11, 23)} </span>
            {hex(r.data, 512)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- log ----------

const LEVELS: Record<string, Level[]> = {
  all: ['debug', 'info', 'warn', 'error'],
  info: ['info', 'warn', 'error'],
  problems: ['warn', 'error'],
}

function LogTab() {
  const header = useHeader()
  const [, force] = useState(0)
  const [filter, setFilter] = useState<keyof typeof LEVELS>('all')
  const [noisy, setNoisy] = useState(logSettings.noisy)
  const [copied, setCopied] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const off = onLog(() => force((n) => n + 1))
    return () => off()
  }, [])
  const shown = logEntries().filter((e) => LEVELS[filter].includes(e.level)).slice(-1500)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [shown.length])

  const copy = async () => {
    await navigator.clipboard.writeText(logText(header))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-8 rounded-md border bg-transparent px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as keyof typeof LEVELS)}>
          <option value="all">Everything (packets too)</option>
          <option value="info">Steps and problems</option>
          <option value="problems">Problems only</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={noisy}
            onChange={(e) => {
              logSettings.noisy = e.target.checked
              setNoisy(e.target.checked)
            }}
          />
          Include live-travel packets
        </label>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" onClick={copy}>
            <CopyIcon data-icon="inline-start" />
            {copied ? 'Copied' : 'Copy log'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => download(`fcc-log-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`, logText(header))}>
            <DownloadIcon data-icon="inline-start" />
            Save log
          </Button>
          <Button size="sm" variant="ghost" onClick={clearLog}>
            <Trash2Icon data-icon="inline-start" />
            Clear
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {Object.entries(header)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')}
      </p>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
        {shown.length === 0 && <span className="text-muted-foreground">Nothing logged yet.</span>}
        {shown.map((e, i) => (
          <div key={i} className={cn(e.level === 'error' && 'text-red-400', e.level === 'warn' && 'text-amber-300', e.level === 'debug' && 'text-muted-foreground')}>
            {formatEntry(e)}
          </div>
        ))}
        <div ref={end} />
      </div>
    </div>
  )
}
