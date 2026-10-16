import { BugIcon, CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { isTauri } from '../desktop/env'
import { DENSITIES, useTheme, type Density } from '../theme'
import { AccentPicker, ThemeTiles } from './Appearance'
import { useStore } from '../store'
import { DesktopAppCards } from './DesktopPanel'
import { useDiagnostics } from './Diagnostics'
import { WhatsNewButton } from './WhatsNew'
import { Segmented } from './ui'

/** The app's own settings, apart from the keyboard's: startup, tray, updates and help. */
export function AppSettingsPanel() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <AppearanceCard />
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

function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>System follows Windows' light or dark setting.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ThemeTiles />
        <AccentPicker />
        <DensityRow />
      </CardContent>
    </Card>
  )
}

/** Compact: smaller text, spacing and keys for laptop screens. Auto picks it for small windows. */
function DensityRow() {
  const density = useTheme((s) => s.density)
  const setDensity = useTheme((s) => s.setDensity)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium">Density</span>
        <span className="text-xs text-muted-foreground">Compact fits more on a laptop screen. Auto uses it when the window is small.</span>
      </div>
      <Segmented<Density> value={density} options={DENSITIES.map((d) => ({ value: d.id, label: d.label }))} onChange={setDensity} />
    </div>
  )
}
