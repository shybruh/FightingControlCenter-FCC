import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Scroll container without a visible scrollbar. A small arrow fades in while there's more
 * content below and scrolls down when clicked.
 */
export function PageScroll({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 12)
    update()
    el.addEventListener('scroll', update, { passive: true })
    // content height changes as panels expand/collapse or animate in
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    const mo = new MutationObserver(update)
    mo.observe(el, { childList: true, subtree: true })
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
      mo.disconnect()
    }
  }, [])

  // new page starts at the top
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 })
  }, [resetKey])

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className="no-scrollbar h-full overflow-y-auto">
        {children}
      </div>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent transition-opacity duration-300',
          more ? 'opacity-100' : 'opacity-0',
        )}
      />
      <button
        aria-label="Scroll down"
        tabIndex={more ? 0 : -1}
        onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.75, behavior: 'smooth' })}
        className={cn(
          'scroll-hint absolute bottom-4 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-lg backdrop-blur transition-[opacity,transform,color] duration-300 hover:text-foreground',
          more ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
        )}
      >
        <ChevronDownIcon className="size-4" />
      </button>
    </div>
  )
}
