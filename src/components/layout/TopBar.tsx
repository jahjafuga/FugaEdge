import { Link, useLocation } from 'react-router-dom'
import { Download, Moon, Sun } from 'lucide-react'
import { useThemeMode } from '@/lib/theme'

const ROUTES: Record<string, { crumb: string; title: string }> = {
  '/dashboard': { crumb: 'Dashboard',  title: 'Performance Overview' },
  '/trades':    { crumb: 'Trades',     title: 'All Round Trips' },
  '/calendar':  { crumb: 'Calendar',   title: 'Trading Days' },
  '/reports':   { crumb: 'Reports',    title: 'Performance Reports' },
  '/analytics': { crumb: 'Analytics',  title: 'Deep Analytics' },
  '/journal':   { crumb: 'Journal',    title: 'Trading Journal' },
  '/import':    { crumb: 'Import',     title: 'Import Trades' },
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
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-border-subtle bg-bg-1/80 px-6 backdrop-blur-md">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
          {crumb}
        </span>
        <span className="text-fg-muted">/</span>
        <span className="truncate text-sm font-medium text-fg-primary">
          {title}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <LivePill />
        <ThemeToggle />
        <Link
          to="/import"
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-gold px-3 text-xs font-semibold tracking-wide text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover active:bg-gold-dim"
        >
          <Download size={14} strokeWidth={2.25} />
          Import
        </Link>
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
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 ease-out-soft hover:border-border hover:text-fg-primary"
    >
      {resolved === 'dark' ? (
        <Sun size={14} strokeWidth={2} />
      ) : (
        <Moon size={14} strokeWidth={2} />
      )}
    </button>
  )
}

function LivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-win/30 bg-win-soft px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-win">
      <span
        className="inline-block h-1.5 w-1.5 rounded-full bg-win"
        style={{ boxShadow: '0 0 6px rgba(52,211,153,0.7)' }}
      />
      Live
    </span>
  )
}
