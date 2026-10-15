import { useEffect, useState } from 'react'
import { CheckIcon, ClipboardPasteIcon, CopyIcon, PlusIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { create } from 'zustand'
import { decodeShareCode, encodeShareCode, planImport, sharedFrom, type SharePlan, type SharedSettings } from '../share'
import { useStore } from '../store'
import { SwitchRow } from './ui'

// Share codes (src/share.ts): "Share code…" in a profile's menu makes one; "Paste share code" in the sidebar reads
// one and adds it as a new profile, so nothing the user already has is changed.

const useShare = create<{ share: string | null; paste: boolean }>(() => ({ share: null, paste: false }))
export const openShareCode = (profileId: string) => useShare.setState({ share: profileId })
export const openPasteCode = () => useShare.setState({ paste: true })

const textareaClass =
  'w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'

function ShareDialog() {
  const profileId = useShare((s) => s.share)
  const profile = useStore((s) => s.profiles.find((p) => p.id === profileId))
  const device = useStore((s) => s.device)
  const showToast = useStore((s) => s.showToast)
  const hasRt = device?.caps.performance !== false
  const [parts, setParts] = useState({ lighting: true, rt: true })
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!profile) return
    let alive = true
    const shared = sharedFrom(
      { name: profile.name, from: device?.name ?? 'Fighting68', led: profile.data.led, colors: profile.data.colors, rt: profile.data.rt, caps: device?.caps },
      { lighting: parts.lighting, rt: parts.rt && hasRt },
    )
    if (!shared.lighting && !shared.rt) setCode('')
    else void encodeShareCode(shared).then((c) => alive && setCode(c))
    return () => {
      alive = false
    }
  }, [profile, device, parts, hasRt])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      showToast("Couldn't copy: select the code and copy it")
    }
  }

  return (
    <AlertDialog open={!!profile} onOpenChange={(o) => !o && useShare.setState({ share: null })}>
      <AlertDialogContent className="data-[size=default]:max-w-lg data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Share “{profile?.name}”</AlertDialogTitle>
          <AlertDialogDescription>
            A code anyone can paste into FCC, on this keyboard or another one. Effects are matched by name and settings by key, within each
            keyboard's own limits. Macros, advanced keys and the keymap aren't included.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col">
          <SwitchRow label="Lighting" hint="Effect, colour, brightness, speed and per-key colours" checked={parts.lighting} onChange={(v) => setParts({ ...parts, lighting: v })} />
          {hasRt && (
            <SwitchRow label="Actuation and rapid trigger" hint="Per key, in millimetres" checked={parts.rt} onChange={(v) => setParts({ ...parts, rt: v })} />
          )}
        </div>
        <textarea readOnly rows={4} value={code || 'Pick something to share.'} onFocus={(e) => e.target.select()} className={textareaClass} />
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => useShare.setState({ share: null })}>
            Close
          </Button>
          <Button disabled={!code} onClick={copy}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy code'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PasteDialog() {
  const open = useShare((s) => s.paste)
  const regions = useStore((s) => s.regions)
  const device = useStore((s) => s.device)
  const addProfileWith = useStore((s) => s.addProfileWith)
  const [text, setText] = useState('')
  const [shared, setShared] = useState<SharedSettings | null>(null)
  const [plan, setPlan] = useState<SharePlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const close = () => useShare.setState({ paste: false })

  useEffect(() => {
    if (!open) {
      setText('')
      setShared(null)
      setPlan(null)
      setError(null)
    }
  }, [open])

  // read the code as it's pasted; nothing is applied until "Add as new profile"
  useEffect(() => {
    if (!text.trim() || !regions) {
      setShared(null)
      setPlan(null)
      setError(null)
      return
    }
    let alive = true
    decodeShareCode(text)
      .then((s) => {
        if (!alive) return
        setShared(s)
        setPlan(planImport(s, { led: regions.led, colors: regions.colors, rt: regions.rt }, device?.caps))
        setError(null)
      })
      .catch((e) => {
        if (!alive) return
        setShared(null)
        setPlan(null)
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      alive = false
    }
    // the plan is built from the settings at the time of pasting, not rebuilt as they change
  }, [text, device])

  const add = async () => {
    if (!shared || !plan) return
    close()
    // marked, so it doesn't look like the profile of the same name it was made from
    await addProfileWith(`${shared.name.slice(0, 50)} (shared)`, plan.patch)
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="data-[size=default]:max-w-lg data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Paste a share code</AlertDialogTitle>
          <AlertDialogDescription>
            It's added as a new profile made from your current settings, so the profiles you have stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <textarea autoFocus rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="FCC1-…" className={textareaClass} />
        {error && <p className="text-sm text-destructive">This code can't be used: {error}.</p>}
        {shared && plan && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <span className="font-medium">{shared.name}</span> <span className="text-muted-foreground">made on {shared.from}</span>
            </div>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
              {plan.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {plan.skipped.map((n) => (
                <li key={n} className="text-amber-300/90">
                  Left out: {n}
                </li>
              ))}
            </ul>
          </div>
        )}
        <AlertDialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!plan || Object.keys(plan.patch).length === 0} onClick={add}>
            <PlusIcon data-icon="inline-start" />
            Add as new profile
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ShareDialogs() {
  return (
    <>
      <ShareDialog />
      <PasteDialog />
    </>
  )
}

export { ClipboardPasteIcon as PasteIcon }
