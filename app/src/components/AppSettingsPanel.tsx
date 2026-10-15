import { BugIcon, CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isTauri } from '../desktop/env'
import { useStore } from '../store'
import { DesktopAppCards } from './DesktopPanel'
import { useDiagnostics } from './Diagnostics'
import { WhatsNewButton } from './WhatsNew'

/** The app's own settings, apart from the keyboard's: startup, tray, updates and help. */
export function AppSettingsPanel() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      {isTauri() && <DesktopAppCards />}
      <HelpCard />
    </div>
  )
}

function HelpCard() {
  const openIntro = useStore((s) => s.openIntro)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Help</CardTitle>
        <CardDescription>
          FCC {__APP_VERSION__}. Something not working? Diagnostics shows what FCC and the keyboard said to each other; Keyboard → Report this
          keyboard sends it to GitHub.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={openIntro}>
          <CompassIcon data-icon="inline-start" />
          Show intro
        </Button>
        <Button variant="outline" size="sm" onClick={() => useDiagnostics.getState().show('log')}>
          <BugIcon data-icon="inline-start" />
          Diagnostics
        </Button>
        {!isTauri() && <WhatsNewButton />}
      </CardContent>
    </Card>
  )
}
