// @vitest-environment jsdom
//
// Multi-account slice — the Calendar page consumes the account scope and
// RE-FETCHES on change (the Dashboard.scope-refetch mirror): calendarGet is
// called with the scope, and a change fires a fresh call with the new one.

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CalendarMonth } from '@shared/calendar-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    calendarGet: vi.fn(),
    calendarYearGet: vi.fn(),
    sessionSentimentSave: vi.fn(),
    settingsGet: vi.fn(),
    settingsSave: vi.fn(),
    accountsList: vi.fn(),
  },
}))

import Calendar from '../Calendar'
import { AccountScopeProvider, useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

const m = vi.mocked(ipc)

// Empty month fixture — the page renders its "no trading days" empty state
// (minimal DOM), which is all this wiring test needs.
function monthData(): CalendarMonth {
  return {
    stats: {
      year: 2026,
      month: 6,
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 0,
      winners: 0,
      losers: 0,
      trading_days: 0,
    },
    days: [],
    range: { earliest: null, latest: null, monthsWithTrades: [] },
    weeks: [],
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

// This vitest jsdom env ships no working localStorage (the
// Settings.activeCategory precedent) — install an in-memory one so the
// page's showWeekly / viewMode initializers can read.
function installMockLocalStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  installMockLocalStorage()
  m.calendarGet.mockResolvedValue(monthData())
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
})

describe('Calendar — scope-aware fetching', () => {
  it("fetches with the current scope ('all' at boot) and re-fetches on scope change", async () => {
    render(
      <MemoryRouter>
        <AccountScopeProvider>
          <ScopeProbe />
          <Calendar />
        </AccountScopeProvider>
      </MemoryRouter>,
    )
    await waitFor(() => expect(m.calendarGet).toHaveBeenCalled())
    const first = m.calendarGet.mock.calls[0]
    expect(first[2]).toBe('all')
    await screen.findByText(/no trading days to plot yet/i)

    fireEvent.click(screen.getByText('probe-pick-b'))
    await waitFor(() => {
      const last = m.calendarGet.mock.calls[m.calendarGet.mock.calls.length - 1]
      expect(last[2]).toEqual({ accountId: 'ACCT-B' })
    })
  })
})
