// @vitest-environment jsdom
//
// Dave #17 — TRADE CYCLING IN THE STACKED MODAL. The stacked
// TradeDetailModal gains the nav props it was built for: orderedIds
// SNAPSHOTTED at selectTrade time from the tab's DISPLAYED order,
// getTradeNavPosition deriving navPosition, onNavigate through the
// stack. Layering per the shipped gate: trade stacked -> keys cycle
// trades (the day/week shell arrows stay dead); unstacked -> keys cycle
// days again. The sticky tab un-parks via the prevIdRef discriminator in
// the modal itself (fresh open resets to Overview, cycle keeps the tab,
// every close path nulls the ref).
//
// NOTE (recon): the trade modal's tabs are Overview / Journal /
// Attachments — the ticket's "Technicals" example is a Sheet-only tab, so
// the sticky pins here use Journal as the non-default tab.
//
// Mount shape: DayDetailModal / WeekReviewModal directly (not the whole
// Calendar page) behind the dayWeekCycling window.api Proxy pattern, with
// the day modal's OWN nav wired where the layering pin needs it.

import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { DayDetail, DayMetrics } from '@shared/day-types'
import type { WeekDetail, WeekMetrics } from '@shared/week-types'
import type { TradeListRow } from '@shared/trades-types'
import { makeTrade } from '@/test/fixtures/trade'
import DayDetailModal from '@/components/calendar/DayDetailModal'
import WeekReviewModal from '@/components/calendar/WeekReviewModal'

// ChartTab pulls lightweight-charts (canvas) — jsdom-hostile; the stacked
// modal renders it lazily on its Overview pane. Stub to nothing.
vi.mock('@/components/trades/ChartTab', () => ({ default: () => null }))

// ── Fixtures ─────────────────────────────────────────────────────────────
// Day 2026-05-08, three trades. Chrono: TR-A, TR-B, TR-C.
// Biggest P&L: TR-B (+50), TR-A (+10), TR-C (-20).
function dayTrade(id: number, symbol: string, hhmm: string, pnl: number, note?: string): TradeListRow {
  return makeTrade({
    id,
    symbol,
    date: '2026-05-08',
    open_time: `2026-05-08T${hhmm}:00Z`,
    close_time: `2026-05-08T${hhmm}:30Z`,
    net_pnl: pnl,
    gross_pnl: pnl,
    total_fees: 0,
    note: note ? { text: note } : null,
  })
}

const T_A = () => dayTrade(6101, 'TR-A', '13:31', 10, 'alpha note')
const T_B = () => dayTrade(6102, 'TR-B', '13:40', 50, 'beta note')
const T_C = () => dayTrade(6103, 'TR-C', '13:55', -20)

function dayMetrics(): DayMetrics {
  return {
    date: '2026-05-08',
    dayOfWeek: 'Friday',
    grossPnl: 40,
    totalFees: 0,
    netPnl: 40,
    tradeCount: 3,
    winCount: 2,
    lossCount: 1,
    scratchCount: 0,
    winRate: 2 / 3,
    biggestWin: { symbol: 'TR-B', pnl: 50 },
    worstLoss: { symbol: 'TR-C', pnl: -20 },
    firstTradePnl: { symbol: 'TR-A', pnl: 10, rMultiple: null },
    avgRMultiple: null,
    avgWin: 30,
    avgLoss: -20,
    sessionFirstTradeTime: '09:31',
    sessionLastTradeTime: '09:55',
    symbolBreakdown: [],
    totalShares: 600,
    avgShareSize: 100,
    totalDollarVolume: 3000,
    mostUsedPlaybook: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    avgTradePnl: 40 / 3,
    avgPerShareGainLoss: 0.13,
    profitFactor: null,
    pnlRatio: null,
    maxConsecutiveWins: 2,
    maxConsecutiveLosses: 1,
    avgHoldSeconds: 30,
    avgHoldSecondsWinners: 30,
    avgHoldSecondsLosers: 30,
    avgHoldSecondsScratches: null,
    stdDevPnl: null,
    avgMfeDollars: null,
    avgMaeDollars: null,
    mistakeTagCounts: [],
  }
}

function makeDayDetail(trades: TradeListRow[]): DayDetail {
  return { date: '2026-05-08', metrics: dayMetrics(), trades, note: null, ruleBreaks: [] }
}

// Week 2026-05-03: group ALPHA (net +30: W1 05-04, W2 05-05) then group
// ZETA (net -5: W3 05-06). Canonical grouped order: W1, W2, W3.
function weekTrade(id: number, symbol: string, date: string, pnl: number): TradeListRow {
  return makeTrade({
    id,
    symbol,
    date,
    open_time: `${date}T13:31:00Z`,
    close_time: `${date}T13:45:00Z`,
    net_pnl: pnl,
    gross_pnl: pnl,
    total_fees: 0,
  })
}

const W1 = () => weekTrade(7101, 'ALPHA', '2026-05-04', 20)
const W2 = () => weekTrade(7102, 'ALPHA', '2026-05-05', 10)
const W3 = () => weekTrade(7103, 'ZETA', '2026-05-06', -5)

function weekMetrics(): WeekMetrics {
  return {
    netPnl: 25,
    grossPnl: 25,
    totalFees: 0,
    tradeCount: 3,
    winCount: 2,
    lossCount: 1,
    scratchCount: 0,
    winRate: 2 / 3,
    profitFactor: null,
    pnlRatio: null,
    avgWin: 15,
    avgLoss: -5,
    biggestWin: { symbol: 'ALPHA', pnl: 20 },
    worstLoss: { symbol: 'ZETA', pnl: -5 },
    avgRMultiple: null,
    totalDollarVolume: 3000,
    avgShareSize: 100,
    avgPerShareGainLoss: 0.08,
    avgMfeDollars: null,
    avgMaeDollars: null,
    avgHoldSeconds: 840,
    avgHoldSecondsWinners: 840,
    avgHoldSecondsLosers: 840,
    avgHoldSecondsScratches: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    symbolBreakdown: [
      { symbol: 'ALPHA', tradeCount: 2, netPnl: 30 },
      { symbol: 'ZETA', tradeCount: 1, netPnl: -5 },
    ],
    mistakeTagCounts: [],
    dayByDay: [],
    bestDay: null,
    worstDay: null,
    perPlaybook: [],
    greenDays: 2,
    tradingDays: 3,
    dayPnlStdDev: null,
    streak: { kind: 'none', days: 0 },
  }
}

function makeWeekDetail(): WeekDetail {
  return {
    weekStart: '2026-05-03',
    weekEnd: '2026-05-09',
    metrics: weekMetrics(),
    trades: [W1(), W2(), W3()],
    notes: '',
    entries: [],
  }
}

// ── window.api stub (dayWeekCycling pattern) ─────────────────────────────
type AnyFn = (...args: unknown[]) => unknown

let dayDetailResponse: DayDetail
const dayDetailGet = vi.fn()
const attachmentsList = vi.fn()

function makeApi(): Record<string, AnyFn> {
  const explicit: Record<string, AnyFn> = {
    dayDetailGet: (...a: unknown[]) => {
      dayDetailGet(...a)
      return Promise.resolve(dayDetailResponse)
    },
    weekDetailGet: () => Promise.resolve(makeWeekDetail()),
    attachmentsList: (...a: unknown[]) => {
      attachmentsList(...a)
      return Promise.resolve([])
    },
    // The order-snapshot test triggers a real persist->reload through the
    // timeframe segment; the save must return a truthy row.
    tradeTimeframeSave: () => Promise.resolve(T_A()),
    xpWeeklyReviewGet: () => Promise.resolve({ completed: false }),
    weekNotesSave: () => Promise.resolve({ week_start: '', text: '' }),
    mistakeDefsGet: () => Promise.resolve([]),
    tradeMistakeTagsGet: () => Promise.resolve([]),
    playbooksList: () => Promise.resolve([]),
    playbookTagsGet: () => Promise.resolve([]),
  }
  return new Proxy(explicit, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return () => Promise.resolve([])
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dayDetailResponse = makeDayDetail([T_A(), T_B(), T_C()])
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  ;(window as unknown as { api: Record<string, AnyFn> }).api = makeApi()
})

const stackedDialog = () =>
  document.querySelector('[aria-labelledby="trade-detail-title"]') as HTMLElement
const stackedSymbol = () => document.getElementById('trade-detail-title')?.textContent ?? null
const arrowRight = () => fireEvent.keyDown(document, { key: 'ArrowRight' })
const esc = () => fireEvent.keyDown(document, { key: 'Escape' })

async function renderDay(nav?: { onNavigate: (d: string) => void }) {
  render(
    <MemoryRouter>
      <DayDetailModal
        date="2026-05-08"
        onClose={() => {}}
        {...(nav
          ? {
              onNavigate: nav.onNavigate,
              navPosition: { index: 0, total: 2, prevId: null, nextId: '2026-05-12' },
            }
          : {})}
      />
    </MemoryRouter>,
  )
  await screen.findByText('Friday · 3 trades')
  fireEvent.click(screen.getByRole('tab', { name: 'Trades' }))
  await screen.findByText('TR-A')
}

async function openStacked(symbol: string) {
  fireEvent.click(screen.getByText(symbol))
  await waitFor(() => expect(stackedSymbol()).toBe(symbol))
}

describe('Dave #17 — trade cycling in the stacked modal', () => {
  it('(1) STACKED CYCLING: chevrons + counter over the displayed order; ArrowRight advances; no-wrap ends', async () => {
    await renderDay()
    await openStacked('TR-A')

    const dlg = stackedDialog()
    expect(within(dlg).getByText('1 of 3')).toBeTruthy()
    expect((within(dlg).getByLabelText('Previous trade') as HTMLButtonElement).disabled).toBe(true)

    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-B'))
    expect(within(stackedDialog()).getByText('2 of 3')).toBeTruthy()

    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-C'))
    expect(within(stackedDialog()).getByText('3 of 3')).toBeTruthy()
    expect((within(stackedDialog()).getByLabelText('Next trade') as HTMLButtonElement).disabled).toBe(true)

    // Null end: another ArrowRight is a no-op, never a wrap.
    arrowRight()
    expect(stackedSymbol()).toBe('TR-C')
  })

  it('(2) LAYERING: while stacked, arrows advance the TRADE only; unstack -> day arrows live again', async () => {
    const daySpy = vi.fn()
    await renderDay({ onNavigate: daySpy })
    await openStacked('TR-A')

    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-B'))
    expect(daySpy).not.toHaveBeenCalled()

    esc() // closes the stacked trade only
    await waitFor(() => expect(stackedSymbol()).toBeNull())
    arrowRight()
    expect(daySpy).toHaveBeenCalledWith('2026-05-12')
  })

  it('(3) ORDER SNAPSHOT: "Biggest P&L" walk from a middle row; a re-ranking edit does NOT reorder the walk', async () => {
    await renderDay()
    fireEvent.click(screen.getByRole('button', { name: 'Biggest P&L' }))
    // Displayed order now TR-B, TR-A, TR-C. Click the middle row.
    await openStacked('TR-A')
    expect(within(stackedDialog()).getByText('2 of 3')).toBeTruthy()

    // A mid-cycle edit that WOULD re-rank the live sort: TR-A's pnl jumps to
    // +99 in the reloaded detail (live "Biggest P&L" would now be A, B, C).
    dayDetailResponse = makeDayDetail([
      { ...T_A(), net_pnl: 99, gross_pnl: 99 },
      T_B(),
      T_C(),
    ])
    fireEvent.click(within(stackedDialog()).getByRole('button', { name: '1m' }))
    await waitFor(() => expect(dayDetailGet).toHaveBeenCalledTimes(2))

    // The SNAPSHOT [B, A, C] governs: next after TR-A is TR-C (live order
    // would say TR-B). Counter unchanged.
    expect(within(stackedDialog()).getByText('2 of 3')).toBeTruthy()
    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-C'))
  })

  it('(4) WEEK GROUPED: cycling crosses a group boundary into a COLLAPSED group, canonical order', async () => {
    render(
      <MemoryRouter>
        <WeekReviewModal weekStart="2026-05-03" onClose={() => {}} />
      </MemoryRouter>,
    )
    await screen.findByText('3 trading days · 3 trades')
    fireEvent.click(screen.getByRole('tab', { name: 'Trades' }))
    // Grouped view: expand ALPHA (ZETA stays collapsed), click its LAST trade.
    fireEvent.click(await screen.findByRole('button', { name: /ALPHA/ }))
    const rows = screen.getAllByText('ALPHA') // group header + rows region
    expect(rows.length).toBeGreaterThan(0)
    // Click W2 by its time cell? Both ALPHA rows show the symbol only in the
    // group header — click via net P&L cell text unique to W2 (+$10.00).
    fireEvent.click(screen.getByText('+$10.00'))
    await waitFor(() => expect(stackedSymbol()).toBe('ALPHA'))
    expect(within(stackedDialog()).getByText('2 of 3')).toBeTruthy()

    // Boundary cross: next is ZETA's trade — its group is still collapsed.
    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('ZETA'))
    expect(within(stackedDialog()).getByText('3 of 3')).toBeTruthy()
  })

  it('(5+9) STICKY (stacked) + EFFECTS: Journal survives a cycle with the new trade\'s note; Attachments refetch per id', async () => {
    await renderDay()
    await openStacked('TR-A')

    fireEvent.click(within(stackedDialog()).getByRole('tab', { name: /Journal/ }))
    expect((within(stackedDialog()).getByRole('textbox') as HTMLTextAreaElement).value).toBe('alpha note')

    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-B'))
    // Tab kept; NoteEditor's [tradeId, note] reset loaded the NEW note.
    expect(within(stackedDialog()).getByRole('tab', { name: /Journal/ }).getAttribute('aria-selected')).toBe('true')
    expect((within(stackedDialog()).getByRole('textbox') as HTMLTextAreaElement).value).toBe('beta note')

    // Attachments refetch smoke: switch to Attachments, cycle again.
    fireEvent.click(within(stackedDialog()).getByRole('tab', { name: /Attachments/ }))
    await waitFor(() => expect(attachmentsList.mock.calls.flat()).toContain(6102))
    arrowRight()
    await waitFor(() => expect(stackedSymbol()).toBe('TR-C'))
    expect(within(stackedDialog()).getByRole('tab', { name: /Attachments/ }).getAttribute('aria-selected')).toBe('true')
    await waitFor(() => expect(attachmentsList.mock.calls.flat()).toContain(6103))
  })

  it('(7) FRESH-OPEN: Esc and backdrop close paths both null the ref — next open resets to Overview', async () => {
    await renderDay()
    await openStacked('TR-A')
    fireEvent.click(within(stackedDialog()).getByRole('tab', { name: /Journal/ }))

    esc()
    await waitFor(() => expect(stackedSymbol()).toBeNull())
    await openStacked('TR-A')
    expect(within(stackedDialog()).getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true')

    // Backdrop path.
    fireEvent.click(within(stackedDialog()).getByRole('tab', { name: /Journal/ }))
    fireEvent.click(stackedDialog().firstElementChild as HTMLElement)
    await waitFor(() => expect(stackedSymbol()).toBeNull())
    await openStacked('TR-B')
    expect(within(stackedDialog()).getByRole('tab', { name: /Overview/ }).getAttribute('aria-selected')).toBe('true')
  })

  it('(8) GUARD SURVIVES: focus in the Journal textarea -> arrows never cycle', async () => {
    await renderDay()
    await openStacked('TR-A')
    fireEvent.click(within(stackedDialog()).getByRole('tab', { name: /Journal/ }))

    const box = within(stackedDialog()).getByRole('textbox') as HTMLTextAreaElement
    box.focus()
    arrowRight()
    // Still TR-A, still Journal — the arrow stayed with the text cursor.
    expect(stackedSymbol()).toBe('TR-A')
    expect(within(stackedDialog()).getByRole('tab', { name: /Journal/ }).getAttribute('aria-selected')).toBe('true')
  })
})
