// @vitest-environment jsdom
//
// Multi-account (Analytics slice) — the Analytics page consumes the account
// scope: ALL THREE of its fetches (analytics, reports, the tier-card trades
// list) carry it, and a scope change re-fires them (no reload). The effect
// resets data/reports/trades at its top, so no tab can render stale-scope
// data while the re-fetch is in flight.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AnalyticsData } from '@shared/analytics-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    analyticsGet: vi.fn(),
    reportsGet: vi.fn(),
    tradesList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import Analytics from '../Analytics'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// trade_count 0 -> the page renders its "nothing to analyze" empty state
// (no tabs mount), which is all this wiring test needs.
const EMPTY_ANALYTICS = { trade_count: 0 } as unknown as AnalyticsData

function ScopeProbe() {
  const { setScope } = useAccountScope()
  return (
    <button type="button" onClick={() => setScope({ accountId: 'ACCT-B' })}>
      probe-pick-b
    </button>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  m.analyticsGet.mockResolvedValue(EMPTY_ANALYTICS)
  m.reportsGet.mockResolvedValue(null as never)
  m.tradesList.mockResolvedValue([])
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Analytics — scope-aware fetching', () => {
  it("fetches all three sources with 'all' at boot and re-fetches on scope change", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Analytics />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.analyticsGet).toHaveBeenCalled())
    expect(m.analyticsGet).toHaveBeenCalledWith('all')
    expect(m.reportsGet).toHaveBeenCalledWith('all')
    expect(m.tradesList).toHaveBeenCalledWith({ accountScope: 'all' })
    await screen.findByText(/nothing to analyze yet/i)

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() => {
      expect(m.analyticsGet).toHaveBeenLastCalledWith({ accountId: 'ACCT-B' })
      expect(m.reportsGet).toHaveBeenLastCalledWith({ accountId: 'ACCT-B' })
      expect(m.tradesList).toHaveBeenLastCalledWith({
        accountScope: { accountId: 'ACCT-B' },
      })
    })
  })
})
