// @vitest-environment jsdom
//
// Multi-account Beat 4 — the Dashboard consumes the account scope and
// RE-FETCHES on scope change (no reload): dashboardGet is called with the
// scope, and a change fires a fresh call with the new one.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DashboardData } from '@shared/dashboard-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    dashboardGet: vi.fn(),
    tradesList: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import Dashboard from '../Dashboard'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// Empty dashboard fixture — the page renders its EmptyState (minimal DOM),
// which is all this wiring test needs.
function dashData(): DashboardData {
  return {
    range: '30d',
    range_start: null,
    overview: {
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 0,
      winners: 0,
      losers: 0,
      scratches: 0,
      win_rate: null,
      profit_factor: null,
      pnl_ratio: null,
      avg_winner: null,
      avg_loser: null,
      largest_winner: null,
      largest_loser: null,
    },
    daily: [],
    latest: {
      date: '',
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 0,
      winners: 0,
      losers: 0,
      trades: [],
    },
    month: { year: 2026, month: 6, days: [] },
    settings: { max_daily_loss: 20, daily_profit_target: 0, account_size: 1000 },
    discipline_streak: 0,
    empty: true,
  }
}

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
  m.dashboardGet.mockResolvedValue(dashData())
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Dashboard — scope-aware fetching', () => {
  it("fetches with the current scope ('all' at boot) and re-fetches on scope change", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Dashboard />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.dashboardGet).toHaveBeenCalled())
    expect(m.dashboardGet).toHaveBeenCalledWith('30d', 'all')
    await screen.findByText(/no trades yet/i) // EmptyState rendered

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() =>
      expect(m.dashboardGet).toHaveBeenCalledWith('30d', { accountId: 'ACCT-B' }),
    )
  })
})
