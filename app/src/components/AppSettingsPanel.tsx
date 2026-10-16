import { BugIcon, CompassIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { isTauri } from '../desktop/env'
import { THEMES, useTheme } from '../theme'
import { useStore } from '../store'
import { DesktopAppCards } from './DesktopPanel'
import { useDiagnostics } from './Diagnostics'
import { WhatsNewButton } from './WhatsNew'

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
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.set)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>System follows Windows' light or dark setting.</CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEMES.map((t) => {
            const [bg, card, primary] = t.swatch
            const on = theme === t.id
            return (
              <button
                key={t.id}
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(t.id)}
                className={cn(
                  'flex flex-col gap-2 rounded-lg border p-1.5 text-left transition-colors hover:bg-accent/50',
                  on && 'border-primary ring-1 ring-primary',
                )}
              >
                {/* a tiny window: sidebar, a card and the accent colour (System: half light, half dark) */}
                <span
                  className="relative flex h-14 overflow-hidden rounded-md border"
                  style={{ background: t.id === 'system' ? `linear-gradient(135deg, ${bg} 50%, oklch(0.145 0 0) 50%)` : bg }}
                >
                  <span className="w-1/4 opacity-60" style={{ background: card }} />
                  <span className="m-2 flex flex-1 flex-col justify-end gap-1 rounded p-1.5" style={{ background: card }}>
                    <span className="h-1.5 w-2/3 rounded-full" style={{ background: primary }} />
                    <span className="h-1.5 w-1/3 rounded-full opacity-50" style={{ background: primary }} />
                  </span>
                </span>
                <span className="px-1 text-sm">{t.label}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
