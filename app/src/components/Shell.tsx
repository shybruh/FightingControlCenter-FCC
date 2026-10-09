import { useRef, useState, type ReactNode } from 'react'
import {
  GaugeIcon,
  KeyboardIcon,
  LayersIcon,
  ListVideoIcon,
  MonitorIcon,
  MoreHorizontalIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  UploadIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { decodeInfo } from '../hid/codec'
import { isTauri } from '../hid/tauri'
import { useStore } from '../store'
import { AdvancedPanel } from './AdvancedPanel'
import { DesktopPanel } from './DesktopPanel'
import { KeymapPanel } from './KeymapPanel'
import { LightingPanel } from './LightingPanel'
import { MacroPanel } from './MacroPanel'
import { PerformancePanel } from './PerformancePanel'
import { PageScroll } from './ScrollArea'
import { StatusDot } from './StatusDot'
import { DeviceChoiceDialog, ReadOnlyBanner } from './DeviceGate'
import { SettingsPanel } from './SettingsPanel'

interface Page {
  id: string
  label: string
  icon: LucideIcon
  render(): ReactNode
}

const PAGES: Page[] = [
  { id: 'performance', label: 'Performance', icon: GaugeIcon, render: () => <PerformancePanel /> },
  { id: 'lighting', label: 'Lighting', icon: SunIcon, render: () => <LightingPanel /> },
  { id: 'keymap', label: 'Keymap', icon: KeyboardIcon, render: () => <KeymapPanel /> },
  { id: 'advanced', label: 'Advanced', icon: ZapIcon, render: () => <AdvancedPanel /> },
  { id: 'macros', label: 'Macros', icon: ListVideoIcon, render: () => <MacroPanel /> },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, render: () => <SettingsPanel /> },
  ...(isTauri() ? [{ id: 'desktop', label: 'Desktop', icon: MonitorIcon, render: () => <DesktopPanel /> }] : []),
]

const COLLAPSED_KEY = 'fcc.sidebar.collapsed'
/** In the desktop app the window frame already carries the name, so the in-page branding is web-only. */
const WEB = !isTauri()

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function Main() {
  const [page, setPage] = useState(PAGES[0].id)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const current = PAGES.find((p) => p.id === page) ?? PAGES[0]

  const toggle = () => {
    setCollapsed(!collapsed)
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '0' : '1')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex h-full">
      <Sidebar page={page} setPage={setPage} collapsed={collapsed} onToggle={toggle} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar title={current.label} />
        <ReadOnlyBanner />
        <DeviceChoiceDialog />
        <PageScroll resetKey={current.id}>
          <div key={current.id} className="page-enter mx-auto w-full max-w-6xl p-4 pb-16 md:p-6 md:pb-16">
            {current.render()}
          </div>
        </PageScroll>
      </main>
    </div>
  )
}

function TopBar({ title }: { title: string }) {
  const pending = useStore((s) => s.pendingWrites)
  const demo = useStore((s) => s.demo)
  const kbName = useStore((s) => s.device?.name ?? s.kb?.name)
  const info = decodeInfo(useStore((s) => s.regions)!.info)
  const disconnect = useStore((s) => s.disconnect)

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-6">
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <StatusDot
            state={pending ? 'busy' : 'ok'}
            label={pending ? 'Saving to keyboard…' : `Synced · firmware ${info.firmware}`}
          />
          <span className="hidden sm:inline">{kbName}</span>
          {demo && <Badge variant="secondary">demo</Badge>}
        </div>
        <Button variant="ghost" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    </header>
  )
}

/** Icon button that shows its label as a tooltip when the sidebar is collapsed. */
function RailItem({
  collapsed,
  label,
  active,
  onClick,
  children,
  className,
  disabled,
  onDoubleClick,
  plain,
}: {
  collapsed: boolean
  label: string
  active?: boolean
  onClick?(): void
  onDoubleClick?(): void
  children: ReactNode
  className?: string
  disabled?: boolean
  /** active state drawn by a separate sliding indicator */
  plain?: boolean
}) {
  const button = (
    <button
      className={cn(
        'relative flex h-8 w-full items-center gap-2.5 overflow-hidden rounded-md px-3 text-left text-sm whitespace-nowrap text-sidebar-foreground/75 transition-colors duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground disabled:opacity-50',
        active && 'font-medium text-sidebar-foreground',
        active && !plain && 'bg-sidebar-accent',
        className,
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </button>
  )
  if (!collapsed) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function Sidebar({
  page,
  setPage,
  collapsed,
  onToggle,
}: {
  page: string
  setPage(id: string): void
  collapsed: boolean
  onToggle(): void
}) {
  const profiles = useStore((s) => s.profiles)
  const activeId = useStore((s) => s.activeProfileId)
  const pending = useStore((s) => s.pendingWrites)
  const kbName = useStore((s) => s.device?.name ?? s.kb?.name)
  const { activateProfile, createProfile, duplicateProfile, renameProfile, deleteProfile, exportProfile, importProfile } = useStore.getState()
  const [editing, setEditing] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <aside
      className={cn(
        'flex min-h-0 shrink-0 flex-col gap-4 overflow-y-auto overflow-x-hidden border-r bg-sidebar p-2 text-sidebar-foreground transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        collapsed ? 'rail-collapsed w-14' : 'w-56',
      )}
    >
      {WEB && !collapsed && (
        <div className="flex items-center gap-2.5 px-1.5 pt-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <KeyboardIcon className="size-4" />
          </div>
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold">FCC</span>
            <span className="truncate text-xs text-muted-foreground">{kbName}</span>
          </div>
        </div>
      )}

      <nav className="relative flex flex-col gap-0.5 pt-1">
        <div
          aria-hidden
          className="nav-indicator absolute top-1 right-0 left-0 h-8 rounded-md bg-sidebar-accent"
          style={{ transform: `translateY(${Math.max(0, PAGES.findIndex((p) => p.id === page)) * 34}px)` }}
        />
        {PAGES.map((p) => (
          <RailItem key={p.id} plain collapsed={collapsed} label={p.label} active={page === p.id} onClick={() => setPage(p.id)}>
            <p.icon className="size-4 shrink-0" />
            <span className="rail-label truncate">{p.label}</span>
          </RailItem>
        ))}
      </nav>

      <div className="flex flex-col gap-0.5">
        {collapsed ? (
          <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" />
        ) : (
          <div className="flex h-7 items-center justify-between pr-1 pl-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LayersIcon className="size-3.5" />
              Profiles
            </span>
            <Button variant="ghost" size="icon-xs" title="New profile from current settings" onClick={() => createProfile(`Profile ${profiles.length + 1}`)}>
              <PlusIcon />
            </Button>
          </div>
        )}

        <ul className="flex flex-col gap-0.5">
          {profiles.map((p, i) => {
            const active = p.id === activeId
            const chip = (
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-medium',
                  active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
            )
            if (collapsed) {
              return (
                <li key={p.id}>
                  <RailItem collapsed label={p.name} active={active} className="px-2.5" disabled={pending > 0 && !active} onClick={() => !active && activateProfile(p.id)}>
                    {chip}
                  </RailItem>
                </li>
              )
            }
            return (
              <li key={p.id} className="group/item relative">
                {editing === p.id ? (
                  <Input
                    autoFocus
                    defaultValue={p.name}
                    className="h-8"
                    onBlur={(e) => {
                      renameProfile(p.id, e.target.value)
                      setEditing(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                ) : (
                  <>
                    <RailItem
                      collapsed={false}
                      label={p.name}
                      active={active}
                      className="pr-8 pl-2.5"
                      disabled={pending > 0 && !active}
                      onClick={() => !active && activateProfile(p.id)}
                      onDoubleClick={() => setEditing(p.id)}
                    >
                      {chip}
                      <span className="truncate">{p.name}</span>
                    </RailItem>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            className="absolute top-1 right-1 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                            aria-label="Profile actions"
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-40">
                        <DropdownMenuItem onClick={() => setEditing(p.id)}>Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateProfile(p.id)}>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportProfile(p.id)}>Export…</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" disabled={active || profiles.length <= 1} onClick={() => deleteProfile(p.id)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </li>
            )
          })}
        </ul>

        {!collapsed && (
          <RailItem collapsed={false} label="Import profile" className="text-muted-foreground" onClick={() => fileRef.current?.click()}>
            <UploadIcon className="size-4 shrink-0" />
            <span>Import profile</span>
          </RailItem>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) importProfile(await f.text())
            e.target.value = ''
          }}
        />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        {WEB && !collapsed && (
          <p className="px-2 text-xs text-muted-foreground">
            Changes save to the active profile and the keyboard instantly. Switching profiles writes the whole profile to the keyboard.
          </p>
        )}
        <RailItem collapsed={collapsed} label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="text-muted-foreground" onClick={onToggle}>
          {collapsed ? <PanelLeftOpenIcon className="size-4 shrink-0" /> : <PanelLeftCloseIcon className="size-4 shrink-0" />}
          <span className="rail-label">Collapse</span>
        </RailItem>
      </div>
    </aside>
  )
}
