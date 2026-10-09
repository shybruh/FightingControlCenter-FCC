import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { KeyboardIcon } from 'lucide-react'

interface Payload {
  title: string
  subtitle: string
  index: number | null
}

/** Content of the transparent overlay window (see src-tauri/src/osd.rs). */
export function Osd() {
  const [shown, setShown] = useState<(Payload & { n: number }) | null>(null)

  useEffect(() => {
    let n = 0
    const off = listen<Payload>('osd-show', (e) => setShown({ ...e.payload, n: ++n }))
    return () => void off.then((u) => u())
  }, [])

  if (!shown) return null
  return (
    <div className="flex h-full items-center justify-center p-2">
      {/* keyed so every switch replays the in/out animation */}
      <div
        key={shown.n}
        className="osd-card flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-neutral-950/85 px-4 py-3 text-white shadow-2xl backdrop-blur-xl"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-950">
          {shown.index != null ? <span className="text-base font-semibold tabular-nums">{shown.index}</span> : <KeyboardIcon className="size-5" />}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[15px] font-semibold">{shown.title}</span>
          <span className="truncate text-xs text-white/60">{shown.subtitle}</span>
        </div>
      </div>
    </div>
  )
}
