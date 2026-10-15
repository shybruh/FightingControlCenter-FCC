import { useEffect, useState, type ReactNode } from 'react'
import { SparklesIcon } from 'lucide-react'
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

// "What's new": this version's CHANGELOG.md section (baked in at build time), shown once after an update.

const LAST_VERSION_KEY = 'fcc.lastVersion'
/** set once the welcome tour has been seen: tells an update apart from a fresh install */
const INTRO_SEEN_KEY = 'fcc.introSeen.v1'

const useWhatsNew = create<{ open: boolean }>(() => ({ open: false }))
export const showWhatsNew = () => useWhatsNew.setState({ open: true })
export const hasReleaseNotes = () => __RELEASE_NOTES__.length > 0

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Whether this start follows an update; decided once per start (and the version recorded) the first time it's asked. */
let updatedThisStart: boolean | null = null
function justUpdated() {
  if (updatedThisStart !== null) return updatedThisStart
  const last = read(LAST_VERSION_KEY)
  // versions before this feature didn't record themselves: someone who has seen the tour is updating
  updatedThisStart = last ? last !== __APP_VERSION__ : read(INTRO_SEEN_KEY) !== null
  try {
    localStorage.setItem(LAST_VERSION_KEY, __APP_VERSION__)
  } catch {
    /* storage unavailable: nothing to remember it by */
  }
  return updatedThisStart
}

/** Opens the notes once after an update; fresh installs get the welcome tour instead. */
export function useWhatsNewAfterUpdate() {
  useEffect(() => {
    if (!justUpdated() || !hasReleaseNotes()) return
    const timer = setTimeout(() => {
      // shown once, even when the app's start-up effects run twice
      if (updatedThisStart) showWhatsNew()
      updatedThisStart = false
    }, 1200)
    return () => clearTimeout(timer)
  }, [])
}

/** **bold**, *italic* and `code` inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-medium text-foreground">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-muted px-1 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

/** The changelog's markdown: ### headings and "- " bullets (continued by indented lines). */
function Notes({ markdown }: { markdown: string }) {
  const blocks: ({ kind: 'h'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'p'; text: string })[] = []
  for (const line of markdown.split('\n')) {
    const last = blocks.at(-1)
    if (line.startsWith('### ')) blocks.push({ kind: 'h', text: line.slice(4).trim() })
    else if (line.startsWith('- ')) {
      if (last?.kind === 'ul') last.items.push(line.slice(2).trim())
      else blocks.push({ kind: 'ul', items: [line.slice(2).trim()] })
    } else if (/^\s+\S/.test(line) && last?.kind === 'ul') last.items[last.items.length - 1] += ` ${line.trim()}`
    else if (line.trim() && last?.kind === 'p') last.text += ` ${line.trim()}`
    else if (line.trim()) blocks.push({ kind: 'p', text: line.trim() })
  }
  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      {blocks.map((b, i) =>
        b.kind === 'h' ? (
          <h3 key={i} className="mt-1 text-xs font-medium tracking-wide text-foreground uppercase first:mt-0">
            {b.text}
          </h3>
        ) : b.kind === 'ul' ? (
          <ul key={i} className="flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ) : (
          <p key={i} className="leading-relaxed">
            {inline(b.text)}
          </p>
        ),
      )}
    </div>
  )
}

export function WhatsNewDialog() {
  const open = useWhatsNew((s) => s.open)
  const close = () => useWhatsNew.setState({ open: false })
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && close()}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto data-[size=default]:max-w-lg data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            What's new in {__APP_VERSION__}
          </AlertDialogTitle>
          <AlertDialogDescription>FCC was updated. Your profiles and settings are kept.</AlertDialogDescription>
        </AlertDialogHeader>
        <Notes markdown={__RELEASE_NOTES__} />
        <AlertDialogFooter>
          <Button onClick={close}>Got it</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** "What's new" button for the updates row. */
export function WhatsNewButton() {
  const [ready] = useState(hasReleaseNotes)
  if (!ready) return null
  return (
    <Button variant="ghost" size="sm" onClick={showWhatsNew}>
      <SparklesIcon data-icon="inline-start" />
      What's new
    </Button>
  )
}
