import { useEffect, useState, type ComponentType } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ListOrdered,
  CalendarDays,
  BookOpen,
  PieChart,
  Crosshair,
  NotebookPen,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { useAppVersion } from '@/lib/useAppVersion'
import BrandMark from './BrandMark'
import EdgeIqMark from '@/components/icons/EdgeIqMark'

interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  /** Optional icon-component override (e.g. the inline EdgeIqMark). When set,
   *  the row renders it in place of the lucide <Icon> — same currentColor /
   *  active-state treatment, since both are inline svg components. */
  iconComponent?: ComponentType<{ size?: number; className?: string }>
}

// Primary destinations only. Profile / Settings / Import moved to the top-right
// profile menu (TopBar / ProfileMenu) — the rail is just the workspace pages.
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/trades',    label: 'Trades',    Icon: ListOrdered },
  { to: '/calendar',  label: 'Calendar',  Icon: CalendarDays },
  { to: '/playbook',  label: 'Playbook',  Icon: BookOpen },
  { to: '/analytics', label: 'Analytics', Icon: PieChart },
  // EdgeIQ (v0.2.5 §I) — renders the inline EdgeIqMark in place of the lucide Icon.
  { to: '/intelligence', label: 'EdgeIQ', Icon: Crosshair, iconComponent: EdgeIqMark },
  { to: '/journal',   label: 'Journal',   Icon: NotebookPen },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const [streak, setStreak] = useState<number | null>(null)
  const version = useAppVersion()

  useEffect(() => {
    let cancelled = false
    ipc
      .dashboardGet('30d')
      .then((d) => {
        if (!cancelled) setStreak(d.discipline_streak ?? 0)
      })
      .catch(() => {
        if (!cancelled) setStreak(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      data-tour="sidebar"
      className="sidebar-aside relative m-3 flex flex-col rounded-xl"
    >
      {/* Toggle row — sits at the top-right edge of the rail. Right-aligned
          when expanded; centered when collapsed (the 64px rail has no
          meaningful "right corner"). The button itself is the visible
          affordance for keyboard users who don't remember Ctrl+B. */}
      <div
        className={`flex h-8 items-center ${
          collapsed ? 'justify-center' : 'justify-end pr-2'
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          title={`${toggleLabel} (Ctrl+B)`}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={2} />
          ) : (
            <ChevronLeft size={14} strokeWidth={2} />
          )}
        </button>
      </div>

      {/* Brand block. Collapsed mode centers a smaller mark; expanded keeps
          the full 60px logo + wordmark unit. */}
      <div
        className={`flex items-center ${
          collapsed ? 'h-14 justify-center' : 'h-16 gap-1 px-3'
        }`}
      >
        <BrandMark
          variant="mark"
          className={
            collapsed
              ? 'h-10 w-10 shrink-0'
              : 'h-[60px] w-[60px] shrink-0'
          }
        />
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-fg-primary">
              FugaEdge
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-wider text-fg-muted">
              edge journal
            </span>
          </div>
        )}
      </div>

      {/* Section divider */}
      <div className={`h-px bg-border-subtle ${collapsed ? 'mx-2' : 'mx-4'}`} />

      <nav
        className={`sidebar-scroll flex-1 overflow-y-auto py-3 ${
          collapsed ? 'px-2' : 'px-2'
        }`}
      >
        {!collapsed && (
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
            Workspace
          </div>
        )}
        <ul className="space-y-0.5">
          {NAV.map(({ to, label, Icon, iconComponent: IconComponent }) => (
            <li key={to}>
              <NavLink
                to={to}
                // Native title tooltip in collapsed mode — when the label
                // text is hidden, hover/focus has to surface the name.
                title={collapsed ? label : undefined}
                aria-label={collapsed ? label : undefined}
                // Tour anchor — strip the leading slash so steps look up
                // "nav-import" / "nav-trades" / etc.
                data-tour={`nav-${to.replace(/^\//, '')}`}
                className={({ isActive }) =>
                  `nav-row ${isActive ? 'is-active' : ''} ${
                    collapsed ? 'justify-center !px-0' : ''
                  }`
                }
              >
                {IconComponent ? (
                  <IconComponent size={18} className="shrink-0" />
                ) : (
                  <Icon size={18} strokeWidth={1.75} />
                )}
                {!collapsed && <span>{label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer — discipline streak + version. Collapses to an icon-only
          streak chip; version hides entirely (Ctrl+B + the toggle button
          remain the way to see it, by expanding). */}
      <div className={`border-t border-border-subtle ${collapsed ? 'p-2' : 'p-3'}`}>
        {streak !== null && streak > 0 ? (
          collapsed ? (
            <div
              className="flex items-center justify-center gap-1 rounded-md border border-gold/30 bg-gold/[0.06] py-1.5"
              title={`Discipline streak — ${streak} consecutive market day${streak === 1 ? '' : 's'} of trades or journal entries.`}
            >
              <Sparkles size={12} className="text-gold" strokeWidth={2} />
              <span className="font-mono text-[10px] font-semibold text-gold">
                {streak}d
              </span>
            </div>
          ) : (
            <div
              className="flex items-center gap-2 rounded-md border border-gold/30 bg-gold/[0.06] px-3 py-2"
              title={`Discipline streak — ${streak} consecutive market day${streak === 1 ? '' : 's'} of trades or journal entries.`}
            >
              <Sparkles size={14} className="text-gold" strokeWidth={2} />
              <span className="flex-1 text-[11px] font-medium tracking-wide text-fg-secondary">
                Discipline streak
              </span>
              <span className="font-mono text-xs font-semibold text-gold">
                {streak}d
              </span>
            </div>
          )
        ) : !collapsed ? (
          <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-2 px-3 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-muted" />
            <span className="flex-1 text-[11px] text-fg-tertiary">No streak yet</span>
          </div>
        ) : null}
        {!collapsed && (
          <div className="mt-2 px-1 text-[10px] uppercase tracking-wider text-fg-muted">
            {version === 'dev' ? 'dev' : `v${version}`}
          </div>
        )}
      </div>
    </aside>
  )
}
