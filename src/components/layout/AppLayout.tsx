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
import ActivationScreen from '@/components/activation/ActivationScreen'
import GraceBanner from '@/components/activation/GraceBanner'
import { verifyActivationKey } from '@/core/activation/verify'
import {
  ACTIVATION_FORCE_KEY,
  resolveActivationStatus,
  type ActivationStatus,
} from '@/core/activation/status'
import { CelebrationProvider } from '@/lib/celebration'

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

  // v0.2.5 §C — activation status. Resolves BEFORE the onboarding decision
  // (the gate mounts ahead of onboarding); null = still resolving → no
  // overlay rendered. Uses the same two fetches the onboarding check makes.
  const [activation, setActivation] = useState<ActivationStatus | null>(null)
  // Grace-mode voluntary key entry (banner button) — a dismissible overlay,
  // unlike the hard gate/locked mounts.
  const [graceKeyOpen, setGraceKeyOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const forceGate =
      window.localStorage.getItem(ACTIVATION_FORCE_KEY) === 'true'
    Promise.all([ipc.tradesList(), ipc.settingsGet()])
      .then(async ([trades, settings]) => {
        if (cancelled) return
        // Boot re-verify: a stored key is never trusted blindly — a tampered
        // settings row fails verification and degrades to "no key", putting
        // the gate/grace rules back in charge.
        let hasVerifiedKey = false
        if (settings.values.activation_key) {
          const verified = await verifyActivationKey(
            settings.values.activation_key,
          )
          hasVerifiedKey = verified.ok
        }
        const now = new Date().toISOString()
        const status = resolveActivationStatus({
          // A3 — renderer-side packaged signal, zero new preload surface.
          // Edge accepted: an unpackaged production PREVIEW (npm run
          // preview) enforces the gate — errs in the safe direction.
          isPackaged: import.meta.env.PROD,
          forceGate,
          hasVerifiedKey,
          tradeCount: trades.length,
          graceStartedAt: settings.values.activation_grace_started_at,
          now,
        })
        if (status.shouldStampGraceStart) {
          // Stamp exactly once: requested only while the stored stamp is
          // null/corrupt; subsequent boots read the persisted value and the
          // resolver never asks again.
          void ipc
            .settingsSave({ activation_grace_started_at: now })
            .catch((e) => console.warn('[activation] grace stamp failed:', e))
        }
        if (!cancelled) setActivation(status)
      })
      .catch((e) => {
        // A5 — the FETCH failing fails OPEN (onboarding-catch precedent):
        // the gate is a guest list, not a fortress; an IPC hiccup must never
        // brick the app. Stored-key tampering is handled above, not here.
        console.warn('[activation] status fetch failed — failing open:', e)
        if (!cancelled) setActivation({ mode: 'activated' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // First-launch check: trades empty + account_size unset + flag missing →
  // overlay the onboarding modal. The Settings "Restart onboarding" button
  // sets a force token that short-circuits the heuristic so the user can
  // replay the flow without wiping data. Runs once activation resolves —
  // v0.2.5 §C mounts the gate AHEAD of onboarding, so this decision waits
  // for mode === 'activated' (the effect re-fires when activation flips).
  useEffect(() => {
    if (activation?.mode !== 'activated') return
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
            // L24 — raw row existence, never the defaulted value (which is
            // 25,000 on a fresh DB and suppressed onboarding forever).
            accountSizeStored: settings.stored_keys.includes('account_size'),
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
  }, [activation?.mode])

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
    <CelebrationProvider>
      <div
      className={`relative isolate grid h-full text-fg-primary transition-[grid-template-columns] duration-200 ease-out ${
        collapsed ? 'grid-cols-[64px_1fr]' : 'grid-cols-[180px_1fr]'
      }`}
    >
      {/* Phase 2 — the ONE app-wide aurora, mounted behind the whole grid as a
          single continuous field: the frosted rail blurs it, and <main> (now
          transparent) shows the SAME field in the content area — so there is no
          seam between the rail's gaps and the content backdrop. */}
      <div className="app-aurora" aria-hidden="true" />
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="relative isolate flex min-w-0 flex-col overflow-hidden">
        <TopBar />
        <UpdateBanner />
        <GraceBanner
          mode={activation?.mode ?? null}
          daysLeft={activation?.graceDaysLeft ?? 0}
          onEnterKey={() => setGraceKeyOpen(true)}
        />
        <div className="flex-1 overflow-y-auto">
          <div className="animate-fade-in px-6 py-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* v0.2.5 §C — activation wall. Hard (non-dismissible) mounts for
          gate/locked; grace gets a dismissible overlay via the banner
          button. Mounts AHEAD of onboarding — the onboarding effect waits
          for mode === 'activated', so the two overlays can never stack. */}
      {activation &&
        (activation.mode === 'gate' || activation.mode === 'locked') && (
          <ActivationScreen
            mode={activation.mode}
            onActivated={() => setActivation({ mode: 'activated' })}
          />
        )}
      {activation?.mode === 'grace' && graceKeyOpen && (
        <ActivationScreen
          mode="gate"
          onDismiss={() => setGraceKeyOpen(false)}
          onActivated={() => {
            setGraceKeyOpen(false)
            setActivation({ mode: 'activated' })
          }}
        />
      )}

      {showOnboarding === true && (
        <OnboardingModal
          onComplete={() => {
            // Hide the overlay; the underlying routes will refetch on next
            // navigation. Force a hard reload so dashboard / sidebar /
            // today-session-card pick up the freshly-seeded data without
            // a per-page refresh dance. The tour then triggers on the
            // fresh load because its flag is still unset — but it needs
            // Dashboard-only anchors (today-session, sentiment,
            // edge-intelligence) so we route there first.
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
    </CelebrationProvider>
  )
}
