// @vitest-environment jsdom
//
// DAVE — DAY/WEEK MODAL CYCLING + STICKY TAB (v0.2.6, renderer-only).
// Drives the REAL Calendar page (host wiring included) with a fixture May-2026
// month behind a window.api stub, so every assertion exercises the true open
// contracts:
//   - Day population  = in-month days with trade_count > 0, date order
//     (Calendar.tsx routes zero-trade clicks to NoTradeDayModal instead).
//   - Week population = ALL SIX grid week_starts (WeeklyPanel's zero-trade
//     branch is still a clickable "Open weekly review" button).
// Clamped to the loaded month: arrows DISABLED at the ends (no wrap) — the
// getTradeNavPosition precedent's null-ends. Month-hop is parked.
import { render, screen, within, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type {
  CalendarDay,
  CalendarMonth,
  WeeklySummary,
} from '@shared/calendar-types'
import type { DayDetail, DayMetrics } from '@shared/day-types'
import type { WeekDetail, WeekMetrics } from '@shared/week-types'
import type { TradeListRow } from '@shared/trades-types'
import Calendar from '@/pages/Calendar'

// ChartTab pulls lightweight-charts (canvas) — jsdom-hostile and irrelevant
// here. The stacked TradeDetailModal under test renders it lazily on its
// Overview pane; stub it to nothing.
vi.mock('@/components/trades/ChartTab', () => ({ default: () => null }))

// ── Fixture month: May 2026 ──────────────────────────────────────────────
// Grid rows (Sun-start): 04-26, 05-03, 05-10, 05-17, 05-24, 05-31.
// Traded days: 05-04 Mon, 05-06 Wed, 05-08 Fri, 05-12 Tue. 05-05 is a
// journal-only zero-trade day — must be SKIPPED by the day walk.
const TRADED = ['2026-05-04', '2026-05-06', '2026-05-08', '2026-05-12']
const DAY_MARKER: Record<string, string> = {
  '2026-05-04': 'Monday · 1 trade',
  '2026-05-06': 'Wednesday · 2 trades',
  '2026-05-08': 'Friday · 3 trades',
  '2026-05-12': 'Tuesday · 4 trades',
}
const WEEK_STARTS = [
  '2026-04-26',
  '2026-05-03',
  '2026-05-10',
  '2026-05-17',
  '2026-05-24',
  '2026-05-31',
]

function trade(id: number, symbol: string, date: string, over: Partial<TradeListRow> = {}): TradeListRow {
  return {
    id,
    date,
    symbol,
    side: 'long',
    open_time: `${date}T13:31:00Z`,
    close_time: `${date}T13:45:00Z`,
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 5.1,
    shares_sold: 100,
    avg_sell_price: 5.35,
    gross_pnl: 25,
    total_fees: 1.2,
    net_pnl: 23.8,
    executions: [
      { trade_id: `t${id}`, order_id: `o${id}a`, side: 'B', qty: 100, price: 5.1, time: `${date}T13:31:00Z` },
      { trade_id: `t${id}`, order_id: `o${id}b`, side: 'S', qty: 100, price: 5.35, time: `${date}T13:45:00Z` },
    ],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    mae: null,
    mfe: null,
    playbook_id: null,
    playbook_name: null,
    playbook_tier: null,
    confidence: null,
    mistakes: [],
    planned_risk: null,
    planned_stop_loss_price: null,
    risk_per_share: null,
    total_risk: null,
    r_multiple: null,
    daily_change_pct: null,
    rvol: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    secondary_tag_count: 0,
    deleted_at: null,
    account_id: 'acct-main',
    ...over,
  }
}

const DAY_TRADES: Record<string, TradeListRow[]> = {
  '2026-05-04': [trade(6004, 'ALPHA4', '2026-05-04')],
  '2026-05-06': [trade(6006, 'ALPHA6', '2026-05-06')],
  '2026-05-08': [trade(6008, 'ALPHA8', '2026-05-08')],
  '2026-05-12': [trade(6012, 'ALPHA12', '2026-05-12')],
}

const DAY_OF_WEEK: Record<string, string> = {
  '2026-05-04': 'Monday',
  '2026-05-06': 'Wednesday',
  '2026-05-08': 'Friday',
  '2026-05-12': 'Tuesday',
}

function dayMetrics(date: string, tradeCount: number): DayMetrics {
  return {
    date,
    dayOfWeek: DAY_OF_WEEK[date] ?? 'Monday',
    grossPnl: 25,
    totalFees: 1.2,
    netPnl: 23.8,
    tradeCount,
    winCount: 1,
    lossCount: 0,
    scratchCount: 0,
    winRate: 1,
    biggestWin: { symbol: DAY_TRADES[date]?.[0]?.symbol ?? 'ALPHA', pnl: 23.8 },
    worstLoss: null,
    firstTradePnl: { symbol: DAY_TRADES[date]?.[0]?.symbol ?? 'ALPHA', pnl: 23.8, rMultiple: null },
    avgRMultiple: null,
    avgWin: 23.8,
    avgLoss: null,
    sessionFirstTradeTime: '09:31',
    sessionLastTradeTime: '09:45',
    symbolBreakdown: [{ symbol: DAY_TRADES[date]?.[0]?.symbol ?? 'ALPHA', tradeCount, netPnl: 23.8 }],
    totalShares: 200,
    avgShareSize: 100,
    totalDollarVolume: 1045,
    mostUsedPlaybook: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    avgTradePnl: 23.8,
    avgPerShareGainLoss: 0.119,
    profitFactor: null,
    pnlRatio: null,
    maxConsecutiveWins: 1,
    maxConsecutiveLosses: 0,
    avgHoldSeconds: 840,
    avgHoldSecondsWinners: 840,
    avgHoldSecondsLosers: null,
    avgHoldSecondsScratches: null,
    stdDevPnl: null,
    avgMfeDollars: null,
    avgMaeDollars: null,
    mistakeTagCounts: [],
  }
}

function makeDayDetail(date: string, over: Partial<DayMetrics> = {}): DayDetail {
  const tradeCount = TRADED.indexOf(date) + 1 // 1..4 — the per-day subtitle marker
  return {
    date,
    metrics: { ...dayMetrics(date, tradeCount), ...over },
    trades: DAY_TRADES[date] ?? [],
    note: null,
    ruleBreaks: [],
  }
}

const WEEK_TRADES: Record<string, TradeListRow[]> = {
  '2026-05-03': [trade(7001, 'WKALPHA', '2026-05-04', { playbook_name: 'WKPLAY' })],
  '2026-05-10': [trade(7002, 'WKBETA', '2026-05-12')],
}

// tradingDays doubles as the per-week subtitle marker: wk2 '3 trading days ·
// 3 trades', wk3 '1 trading day · 1 trade', the rest zero.
const WEEK_MARKER: Record<string, { tradingDays: number; tradeCount: number }> = {
  '2026-04-26': { tradingDays: 0, tradeCount: 0 },
  '2026-05-03': { tradingDays: 3, tradeCount: 3 },
  '2026-05-10': { tradingDays: 1, tradeCount: 1 },
  '2026-05-17': { tradingDays: 0, tradeCount: 0 },
  '2026-05-24': { tradingDays: 0, tradeCount: 0 },
  '2026-05-31': { tradingDays: 0, tradeCount: 0 },
}

function weekMetrics(weekStart: string): WeekMetrics {
  const { tradingDays, tradeCount } = WEEK_MARKER[weekStart]
  return {
    netPnl: tradeCount > 0 ? 23.8 : 0,
    grossPnl: tradeCount > 0 ? 25 : 0,
    totalFees: tradeCount > 0 ? 1.2 : 0,
    tradeCount,
    winCount: tradeCount > 0 ? 1 : 0,
    lossCount: 0,
    scratchCount: 0,
    winRate: tradeCount > 0 ? 1 : null,
    profitFactor: null,
    pnlRatio: null,
    avgWin: tradeCount > 0 ? 23.8 : null,
    avgLoss: null,
    biggestWin: tradeCount > 0 ? { symbol: 'WKALPHA', pnl: 23.8 } : null,
    worstLoss: null,
    avgRMultiple: null,
    totalDollarVolume: tradeCount > 0 ? 1045 : 0,
    avgShareSize: tradeCount > 0 ? 100 : null,
    avgPerShareGainLoss: tradeCount > 0 ? 0.119 : null,
    avgMfeDollars: null,
    avgMaeDollars: null,
    avgHoldSeconds: tradeCount > 0 ? 840 : null,
    avgHoldSecondsWinners: tradeCount > 0 ? 840 : null,
    avgHoldSecondsLosers: null,
    avgHoldSecondsScratches: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    symbolBreakdown: tradeCount > 0 ? [{ symbol: 'WKALPHA', tradeCount, netPnl: 23.8 }] : [],
    mistakeTagCounts: [],
    dayByDay: tradeCount > 0 ? [{ date: '2026-05-04', netPnl: 23.8, tradeCount }] : [],
    bestDay: tradeCount > 0 ? { date: '2026-05-04', netPnl: 23.8 } : null,
    worstDay: null,
    perPlaybook: [],
    greenDays: tradeCount > 0 ? 1 : 0,
    tradingDays,
    dayPnlStdDev: null,
    streak: { kind: 'none', days: 0 },
  }
}

function weekEnd(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d + 6))
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`
}

function makeWeekDetail(weekStart: string): WeekDetail {
  return {
    weekStart,
    weekEnd: weekEnd(weekStart),
    metrics: weekMetrics(weekStart),
    trades: WEEK_TRADES[weekStart] ?? [],
    notes: '',
    entries: [],
  }
}

function calendarDay(date: string, over: Partial<CalendarDay> = {}): CalendarDay {
  return {
    date,
    net_pnl: 23.8,
    gross_pnl: 25,
    total_fees: 1.2,
    trade_count: 1,
    winners: 1,
    losers: 0,
    avg_winner: 23.8,
    avg_loser: null,
    day_tags: [],
    has_journal: false,
    no_trade_day: false,
    is_holiday: false,
    sentiment: null,
    ...over,
  }
}

function weekSummary(weekStart: string): WeeklySummary {
  const { tradeCount } = WEEK_MARKER[weekStart]
  return {
    week_start: weekStart,
    week_end: weekEnd(weekStart),
    in_month: true,
    trade_count: tradeCount,
    net_pnl: tradeCount > 0 ? 23.8 : 0,
    gross_pnl: tradeCount > 0 ? 25 : 0,
    total_fees: tradeCount > 0 ? 1.2 : 0,
    winners: tradeCount > 0 ? 1 : 0,
    losers: 0,
    win_rate: tradeCount > 0 ? 1 : null,
    profit_factor: null,
    avg_winner: tradeCount > 0 ? 23.8 : null,
    avg_loser: null,
    best_day: null,
    worst_day: null,
    best_symbol: null,
    days_traded: WEEK_MARKER[weekStart].tradingDays,
    days_journaled: 0,
    emotion_avg: null,
    streak: { kind: 'none', days: 0 },
    top_mistake: null,
    notes: '',
  }
}

const RANGE = { earliest: '2026-05-04', latest: '2026-05-12', monthsWithTrades: ['2026-05'] }

const MAY: CalendarMonth = {
  stats: {
    year: 2026,
    month: 5,
    net_pnl: 95.2,
    gross_pnl: 100,
    total_fees: 4.8,
    trade_count: 4,
    winners: 4,
    losers: 0,
    trading_days: 4,
  },
  days: [
    ...TRADED.map((d) => calendarDay(d)),
    // Journal-only zero-trade day — must NOT be in the day walk.
    calendarDay('2026-05-05', { trade_count: 0, winners: 0, net_pnl: 0, gross_pnl: 0, total_fees: 0, avg_winner: null, has_journal: true }),
  ],
  range: RANGE,
  weeks: WEEK_STARTS.map(weekSummary),
}

function emptyMonth(year: number, month: number): CalendarMonth {
  return {
    stats: { year, month, net_pnl: 0, gross_pnl: 0, total_fees: 0, trade_count: 0, winners: 0, losers: 0, trading_days: 0 },
    days: [],
    range: RANGE, // latest 2026-05-12 → the page's init jump lands on the fixture month
    weeks: [],
  }
}

// ── window.api stub ──────────────────────────────────────────────────────
type AnyFn = (...args: unknown[]) => unknown

function makeApi(overrides: Record<string, AnyFn> = {}): Record<string, AnyFn> {
  const explicit: Record<string, AnyFn> = {
    calendarGet: (year: unknown, month: unknown) =>
      Promise.resolve(year === 2026 && month === 5 ? MAY : emptyMonth(year as number, month as number)),
    dayDetailGet: (date: unknown) => Promise.resolve(makeDayDetail(date as string)),
    weekDetailGet: (weekStart: unknown) => Promise.resolve(makeWeekDetail(weekStart as string)),
    dayNoteSave: () => Promise.resolve(),
    weekNotesSave: () => Promise.resolve({ week_start: '', text: '' }),
    xpWeeklyReviewGet: () => Promise.resolve({ completed: false }),
    sessionSentimentSave: () => Promise.resolve(),
    mistakeDefsGet: () => Promise.resolve([]),
    tradeMistakeTagsGet: () => Promise.resolve([]),
    playbookTagsGet: () => Promise.resolve([]),
    playbooksList: () => Promise.resolve([]),
    attachmentsList: () => Promise.resolve([]),
    ...overrides,
  }
  // Anything else resolves to [] — list-shaped and inert.
  return new Proxy(explicit, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      return () => Promise.resolve([])
    },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  // recharts' ResponsiveContainer (Week Overview equity curve) needs it.
  if (!('ResizeObserver' in window)) {
    ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  ;(window as unknown as { api: Record<string, AnyFn> }).api = makeApi()
})

function renderCalendar() {
  return render(
    <MemoryRouter>
      <Calendar />
    </MemoryRouter>,
  )
}

const dayTitle = () => document.getElementById('day-detail-title')?.textContent ?? null
const weekTitle = () => document.getElementById('week-review-title')?.textContent ?? null
const dayDialog = () => document.querySelector('[aria-labelledby="day-detail-title"]') as HTMLElement
const weekDialog = () => document.querySelector('[aria-labelledby="week-review-title"]') as HTMLElement
const stackedTradeOpen = () => document.getElementById('trade-detail-title') !== null

async function openDay(user: ReturnType<typeof userEvent.setup>, date: string) {
  const cell = await screen.findByTitle(new RegExp(`^${date}`))
  await user.click(cell)
  await waitFor(() => expect(screen.queryByText(DAY_MARKER[date])).toBeTruthy())
}

async function openWeekPanel(user: ReturnType<typeof userEvent.setup>, index: number) {
  const panels = await screen.findAllByTitle('Open weekly review')
  expect(panels.length).toBe(6)
  await user.click(panels[index])
}

// ═══ (1) Day arrows + counter render; walk days-with-trades; ends disabled ═══
describe('(1) day modal — chevrons + "N of M", days-with-trades walk, no-wrap ends', () => {
  it('renders arrows + counter; Next walks 04→06→08→12 in date order (05-05 skipped); ends disabled', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openDay(user, '2026-05-04')
    expect(dayTitle()).toBe('May 4 2026')

    const prev = screen.getByLabelText('Previous day') as HTMLButtonElement
    const next = screen.getByLabelText('Next day') as HTMLButtonElement
    expect(screen.getByText('1 of 4')).toBeTruthy()
    // First traded day of the loaded month — no wrap backwards.
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)

    // 05-04 → 05-06: the zero-trade journal day 05-05 is NOT in the walk.
    await user.click(next)
    expect(dayTitle()).toBe('May 6 2026')
    expect(screen.getByText('2 of 4')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText(DAY_MARKER['2026-05-06'])).toBeTruthy())

    await user.click(screen.getByLabelText('Next day'))
    expect(dayTitle()).toBe('May 8 2026')
    expect(screen.getByText('3 of 4')).toBeTruthy()

    await user.click(screen.getByLabelText('Next day'))
    expect(dayTitle()).toBe('May 12 2026')
    expect(screen.getByText('4 of 4')).toBeTruthy()
    // Last traded day of the loaded month — no wrap forwards.
    expect((screen.getByLabelText('Next day') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Previous day') as HTMLButtonElement).disabled).toBe(false)

    // And Previous walks back.
    await user.click(screen.getByLabelText('Previous day'))
    expect(dayTitle()).toBe('May 8 2026')
  })
})

// ═══ (2) Keyboard ←/→ + the exact focus guard; Esc ungated ═══
describe('(2) day modal — arrow keys navigate; focused textarea suppresses them; Esc still closes', () => {
  it('ArrowRight/ArrowLeft cycle; inside the Notes textarea arrows type-move only; Escape closes from the textarea', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openDay(user, '2026-05-06')

    await user.keyboard('{ArrowRight}')
    expect(dayTitle()).toBe('May 8 2026')
    await user.keyboard('{ArrowLeft}')
    expect(dayTitle()).toBe('May 6 2026')
    await waitFor(() => expect(screen.queryByText(DAY_MARKER['2026-05-06'])).toBeTruthy())

    // Focus the Notes textarea — arrows must NOT navigate, typing untouched.
    await user.click(within(dayDialog()).getByRole('tab', { name: 'Notes' }))
    const textarea = (await screen.findByLabelText('Day notes')) as HTMLTextAreaElement
    await user.click(textarea)
    await user.keyboard('abc')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(dayTitle()).toBe('May 6 2026') // did not navigate
    await user.keyboard('X')
    expect(textarea.value).toBe('aXbc') // caret moved inside the field instead
    // Esc is deliberately ungated — closes even from inside the field.
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dayTitle()).toBeNull())
  })
})

// ═══ (3) Stack gate — arrows inert while a trade is stacked ═══
describe('(3) day modal — stack gate on the same escapeBlocked source as Esc', () => {
  it('with a trade stacked, ←/→ do not cycle and the header chevrons are inert; unstack restores them', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openDay(user, '2026-05-06')

    await user.click(within(dayDialog()).getByRole('tab', { name: 'Trades' }))
    await user.click(await screen.findByText('ALPHA6'))
    await waitFor(() => expect(stackedTradeOpen()).toBe(true))

    await user.keyboard('{ArrowRight}')
    expect(dayTitle()).toBe('May 6 2026') // gated — no cycle
    expect((screen.getByLabelText('Next day') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Previous day') as HTMLButtonElement).disabled).toBe(true)

    // Unstack (Esc closes the stacked modal first — existing contract)…
    await user.keyboard('{Escape}')
    await waitFor(() => expect(stackedTradeOpen()).toBe(false))
    expect(dayTitle()).toBe('May 6 2026') // day modal survived

    // …and the arrows work again.
    await user.keyboard('{ArrowRight}')
    expect(dayTitle()).toBe('May 8 2026')
    expect((screen.getByLabelText('Next day') as HTMLButtonElement).disabled).toBe(false)
  })
})

// ═══ (4) Sticky tab — persist across cycling, reset on fresh open ═══
describe('(4) day modal — sticky tab across cycles, Overview + stack.reset on fresh open only', () => {
  it('Trades tab survives a cycle; fresh reopen lands on Overview with no stacked leftover', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openDay(user, '2026-05-06')

    await user.click(within(dayDialog()).getByRole('tab', { name: 'Trades' }))
    expect(within(dayDialog()).getByRole('tab', { name: 'Trades', selected: true })).toBeTruthy()

    await user.keyboard('{ArrowRight}')
    expect(dayTitle()).toBe('May 8 2026')
    // STICKY: the tab selection survived the date→date cycle.
    expect(within(dayDialog()).getByRole('tab', { name: 'Trades', selected: true })).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('ALPHA8')).toBeTruthy())

    // Leave a trade stacked, then close the DAY modal over it (the shell X
    // stays keyboard-reachable while stacked). The stale selection must NOT
    // survive into the next fresh open — stack.reset on fresh open.
    await user.click(screen.getByText('ALPHA8'))
    await waitFor(() => expect(stackedTradeOpen()).toBe(true))
    await user.click(within(dayDialog()).getByLabelText('Close'))
    await waitFor(() => expect(dayTitle()).toBeNull())

    // Fresh open from the calendar → Overview, no stacked modal.
    await openDay(user, '2026-05-08')
    expect(within(dayDialog()).getByRole('tab', { name: 'Overview', selected: true })).toBeTruthy()
    expect(stackedTradeOpen()).toBe(false)
  })
})

// ═══ (5) No-flash — keep-last-detail during a cycle; latest-wins on races ═══
describe('(5) day modal — cycling keeps the previous detail mounted; stale responses discarded', () => {
  it('previous detail stays until the new one lands (never null, no Loading flash); a stale response never overwrites', async () => {
    const user = userEvent.setup()
    const pending: { date: string; resolve: (d: DayDetail) => void }[] = []
    ;(window as unknown as { api: Record<string, AnyFn> }).api = makeApi({
      dayDetailGet: (date: unknown) =>
        new Promise<DayDetail>((resolve) => {
          pending.push({ date: date as string, resolve })
        }),
    })
    renderCalendar()

    const cell = await screen.findByTitle(/^2026-05-06/)
    await user.click(cell)
    // Land the fresh open.
    await act(async () => pending.shift()!.resolve(makeDayDetail('2026-05-06')))
    await waitFor(() => expect(screen.queryByText(DAY_MARKER['2026-05-06'])).toBeTruthy())

    // Cycle to 05-08 and HOLD its response: title flips (prop-driven), but the
    // 05-06 detail stays mounted — no null gap, no Loading… flash.
    await user.keyboard('{ArrowRight}')
    expect(dayTitle()).toBe('May 8 2026')
    expect(screen.queryByText(DAY_MARKER['2026-05-06'])).toBeTruthy() // keep-last
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(pending.length).toBe(1)

    // Land 05-08.
    await act(async () => pending.shift()!.resolve(makeDayDetail('2026-05-08')))
    await waitFor(() => expect(screen.queryByText(DAY_MARKER['2026-05-08'])).toBeTruthy())

    // Rapid cycling race: → 05-12 (call A held) then ← 05-08 (call B held).
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')
    expect(pending.length).toBe(2)
    const callA = pending.shift()! // 05-12 — now stale
    const callB = pending.shift()! // 05-08 — latest
    expect(callA.date).toBe('2026-05-12')
    expect(callB.date).toBe('2026-05-08')

    // Latest lands first (tradeCount 33 marks THIS response as the one shown)…
    await act(async () => callB.resolve(makeDayDetail('2026-05-08', { tradeCount: 33 })))
    await waitFor(() => expect(screen.queryByText('Friday · 33 trades')).toBeTruthy())

    // …then the stale 05-12 response resolves late and must be DISCARDED.
    await act(async () => callA.resolve(makeDayDetail('2026-05-12')))
    expect(dayTitle()).toBe('May 8 2026')
    expect(screen.queryByText(DAY_MARKER['2026-05-12'])).toBeNull()
    expect(screen.queryByText('Friday · 33 trades')).toBeTruthy()
  })
})

// ═══ (7) The same suite over the WEEK modal — population = all 6 grid weeks ═══
describe('(7) week modal — six-grid-week walk, keyboard + focus guard, stack gate, sticky tab, no-flash', () => {
  it('opens on the zero-trade first grid week; arrows + "N of 6" walk all six; ends disabled', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openWeekPanel(user, 0) // 2026-04-26 — zero trades, still opens (open contract)
    expect(weekTitle()).toContain('Apr 26 2026')

    const prev = screen.getByLabelText('Previous week') as HTMLButtonElement
    expect(screen.getByText('1 of 6')).toBeTruthy()
    expect(prev.disabled).toBe(true) // first grid row — no wrap

    for (let i = 1; i < WEEK_STARTS.length; i++) {
      await user.click(screen.getByLabelText('Next week'))
      expect(screen.getByText(`${i + 1} of 6`)).toBeTruthy()
    }
    expect((screen.getByLabelText('Next week') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Previous week') as HTMLButtonElement).disabled).toBe(false)
  })

  it('arrow keys cycle; the Week-notes textarea suppresses them; Esc closes from the field', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openWeekPanel(user, 1) // 2026-05-03
    await waitFor(() => expect(screen.queryByText('3 trading days · 3 trades')).toBeTruthy())

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('3 of 6')).toBeTruthy()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('2 of 6')).toBeTruthy()

    await user.click(within(weekDialog()).getByRole('tab', { name: 'Notes' }))
    const textarea = (await screen.findByLabelText('Week notes')) as HTMLTextAreaElement
    await user.click(textarea)
    await user.keyboard('wk')
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByText('2 of 6')).toBeTruthy() // did not navigate
    await user.keyboard('Z')
    expect(textarea.value).toBe('wZk')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(weekTitle()).toBeNull())
  })

  it('stack gate: a stacked trade freezes week cycling (keys AND chevrons); unstack restores', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openWeekPanel(user, 1) // 2026-05-03 — has WKALPHA
    await waitFor(() => expect(screen.queryByText('3 trading days · 3 trades')).toBeTruthy())

    await user.click(within(weekDialog()).getByRole('tab', { name: 'Trades' }))
    // Expand the symbol group (its header is a button; the "best WKALPHA"
    // summary line above duplicates the text, so target by role).
    await user.click(await screen.findByRole('button', { name: /WKALPHA/ }))
    await user.click(await screen.findByText('WKPLAY')) // the trade row
    await waitFor(() => expect(stackedTradeOpen()).toBe(true))

    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('2 of 6')).toBeTruthy() // gated — no cycle
    expect((screen.getByLabelText('Next week') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByLabelText('Previous week') as HTMLButtonElement).disabled).toBe(true)

    await user.keyboard('{Escape}')
    await waitFor(() => expect(stackedTradeOpen()).toBe(false))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('3 of 6')).toBeTruthy()
  })

  it('sticky tab: Trades survives a week cycle; fresh reopen resets to Overview', async () => {
    const user = userEvent.setup()
    renderCalendar()
    await openWeekPanel(user, 1)
    await waitFor(() => expect(screen.queryByText('3 trading days · 3 trades')).toBeTruthy())

    await user.click(within(weekDialog()).getByRole('tab', { name: 'Trades' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('3 of 6')).toBeTruthy()
    expect(within(weekDialog()).getByRole('tab', { name: 'Trades', selected: true })).toBeTruthy()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(weekTitle()).toBeNull())
    await openWeekPanel(user, 1)
    expect(within(weekDialog()).getByRole('tab', { name: 'Overview', selected: true })).toBeTruthy()
  })

  it('no-flash: cycling keeps the previous week detail mounted until the new one lands; stale discarded', async () => {
    const user = userEvent.setup()
    const pending: { weekStart: string; resolve: (d: WeekDetail) => void }[] = []
    ;(window as unknown as { api: Record<string, AnyFn> }).api = makeApi({
      weekDetailGet: (weekStart: unknown) =>
        new Promise<WeekDetail>((resolve) => {
          pending.push({ weekStart: weekStart as string, resolve })
        }),
    })
    renderCalendar()
    await openWeekPanel(user, 1) // 2026-05-03
    await act(async () => pending.shift()!.resolve(makeWeekDetail('2026-05-03')))
    await waitFor(() => expect(screen.queryByText('3 trading days · 3 trades')).toBeTruthy())

    // Cycle to week 3 and HOLD: counter + title identity follow the prop, the
    // week-2 detail stays mounted — never null, no Loading… flash.
    await user.keyboard('{ArrowRight}')
    expect(screen.getByText('3 of 6')).toBeTruthy()
    expect(weekTitle()).toContain('May 10 2026')
    expect(screen.queryByText('3 trading days · 3 trades')).toBeTruthy() // keep-last
    expect(screen.queryByText('Loading…')).toBeNull()

    // Stale race: → week 4 (A held), ← week 3 (B held); B lands, then stale A.
    await user.keyboard('{ArrowRight}')
    await user.keyboard('{ArrowLeft}')
    const heldWeek2 = pending.shift()! // 2026-05-10 fetch from the first ArrowRight
    const callA = pending.shift()! // 2026-05-17 — stale
    const callB = pending.shift()! // 2026-05-10 — latest
    expect(callA.weekStart).toBe('2026-05-17')
    expect(callB.weekStart).toBe('2026-05-10')
    await act(async () => callB.resolve(makeWeekDetail('2026-05-10')))
    await waitFor(() => expect(screen.queryByText('1 trading day · 1 trade')).toBeTruthy())
    await act(async () => callA.resolve(makeWeekDetail('2026-05-17')))
    expect(screen.getByText('3 of 6')).toBeTruthy()
    expect(screen.queryByText('1 trading day · 1 trade')).toBeTruthy()
    await act(async () => heldWeek2.resolve(makeWeekDetail('2026-05-10'))) // drain
  })
})
