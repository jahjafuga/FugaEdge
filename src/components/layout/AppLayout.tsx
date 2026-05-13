import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import OnboardingModal from '@/components/onboarding/OnboardingModal'
import ProductTour from '@/components/tour/ProductTour'
import UpdateBanner from './UpdateBanner'
import { ipc } from '@/lib/ipc'
import {
  ONBOARDING_FLAG_KEY,
  ONBOARDING_FORCE_KEY,
  shouldShowOnboarding,
} from '@/core/onboarding'
import {
  TOUR_FLAG_KEY,
  TOUR_FORCE_KEY,
  shouldShowTour,
} from '@/core/tour'

const SIDEBAR_STORAGE_KEY = 'fugaedge-sidebar-collapsed'

// Read initial collapsed state synchronously from localStorage inside the
// useState initializer — that way the very first React render already uses
// the persisted value, and there's no flash from default→stored.
function readInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(readInitialCollapsed)
  // null = not yet decided (loading); boolean once the trigger check runs.
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)
  // Product tour visibility — initialized from localStorage synchronously
  // so the renderer can decide WITHOUT waiting on IPC. Set to false while
  // onboarding is showing so the two overlays never stack.
  const [showTour, setShowTour] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const flagSet = window.localStorage.getItem(TOUR_FLAG_KEY) === 'true'
    const force = window.localStorage.getItem(TOUR_FORCE_KEY) === 'true'
    return shouldShowTour({ flagSet, forceRestart: force })
  })

  // First-launch check: trades empty + account_size unset + flag missing →
  // overlay the onboarding modal. The Settings "Restart onboarding" button
  // sets a force token that short-circuits the heuristic so the user can
  // replay the flow without wiping data. Runs once on mount.
  useEffect(() => {
    let cancelled = false
    const flagSet = window.localStorage.getItem(ONBOARDING_FLAG_KEY) === 'true'
    const forceRestart =
      window.localStorage.getItem(ONBOARDING_FORCE_KEY) === 'true'
    if (flagSet && !forceRestart) {
      setShowOnboarding(false)
      return
    }
    Promise.all([ipc.tradesList(), ipc.settingsGet()])
      .then(([trades, settings]) => {
        if (cancelled) return
        setShowOnboarding(
          shouldShowOnboarding({
            tradeCount: trades.length,
            accountSize: settings.values.account_size,
            flagSet,
            forceRestart,
          }),
        )
      })
      .catch(() => {
        if (!cancelled) setShowOnboarding(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), [])

  // Persist on every change.
  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  // Ctrl+B (Cmd+B on Mac) toggles the sidebar. Mirrors VS Code / Cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        // Skip when an input/textarea/contenteditable has focus so typing a
        // literal "Ctrl+B" inside a journal/notes field doesn't toggle the
        // chrome.
        const t = e.target as HTMLElement | null
        const tag = t?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return
        e.preventDefault()
        toggleCollapsed()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCollapsed])

  return (
    <div
      className={`grid h-full text-fg-primary transition-[grid-template-columns] duration-200 ease-out ${
        collapsed ? 'grid-cols-[64px_1fr]' : 'grid-cols-[180px_1fr]'
      }`}
    >
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="relative flex min-w-0 flex-col overflow-hidden bg-bg-0">
        <TopBar />
        <UpdateBanner />
        <div className="flex-1 overflow-y-auto">
          <div className="animate-fade-in px-6 py-6">
            <Outlet />
          </div>
        </div>
      </main>

      {showOnboarding === true && (
        <OnboardingModal
          onComplete={() => {
            // Hide the overlay; the underlying routes will refetch on next
            // navigation. Force a hard reload so dashboard / sidebar /
            // today-session-card pick up the freshly-seeded data without
            // a per-page refresh dance. The tour then triggers on the
            // fresh load because its flag is still unset — but it needs
            // Dashboard-only anchors (today-session, sentiment,
            // edge-insights) so we route there first.
            setShowOnboarding(false)
            window.location.hash = '#/dashboard'
            window.location.reload()
          }}
        />
      )}

      {/* Product tour — only shows when onboarding is NOT active. After
          onboarding completes the page reloads, so on the next mount this
          fires automatically (tour flag absent). The Settings "Restart
          tour" button flips a force token and reloads. */}
      {showOnboarding === false && showTour && (
        <ProductTour onComplete={() => setShowTour(false)} />
      )}
    </div>
  )
}
