// @vitest-environment jsdom
//
// AM4 -- A ROW OPENS THE FULL WEEK.
//
// Asserted on WHAT WAS OPENED, not on what was clicked: the week drawer's own
// header, read out of the DOM. June 2026's first row shows Jun 1..6 and must
// open May 31..Jun 6, so a drawer headed "Jun 1, 2026 → Jun 6, 2026" would be
// the clipped window wearing a week's clothes and would pass any assertion
// made on the click alone.
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { CalendarMonth, CalendarYear } from '@shared/calendar-types'
import { makeSettingsPayload } from '@/test/fixtures/settings'
import { computeWeekMetrics } from '@/core/analytics/week'
import { monthWeekRows } from '@/core/calendar/monthWeeks'

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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

const m = vi.mocked(ipc)
const monthDetailGet = vi.fn()
const weekDetailGet = vi.fn()

const EMPTY_METRICS = () =>
  computeWeekMetrics({ trades: [], weekEnd: '2026-06-30', dailyPnl: new Map(), exitDeltas: [] })

function monthData(): CalendarMonth {
  return {
    stats: {
      year: 2026, month: 6, net_pnl: 0, gross_pnl: 0, total_fees: 0,
      trade_count: 2, winners: 1, losers: 1, trading_days: 1,
    },
    days: [
      {
        date: '2026-06-08', net_pnl: 180, gross_pnl: 180, total_fees: 0,
        trade_count: 2, winners: 1, losers: 1, avg_winner: 300, avg_loser: -120,
        day_tags: [], has_journal: false, no_trade_day: false, is_holiday: false,
        sentiment: null,
      },
    ],
    range: { earliest: '2026-06-08', latest: '2026-06-08', monthsWithTrades: ['2026-06'] },
    weeks: [],
  }
}

function yearData(): CalendarYear {
  return {
    year: 2026,
    months: Array.from({ length: 12 }, (_, i) => ({
      year: 2026, month: i + 1, net_pnl: 0, gross_pnl: 0, total_fees: 0,
      trade_count: 0, winners: 0, losers: 0, trading_days: 0,
      avg_winner: null, avg_loser: null, top_mistake: null,
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
  weekDetailGet.mockReset()
  monthDetailGet.mockResolvedValue({
    from: '2026-06-01',
    to: '2026-06-30',
    metrics: EMPTY_METRICS(),
    trades: [],
    entries: [],
    notes: '',
    ladder: monthWeekRows('2026-06').map((r) => ({
      ...r,
      tradeCount: 3,
      netPnl: 120,
      tradingDays: 2,
      winRate: 0.5,
    })),
  })
  // THE WEEK DRAWER ANSWERS WITH WHATEVER IT WAS ASKED FOR, so the header this
  // test reads is a consequence of the id the row sent, not of the fixture.
  weekDetailGet.mockImplementation((weekStart: string) => {
    const [y, mo, d] = weekStart.split('-').map(Number)
    const end = new Date(Date.UTC(y, mo - 1, d + 6)).toISOString().slice(0, 10)
    return Promise.resolve({
      weekStart,
      weekEnd: end,
      metrics: EMPTY_METRICS(),
      trades: [],
      notes: '',
      entries: [],
    })
  })
  ;(globalThis as unknown as { window: { api: unknown } }).window.api = new Proxy(
    { monthDetailGet, weekDetailGet },
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

describe('AM4 a ladder row opens the full week', () => {
  it('AM4 the first June row shows Jun 1..6 and OPENS May 31..Jun 6', async () => {
    mount()
    await waitFor(() => expect(m.calendarGet).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    await waitFor(() => expect(m.calendarYearGet).toHaveBeenCalled())

    const tile = screen
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').trim().startsWith('Jun'))
    fireEvent.click(tile!)
    await waitFor(() =>
      expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
    )

    fireEvent.click(screen.getByRole('tab', { name: /Weeks/ }))
    const table = await screen.findByRole('table')
    const first = table.querySelectorAll('tbody tr')[0]
    // what the row SHOWS
    expect(first.textContent).toContain('Jun 1')
    expect(first.textContent).toContain('Jun 6')

    fireEvent.click(first)

    // WHAT WAS OPENED. The week drawer's own header, not the click.
    await waitFor(() =>
      expect(document.getElementById('week-review-title')?.textContent).toBe(
        'May 31 2026 → Jun 6 2026',
      ),
    )
    expect(weekDetailGet).toHaveBeenCalledWith('2026-05-31', expect.anything())
  })

  it('AM4b a NON-straddling row opens the same range it shows', async () => {
    mount()
    await waitFor(() => expect(m.calendarGet).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: 'Year' }))
    await waitFor(() => expect(m.calendarYearGet).toHaveBeenCalled())
    const tile = screen
      .getAllByRole('button')
      .find((b) => (b.textContent ?? '').trim().startsWith('Jun'))
    fireEvent.click(tile!)
    await waitFor(() =>
      expect(document.getElementById('month-review-title')?.textContent).toBe('June 2026'),
    )
    fireEvent.click(screen.getByRole('tab', { name: /Weeks/ }))
    const table = await screen.findByRole('table')
    fireEvent.click(table.querySelectorAll('tbody tr')[1])
    await waitFor(() =>
      expect(document.getElementById('week-review-title')?.textContent).toBe(
        'Jun 7 2026 → Jun 13 2026',
      ),
    )
  })
})
