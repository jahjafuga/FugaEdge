// @vitest-environment jsdom
//
// Aurora calm on the Technicals tab. The app-wide gold diagonal (.app-aurora,
// z-index:-1) streaks through THIS tab because it is the only Analytics tab whose
// widgets are not wrapped in the 0.92-opaque .card-premium surface — its MACD grid
// cards and VWAP/EMA band rows carry only a ~0.12 semantic tint, so the aurora reads
// through at ~88% instead of the designed ~8%. The tab therefore dims the aurora via
// a body class, exactly like Calendar's cal-year-view.
//
// What this file locks is the LIFECYCLE, not the pixels: the class must be ON while
// the tab is mounted and GONE the moment it is not — otherwise switching tabs or
// leaving the page would strand the dim on every other screen. The CSS opacity value
// itself is visual and belongs to the eyes-gate, not to a unit test.

import { render } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    listTradesWithTechnicals: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))
// The tab's widgets are irrelevant here — stub them so this test is about the body
// class alone (the same stub set the scope-refetch sibling uses).
vi.mock('../technicals/TechnicalsFilterBar', () => ({ default: () => null }))
vi.mock('../technicals/HeaderStripCards', () => ({ default: () => null }))
vi.mock('../technicals/MacdStateGrid', () => ({ default: () => null }))
vi.mock('../technicals/VwapDistanceBand', () => ({ default: () => null }))
vi.mock('../technicals/EmaDistanceBand', () => ({ default: () => null }))
vi.mock('../technicals/CombinedReadsBand', () => ({ default: () => null }))
vi.mock('../technicals/TimeOfDayMatrix', () => ({ default: () => null }))
vi.mock('../technicals/UnclassifiedChip', () => ({ default: () => null }))

import TechnicalsTab from '../TechnicalsTab'
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// Must stay in lockstep with the selector in index.css: `body.analytics-technicals`.
const CLASS = 'analytics-technicals'
const bodyHasCalm = () => document.body.classList.contains(CLASS)

beforeEach(() => {
  vi.clearAllMocks()
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  m.listTradesWithTechnicals.mockResolvedValue([])
  document.body.classList.remove(CLASS)
})

describe('TechnicalsTab — aurora calm body class', () => {
  it('is ABSENT when the tab is not rendered', () => {
    expect(bodyHasCalm()).toBe(false)
  })

  it('is PRESENT while the tab is mounted', () => {
    render(
      <AccountScopeProvider>
        <TechnicalsTab allTimeTotal={0} />
      </AccountScopeProvider>,
    )
    expect(bodyHasCalm()).toBe(true)
  })

  it('is REMOVED on unmount — leaving the page must not strand the dim everywhere else', () => {
    const { unmount } = render(
      <AccountScopeProvider>
        <TechnicalsTab allTimeTotal={0} />
      </AccountScopeProvider>,
    )
    expect(bodyHasCalm()).toBe(true)
    unmount()
    expect(bodyHasCalm()).toBe(false)
  })

  it('is REMOVED when the tab is switched away', () => {
    // Models Analytics.tsx:231 — `{tab === 'technicals' && <TechnicalsTab .../>}`.
    // The tab is conditionally MOUNTED, so a tab switch unmounts it, which is what
    // must drop the class. This is the assertion that fails if the cleanup is lost.
    function Host({ active }: { active: boolean }) {
      return (
        <AccountScopeProvider>
          {active && <TechnicalsTab allTimeTotal={0} />}
        </AccountScopeProvider>
      )
    }
    const { rerender } = render(<Host active />)
    expect(bodyHasCalm()).toBe(true)

    rerender(<Host active={false} />)
    expect(bodyHasCalm()).toBe(false)
  })
})
