import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type LinkState = 'ok' | 'busy' | 'offline'

const STYLE: Record<LinkState, string> = {
  ok: 'bg-emerald-500 shadow-[0_0_0_3px] shadow-emerald-500/15',
  busy: 'status-pulse bg-amber-400 shadow-[0_0_0_3px] shadow-amber-400/20',
  offline: 'status-blink bg-red-500 shadow-[0_0_0_3px] shadow-red-500/20',
}

/** Connection / sync indicator: green synced, orange saving, red (blinking) not connected. */
export function StatusDot({ state, label }: { state: LinkState; label: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="status"
            aria-label={typeof label === 'string' ? label : undefined}
            className={cn('inline-block size-2 shrink-0 rounded-full transition-colors duration-300', STYLE[state])}
          />
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
