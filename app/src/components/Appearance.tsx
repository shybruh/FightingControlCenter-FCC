import { cn } from '@/lib/utils'
import { ACCENTS, THEMES, accentColors, isDarkTheme, useTheme } from '../theme'

/** The theme tiles: a tiny window per theme (Settings → Appearance, and the intro). */
export function ThemeTiles({ className }: { className?: string }) {
  const theme = useTheme((s) => s.theme)
  const setTheme = useTheme((s) => s.set)
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
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
  )
}

/** The highlight colour on top of any theme: the theme's own, a preset, or any colour. */
export function AccentPicker() {
  const theme = useTheme((s) => s.theme)
  const accent = useTheme((s) => s.accent)
  const setAccent = useTheme((s) => s.setAccent)
  const dark = isDarkTheme(theme)
  const custom = accent.startsWith('#')
  const dot = 'relative size-7 shrink-0 rounded-full border transition-transform hover:scale-110'
  const ring = 'ring-2 ring-foreground ring-offset-2 ring-offset-card'
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <span className="text-sm font-medium">Accent colour</span>
      <div role="radiogroup" aria-label="Accent colour" className="flex flex-wrap items-center gap-2.5">
        {/* the theme's own highlight: half light, half dark like the theme's default */}
        <button
          role="radio"
          aria-checked={accent === 'default'}
          title="Theme's own"
          onClick={() => setAccent('default')}
          className={cn(dot, 'bg-[linear-gradient(135deg,var(--foreground)_50%,var(--background)_50%)]', accent === 'default' && ring)}
        />
        {ACCENTS.map((a) => (
          <button
            key={a.id}
            role="radio"
            aria-checked={accent === a.id}
            title={a.label}
            onClick={() => setAccent(a.id)}
            className={cn(dot, accent === a.id && ring)}
            style={{ background: accentColors(a.id, dark)![0] }}
          />
        ))}
        {/* any colour: the system colour picker */}
        <label
          title="Custom colour"
          className={cn(dot, 'cursor-pointer overflow-hidden', custom && ring)}
          style={{ background: custom ? accent : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
        >
          <input
            type="color"
            aria-label="Custom accent colour"
            className="absolute inset-0 cursor-pointer opacity-0"
            value={custom ? accent : '#3b82f6'}
            onChange={(e) => setAccent(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}
