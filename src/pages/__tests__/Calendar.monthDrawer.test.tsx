// @vitest-environment jsdom
//
// THE TILE CLICK OPENS A DRAWER, AND THE TOGGLE STILL OPENS THE GRID.
//
// Before this beat a month tile did one thing: set the view and flip back to
// the month grid (Calendar.tsx:349-352). That was the ONLY route from the year
// view into a month's days. Repointing it at a drawer spends that route, so
// the case that matters is the one that is easy to lose: the Month | Year
// toggle is still a way back to the grid.
//
// The scope-refetch page test's harness, mirrored — mocked @/lib/ipc, an
// in-memory localStorage, MemoryRouter + AccountScopeProvider.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CalendarMonth, CalendarYear } from '@shared/calendar-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { computeWeekMetrics } from '@/core/analytics/week'

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
import { AccountScopeProvider } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'

// jsdom ships no ResizeObserver; the month grid's chrome renders recharts'
// ResponsiveContainer, which requires one. The AnalyticsCompareTab precedent.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const m = vi.mocked(ipc)
const monthDetailGet = vi.fn()

function monthData(): CalendarMonth {
  return {
    stats: {
      year: 2026,
      month: 6,
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 2,
      winners: 1,
      losers: 1,
      trading_days: 1,
    },
    days: [
      {
        date: '2026-06-08',
        net_pnl: 180,
        gross_pnl: 180,
        total_fees: 0,
        trade_count: 2,
        winners: 1,
        losers: 1,
        avg_winner: 300,
        avg_loser: -120,
        day_tags: [],
        has_journal: false,
        no_trade_day: false,
        is_holiday: false,
        sentiment: null,
      },
    ],
    // range.latest MUST be non-null: Calendar.tsx:239 renders the
    // "No trading days to plot yet" empty state when it is, and that state has
    // no view toggle at all -- the control would have failed for the wrong
    // reason.
    range: { earliest: '2026-06-08', latest: '2026-06-08', monthsWithTrades: ['2026-06'] },
    weeks: [],
  }
}

function yearData(): CalendarYear {
  return {
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => ({
      year: 2026,
      month: i + 1,
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      trade_count: 0,
      winners: 0,
      losers: 0,
      trading_days: 0,
      avg_winner: null,
      avg_loser: null,
      top_mistake: null,
    })),
    range: { earliest: null, latest: null, monthsWithTrades: [] },
  }
}

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
  m.calendarYearGet.mockResolvedValue(yearData())
  m.settingsGet.mockResolvedValue(makeSettingsPayload({ account_scope: 'all' }))
  m.settingsSave.mockResolvedValue(makeSettingsPayload())
  m.accountsList.mockResolvedValue([])
  monthDetailGet.mockReset()
  // REAL METRICS, not a null stand-in: the Overview tab reads m.tradeCount the
  // moment the drawer mounts, so a hollow fixture crashes the render and the
  // case fails for a reason that has nothing to do with routing.
  monthDetailGet.mockResolvedValue({
    from: '2026-06-01',
    to: '2026-06-30',
    metrics: computeWeekMetrics({
      trades: [],
      weekEnd: '2026-06-30',
      dailyPnl: new Map(),
      exitDeltas: [],
    }),
    trades: [],
    entries: [],
  })
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(
    { monthDetailGet },
    {
      get: (t: Record<string, unknown>, k: string) =>
        k in t ? t[k] : () => Promise.resolve(null),
    },
  )
})

const mount = () =>
  render(
    <MemoryRouter>
      <AccountScopeProvider>
        <Calendar />
      </AccountScopeProvider>
    </MemoryRouter>,
  )

const goToYear = async () => {
  await waitFor(() => expect(m.calendarGet).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Year' }))
  await waitFor(() => expect(m.calendarYearGet).toHaveBeenCalled())
}

describe('AG6 the year view routes', () => {
  it('AG6 CONTROL: the Month | Year toggle still switches to the month grid', async () => {
    mount()
    await goToYear()
    expect(screen.queryByText('Click a month to open it.'), 'not in the year view').toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    await waitFor(() =>
      expect(
        screen.queryByText('Click a day to see its trades.'),
        'the toggle no longer reaches the month grid',
      ).toBeTruthy(),
    )
  })

  it('AG6b a month tile opens the drawer instead of the grid', async () => {
    mount()
    await goToYear()

    // The tile's label is the short month name (YearGrid.tsx:7 MONTHS), and its
    // accessible name is the whole tile's text, so it is found by prefix.
    const tile = screen
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').trim().startsWith('Jun'))
    expect(tile, 'no June tile in the year grid').toBeTruthy()
    fireEvent.click(tile!)
    await waitFor(() => expect(monthDetailGet).toHaveBeenCalledWith('2026-06', expect.anything()))

    // the drawer is up... (the fetch resolving is not the same tick as the
    // commit that paints the heading, so wait on the heading itself)
    await waitFor(() =>
      expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
    )
    // ...and the page did NOT fall back into the month grid behind it
    expect(
      screen.queryByText('Click a day to see its trades.'),
      'the tile still flipped the view',
    ).toBeNull()
  })
})
