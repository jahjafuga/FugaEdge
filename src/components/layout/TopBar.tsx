import { useLocation } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useThemeMode } from '@/lib/theme'
import ProfileMenu from './ProfileMenu'

const ROUTES: Record<string, { crumb: string; title: string }> = {
  '/dashboard': { crumb: 'Dashboard',  title: 'Performance Overview' },
  '/trades':    { crumb: 'Trades',     title: 'All Round Trips' },
  '/calendar':  { crumb: 'Calendar',   title: 'Trading Days' },
  '/analytics': { crumb: 'Analytics',  title: 'Deep Analytics' },
  '/intelligence': { crumb: 'EdgeIQ', title: 'Your Trading Edge' },
  '/journal':   { crumb: 'Journal',    title: 'Trading Journal' },
  '/import':    { crumb: 'Import',     title: 'Import Trades' },
  '/profile':   { crumb: 'Profile',    title: 'Trader Identity' },
  '/settings':  { crumb: 'Settings',   title: 'Configuration' },
  '/playbook':  { crumb: 'Playbook',   title: 'Setup Library' },
}

function routeFor(pathname: string): { crumb: string; title: string } {
  if (ROUTES[pathname]) return ROUTES[pathname]
  for (const key of Object.keys(ROUTES)) {
    if (pathname.startsWith(key + '/')) return ROUTES[key]
  }
  return { crumb: '—', title: 'FugaEdge' }
}

export default function TopBar() {
  const { pathname } = useLocation()
  const { crumb, title } = routeFor(pathname)

  return (
    <header className="topbar-glass sticky top-0 z-40 m-3 flex h-14 items-center justify-between gap-4 rounded-xl px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {crumb}
        </span>
        <span className="text-fg-muted">/</span>
        <span className="truncate text-sm font-medium text-fg-primary">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  )
}

// Quick theme toggle — flips between dark and light. If the user is on
// 'system' mode, clicking pins them to the opposite of the currently-resolved
// theme. Settings page exposes the full Dark / Light / System tri-state.
function ThemeToggle() {
  const { resolved, setMode } = useThemeMode()
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      data-tour="theme-toggle"
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 ease-out-soft hover:border-border hover:text-fg-primary"
    >
      {resolved === 'dark' ? (
        <Sun size={14} strokeWidth={2} />
      ) : (
        <Moon size={14} strokeWidth={2} />
      )}
    </button>
  )
}
