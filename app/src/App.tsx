import { useEffect } from 'react'
import { KeyboardIcon, UsbIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { isTauri } from './hid/tauri'
import { webHidSupported } from './hid/transport'
import { useStore } from './store'
import { useDesktopIntegration } from './desktop/integration'
import { Main } from './components/Shell'
import { StatusDot } from './components/StatusDot'

export default function App() {
  const status = useStore((s) => s.status)
  const tryReconnect = useStore((s) => s.tryReconnect)
  useDesktopIntegration()

  useEffect(() => {
    tryReconnect()
  }, [tryReconnect])

  return (
    <TooltipProvider>
      {status === 'ready' ? <Main /> : <Connect />}
      <Notices />
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  )
}

function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground', className)}>
      <KeyboardIcon className="size-4" />
    </div>
  )
}

function Connect() {
  const status = useStore((s) => s.status)
  const progress = useStore((s) => s.loadProgress)
  const connect = useStore((s) => s.connect)
  const supported = isTauri() || webHidSupported()
  const tryReconnect = useStore((s) => s.tryReconnect)
  const autoConnect = useStore((s) => s.autoConnect)

  // Desktop app: pick the keyboard up automatically when it's plugged in.
  useEffect(() => {
    if (!isTauri() || status !== 'idle' || !autoConnect) return
    const timer = setInterval(() => tryReconnect(), 2000)
    return () => clearInterval(timer)
  }, [status, autoConnect, tryReconnect])

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="pop-in w-full max-w-sm">
        <CardHeader>
          <BrandMark className="mb-2" />
          <CardTitle>Fighting Control Center</CardTitle>
          <CardDescription>Configurator for Hall-effect keyboards</CardDescription>
          <CardAction>
            <StatusDot
              state={status === 'idle' ? 'offline' : 'busy'}
              label={status === 'idle' ? 'Keyboard not connected' : status === 'loading' ? 'Reading keyboard…' : 'Connecting…'}
            />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {status === 'loading' ? (
            <>
              <p className="text-sm text-muted-foreground">Reading keyboard configuration…</p>
              <Progress value={progress * 100} />
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {isTauri()
                  ? 'Plug the keyboard in over USB. It connects automatically; current settings are read and backed up before anything changes.'
                  : 'Plug the keyboard in over USB, then connect. Current settings are read and backed up before anything changes.'}
              </p>
              <Button size="lg" disabled={!supported || status === 'connecting'} onClick={() => connect(false)}>
                <UsbIcon data-icon="inline-start" />
                {status === 'connecting' ? 'Waiting for permission…' : 'Connect keyboard'}
              </Button>
              {!supported && <p className="text-xs text-destructive">This browser has no WebHID. Use Chrome or Edge.</p>}
              <Button variant="ghost" onClick={() => connect(true)}>
                Try demo mode
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Bridges store errors / messages to sonner toasts. */
function Notices() {
  const error = useStore((s) => s.error)
  const message = useStore((s) => s.toast)
  const dismiss = useStore((s) => s.dismissError)
  useEffect(() => {
    if (!error) return
    toast.error(error, { duration: 8000 })
    dismiss()
  }, [error, dismiss])
  useEffect(() => {
    if (message) toast.success(message)
  }, [message])
  return null
}
