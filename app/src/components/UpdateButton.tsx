import { useState } from 'react'
import { DownloadIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { installUpdate, useUpdates } from '../desktop/updates'

/** Top-bar button that appears when a newer version is out. */
export function UpdateButton() {
  const { phase, version } = useUpdates()
  const [open, setOpen] = useState(false)
  if (phase !== 'available' && phase !== 'downloading') return null
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <DownloadIcon data-icon="inline-start" />
        {phase === 'downloading' ? 'Updating…' : `Update ${version}`}
      </Button>
      <UpdateDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

export function UpdateDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { phase, version, current, notes, progress, installed, error } = useUpdates()
  const downloading = phase === 'downloading'
  return (
    <AlertDialog open={open} onOpenChange={(o) => !downloading && onOpenChange(o)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Version {version} is available</AlertDialogTitle>
          <AlertDialogDescription>
            You have {current}.{' '}
            {installed
              ? 'FCC downloads the update, installs it and restarts. Your profiles and settings stay.'
              : 'This is the portable version: download the new zip from the release page and replace this one. Your profiles and settings stay.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {notes && (
          <div className="max-h-64 overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {notes}
          </div>
        )}
        {downloading && (
          <p className="text-sm text-muted-foreground">
            Downloading{progress != null ? ` · ${Math.round(progress * 100)}%` : '…'} The installer opens briefly, then FCC restarts.
          </p>
        )}
        {phase === 'error' && error && <p className="text-sm text-destructive">Update failed: {error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={downloading}>Later</AlertDialogCancel>
          <AlertDialogAction
            disabled={downloading}
            onClick={() => {
              void installUpdate()
              if (!installed) onOpenChange(false)
            }}
          >
            {installed ? 'Update and restart' : 'Open release page'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
