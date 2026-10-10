import { useState } from 'react'
import { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, FlagIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { buildReport, issueUrl, openExternal, type Report } from '../report'
import { useStore } from '../store'

/** "Report this keyboard": builds a board report and hands it to GitHub. */
export function ReportButton({ size = 'default', variant = 'outline' }: { size?: 'sm' | 'default'; variant?: 'outline' | 'ghost' }) {
  const kb = useStore((s) => s.kb)
  const device = useStore((s) => s.device)
  const regions = useStore((s) => s.readAtConnect)
  const demo = useStore((s) => s.demo)
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)

  const open = async () => {
    if (!kb) return
    setBusy(true)
    try {
      setReport(await buildReport({ identity: kb.identity, device, regions, demo }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button size={size} variant={variant} disabled={!kb || busy} onClick={open}>
        <FlagIcon data-icon="inline-start" />
        Report this keyboard
      </Button>
      <ReportDialog report={report} onClose={() => setReport(null)} />
    </>
  )
}

function ReportDialog({ report, onClose }: { report: Report | null; onClose(): void }) {
  const showToast = useStore((s) => s.showToast)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!report) return false
    try {
      await navigator.clipboard.writeText(report.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
      return true
    } catch {
      showToast("Couldn't copy: use Save file instead")
      return false
    }
  }

  const save = () => {
    if (!report) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([report.markdown], { type: 'text/markdown' }))
    a.download = `fcc-report-${report.title.match(/\((.*)\)/)?.[1]?.replace(':', '-') ?? 'keyboard'}.md`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const openIssue = async () => {
    if (!report) return
    const { url, prefilled } = issueUrl(report)
    if (!prefilled && (await copy())) showToast('Report copied: paste it into the issue')
    try {
      await openExternal(url)
    } catch {
      showToast("Couldn't open the browser")
    }
  }

  return (
    <AlertDialog open={!!report} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent className="max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Report this keyboard</AlertDialogTitle>
          <AlertDialogDescription>
            This report holds what FCC needs to support your board: its USB id, firmware and the settings read from it. Macro contents are left
            out. Open a GitHub issue with it, tick what worked, and the board can be marked verified or fixed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {report?.markdown}
        </pre>
        <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={copy}>
              {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" onClick={save}>
              <DownloadIcon data-icon="inline-start" />
              Save file
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={openIssue}>
              <ExternalLinkIcon data-icon="inline-start" />
              Open GitHub issue
            </Button>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
