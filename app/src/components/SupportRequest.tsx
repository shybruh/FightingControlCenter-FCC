import { useEffect, useState } from 'react'
import { CheckIcon, CopyIcon, ExternalLinkIcon, KeyboardIcon, RefreshCwIcon, SparklesIcon, XIcon } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { log } from '../diag/log'
import { isTauri } from '../hid/tauri'
import { issueUrl, openExternal } from '../report'
import { buildRequest, chipGuess, findUnsupported, hideId, listKeyboards, pickKeyboard, usbId, type UsbKeyboard } from '../support'
import { useStore } from '../store'
import { create } from 'zustand'

/** Which board the request dialog is open for (null: closed; 'pick': choose one). */
const useSupport = create<{ open: UsbKeyboard | 'pick' | null }>(() => ({ open: null }))
export const openSupportRequest = (board?: UsbKeyboard) => useSupport.setState({ open: board ?? 'pick' })

/** Desktop app, start screen: keeps an eye out for keyboards FCC can't drive yet. */
function useUnsupported(active: boolean) {
  const [list, setList] = useState<UsbKeyboard[]>([])
  useEffect(() => {
    if (!active || !isTauri()) return
    let alive = true
    const look = () =>
      findUnsupported()
        .then((l) => alive && setList(l))
        .catch((e) => log.warn('support', 'scan for unsupported keyboards failed', String(e)))
    void look()
    const timer = setInterval(look, 4000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [active])
  return [list, setList] as const
}

/** "Found a keyboard FCC doesn't support yet", on the start screen. */
export function UnsupportedNotice({ active }: { active: boolean }) {
  const [list, setList] = useUnsupported(active)
  const board = list[0]
  if (!board) return null
  const name = board.product || 'A USB keyboard'
  return (
    <div className="swap-in flex flex-col gap-3 rounded-lg border border-sky-400/25 bg-sky-400/[0.06] p-3 text-sm">
      <div className="flex items-start gap-2.5">
        <KeyboardIcon className="mt-0.5 size-4 shrink-0 text-sky-300" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {name} <span className="font-mono text-xs text-muted-foreground">{usbId(board)}</span>
          </div>
          <div className="text-muted-foreground">FCC doesn't support this keyboard yet. Send a request with its details and it can be added.</div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Hide this keyboard"
          title="Not a gaming keyboard? Hide it"
          onClick={() => {
            hideId(usbId(board))
            setList(list.slice(1))
          }}
        >
          <XIcon />
        </Button>
      </div>
      <Button size="sm" variant="outline" onClick={() => openSupportRequest(board)}>
        <SparklesIcon data-icon="inline-start" />
        Request support
      </Button>
    </div>
  )
}

const BLANK = { brand: '', model: '', link: '', notes: '' }

export function SupportRequestDialog() {
  const open = useSupport((s) => s.open)
  const close = () => useSupport.setState({ open: null })
  const showToast = useStore((s) => s.showToast)
  const [boards, setBoards] = useState<UsbKeyboard[] | null>(null)
  const [board, setBoard] = useState<UsbKeyboard | null>(null)
  const [details, setDetails] = useState(BLANK)
  const [preview, setPreview] = useState<{ title: string; markdown: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const refresh = async () => {
    try {
      const list = await listKeyboards()
      // unsupported first
      setBoards(list.sort((a, b) => Number(a.known) - Number(b.known)))
    } catch (e) {
      log.warn('support', 'listing keyboards failed', String(e))
      setBoards([])
    }
  }

  useEffect(() => {
    if (!open) return
    setDetails(BLANK)
    setPreview(null)
    setBoard(open === 'pick' ? null : open)
    if (open === 'pick') void refresh()
  }, [open])

  const choose = async () => {
    // the browser only lists keyboards the user hands over in its picker
    try {
      await pickKeyboard()
    } catch {
      /* picker closed */
    }
    await refresh()
  }

  const build = async () => {
    if (!board) return null
    setBusy(true)
    try {
      const r = await buildRequest(board, details)
      setPreview(r)
      return r
    } catch (e) {
      log.warn('support', 'building the request failed', String(e))
      showToast("Couldn't read the keyboard's details")
      return null
    } finally {
      setBusy(false)
    }
  }

  const copy = async (r = preview) => {
    if (!r) return false
    try {
      await navigator.clipboard.writeText(r.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return true
    } catch {
      showToast("Couldn't copy to the clipboard")
      return false
    }
  }

  const send = async () => {
    const r = await build()
    if (!r) return
    const { url, prefilled } = issueUrl(r, 'support-request.yml', 'request')
    if (!prefilled && (await copy(r))) showToast('Request copied: paste it into the issue')
    try {
      await openExternal(url)
    } catch {
      showToast("Couldn't open the browser")
    }
  }

  const set = (k: keyof typeof BLANK) => (e: { target: { value: string } }) => {
    setDetails({ ...details, [k]: e.target.value })
    setPreview(null)
  }

  return (
    <AlertDialog open={!!open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto data-[size=default]:max-w-xl data-[size=default]:sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Request support for a keyboard</AlertDialogTitle>
          <AlertDialogDescription>
            FCC reads the keyboard's USB id, its name and the technical description it gives of itself. That's usually enough to tell which chip it
            uses and whether FCC can talk to it. Nothing you type is read. You'll review it on GitHub before posting.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!board ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Which keyboard?</span>
              {isTauri() ? (
                <Button variant="ghost" size="sm" onClick={refresh}>
                  <RefreshCwIcon data-icon="inline-start" />
                  Refresh
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={choose}>
                  Choose keyboard…
                </Button>
              )}
            </div>
            {boards?.length === 0 && (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                {isTauri() ? 'No USB keyboard found. Plug it in with the cable (not the wireless receiver).' : 'Press "Choose keyboard…" and pick yours in the list.'}
              </p>
            )}
            <ul className="flex max-h-64 flex-col gap-1 overflow-auto">
              {boards?.map((k) => (
                <li key={usbId(k)}>
                  <button
                    className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50"
                    disabled={k.known}
                    onClick={() => setBoard(k)}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{k.product || 'USB keyboard'}</span>
                    <span className="font-mono text-xs text-muted-foreground">{usbId(k)}</span>
                    {k.known ? <Badge className="bg-emerald-500/15 text-emerald-400">Supported</Badge> : <Badge variant="secondary">Not yet</Badge>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <KeyboardIcon className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {board.product || 'USB keyboard'} <span className="font-mono text-xs text-muted-foreground">{usbId(board)}</span>
                </div>
                <div className="text-xs text-muted-foreground">Chip: {chipGuess(board)}</div>
              </div>
              {open === 'pick' && (
                <Button variant="ghost" size="sm" onClick={() => setBoard(null)}>
                  Change
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Brand" placeholder="e.g. Akko" value={details.brand} onChange={set('brand')} />
              <Field label="Model" placeholder="as printed on the box" value={details.model} onChange={set('model')} />
            </div>
            <Field label="Product page (optional)" placeholder="https://…" value={details.link} onChange={set('link')} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="support-notes">Notes (optional)</Label>
              <textarea
                id="support-notes"
                rows={3}
                value={details.notes}
                onChange={set('notes')}
                placeholder="Which software or web driver configures it today, Hall-effect or not, anything else that helps"
                className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            </div>
            {preview ? (
              <pre className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                {preview.markdown}
              </pre>
            ) : (
              <button className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground" disabled={busy} onClick={() => void build()}>
                Show exactly what's sent
              </button>
            )}
          </div>
        )}

        <AlertDialogFooter className={cn('flex-wrap gap-2', board ? 'sm:justify-between' : '')}>
          {board && (
            <Button variant="ghost" disabled={busy} onClick={async () => void copy(preview ?? (await build()))}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>
              Close
            </Button>
            {board && (
              <Button disabled={busy} onClick={send}>
                <ExternalLinkIcon data-icon="inline-start" />
                Open GitHub issue
              </Button>
            )}
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Field({ label, ...input }: { label: string; placeholder: string; value: string; onChange(e: { target: { value: string } }): void }) {
  const id = `support-${label.split(' ')[0].toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...input} />
    </div>
  )
}
