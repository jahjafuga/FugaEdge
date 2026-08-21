// @vitest-environment jsdom
// v0.2.7 Feature 5 — THE RAIL BELONGS TO THE MONTH ON THE CARD. T1..T4.
//
// MEASURED on August: the first rail card read JUL 26–AUG 1, 16T, +$0.99 — the
// whole of July, on an August card. Aug 1 is a Saturday with no trades, so that
// week contributed nothing to August. Masthead 12 trades / $39.92; rail 28
// trades / $40.91.
//
// The card had a visible-sum rule for DAYS since the first commit and never had
// one for WEEKS. T1 is that rule, and it is the guard that was missing: if the
// rail's weeks do not add up to the masthead, the card is contradicting itself
// on its own face.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildCells,
  collapseEmptyWeeks,
  composeCalendarCard,
  isTraded,
  monthDaysIn,
  scopeWeeksToMonth,
  weekTierLines,
  type CalendarCardData,
  type CalendarCardDay,
  type CalendarCardFormat,
} from '../calendarCard'
import { buildMonthCardData } from '@/core/calendar/monthCardData'
import { cardDay, cardWeek } from '@/test/fixtures/calendarCard'
import { installImageDecode, installRecordingCanvas } from '@/test/recordingCanvas'
import type { CalendarDay, CalendarMonth, WeeklySummary } from '@shared/calendar-types'

let rec: ReturnType<typeof installRecordingCanvas>
let restoreDecode: () => void
beforeEach(() => {
  localStorage.clear()
  rec = installRecordingCanvas()
  restoreDecode = installImageDecode()
})
afterEach(() => {
  rec.restore()
  restoreDecode()
})

// ── THE REAL AUGUST. Jul 26–Aug 1 traded 16 times, ALL of them in July; Aug 1
//    is a Saturday. August's own trading starts on the 3rd.
const AUG_DAYS: CalendarCardDay[] = [
  cardDay('2026-08-03', 12.4, 4),
  cardDay('2026-08-04', -1.84, 3),
  cardDay('2026-08-05', 29.36, 5),
  cardDay('2026-08-31', 19.24, 8),
]
const JULY_WEEK = cardWeek('2026-07-26', '2026-08-01', {
  tradeCount: 16, netPnl: 0.99, netPct: 0.0099, totalFees: 4.32, feesPct: 0.0432,
  winners: 8, losers: 8, winRate: 0.5, plRatio: 2.11, daysTraded: 4, daysJournaled: 3,
  streak: { kind: 'loss', days: 3 }, topMistake: { name: 'Chased entry', count: 4 },
})
const AUG_WEEKS = [
  JULY_WEEK,
  cardWeek('2026-08-02', '2026-08-08', {
    tradeCount: 12, netPnl: 39.92, netPct: 0.39, totalFees: 3.24, feesPct: 0.0324,
    winners: 9, losers: 3, winRate: 0.75, plRatio: 3.1, daysTraded: 3, daysJournaled: 2,
    streak: { kind: 'win', days: 3 }, topMistake: null,
  }),
  cardWeek('2026-08-09', '2026-08-15'),
  cardWeek('2026-08-16', '2026-08-22'),
  cardWeek('2026-08-23', '2026-08-29'),
  cardWeek('2026-08-30', '2026-09-05', {
    tradeCount: 8, netPnl: 19.24, netPct: 0.19, totalFees: 2.16, feesPct: 0.0216,
    winners: 8, losers: 0, winRate: 1, plRatio: null, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'win', days: 1 }, topMistake: null,
  }),
]

function card(over: Partial<CalendarCardData> = {}): CalendarCardData {
  const days = (over.days ?? AUG_DAYS) as CalendarCardDay[]
  const traded = days.filter(isTraded)
  return {
    monthLabel: 'August 2026',
    year: 2026,
    month: 8,
    days,
    monthPnl: traded.reduce((a, d) => a + d.pnl, 0),
    monthPct: 0.599,
    monthFees: traded.reduce((a, d) => a + d.fees, 0),
    monthFeesPct: 0.01,
    tradeCount: traded.reduce((a, d) => a + d.tradeCount, 0),
    monthWinners: traded.reduce((a, d) => a + d.winners, 0),
    monthLosers: traded.reduce((a, d) => a + d.losers, 0),
    longestGreenRun: 3,
    currentStreak: { kind: 'win', days: 1 },
    unit: 'percent',
    denominator: 'ok',
    ...over,
    weeks: over.weeks ?? scopeWeeksToMonth(AUG_WEEKS, days),
  }
}
const compose = (over: Partial<CalendarCardData> = {}, f: CalendarCardFormat = 'wide') =>
  composeCalendarCard(card(over), 'dark', f)

// ─────────────────────────────────────────────────────────────────────────────

describe('T1 THE VISIBLE-SUM RULE, EXTENDED TO WEEKS', () => {
  it('the rail’s weeks sum to the masthead’s net', () => {
    const d = card()
    const railNet = d.weeks.reduce((a, w) => a + w.netPnl, 0)
    expect(railNet, `rail ${railNet} vs masthead ${d.monthPnl}`).toBeCloseTo(d.monthPnl, 8)
  })

  it('and to its trade count', () => {
    const d = card()
    expect(d.weeks.reduce((a, w) => a + w.tradeCount, 0)).toBe(d.tradeCount)
  })

  it('and to its W/L', () => {
    const d = card()
    expect(d.weeks.reduce((a, w) => a + w.winners, 0)).toBe(d.monthWinners)
    expect(d.weeks.reduce((a, w) => a + w.losers, 0)).toBe(d.monthLosers)
  })

  it('and collapsing the quiet weeks does not disturb the sum', () => {
    const d = card()
    const shown = collapseEmptyWeeks(d.weeks)
    expect(shown.reduce((a, w) => a + w.netPnl, 0)).toBeCloseTo(d.monthPnl, 8)
    expect(shown.reduce((a, w) => a + w.tradeCount, 0)).toBe(d.tradeCount)
  })

  it('the UNSCOPED rail would NOT have summed — the guard is not vacuous', () => {
    const raw = AUG_WEEKS.reduce((a, w) => a + w.tradeCount, 0)
    const scoped = scopeWeeksToMonth(AUG_WEEKS, AUG_DAYS).reduce((a, w) => a + w.tradeCount, 0)
    expect(raw).toBe(36)
    expect(scoped).toBe(20)
    expect(raw).not.toBe(scoped)
  })
})

describe('T2 August drops the July week entirely', () => {
  it('it is not in the scoped rail', () => {
    const out = scopeWeeksToMonth(AUG_WEEKS, AUG_DAYS)
    expect(out.some((w) => w.weekStart === '2026-07-26')).toBe(false)
  })

  it('and not on the card', async () => {
    await compose()
    expect(rec.texts).not.toContain('JUL 26–AUG 1')
    expect(rec.texts).not.toContain('16T')
  })

  it('because it owns none of August’s traded days', () => {
    expect(monthDaysIn(JULY_WEEK, AUG_DAYS)).toEqual([])
  })

  it('a QUIET week of this month is still kept — only foreign weeks go', () => {
    const out = scopeWeeksToMonth(AUG_WEEKS, AUG_DAYS)
    expect(out.some((w) => w.weekStart === '2026-08-09' && w.tradeCount === 0)).toBe(true)
  })
})

describe('T3 a straddling week WITH trades on both sides is kept and marked', () => {
  // Aug 30–Sep 5: eight trades on Aug 31, and (say) five more in September.
  const BOTH = cardWeek('2026-08-30', '2026-09-05', {
    tradeCount: 13, netPnl: 61.0, netPct: 0.61, totalFees: 3.51, feesPct: 0.035,
    winners: 10, losers: 3, winRate: 0.77, plRatio: 2.4, daysTraded: 3, daysJournaled: 2,
    streak: { kind: 'win', days: 2 }, topMistake: { name: 'Size too large', count: 2 },
  })

  it('it survives, re-totalled to this month’s share', () => {
    const out = scopeWeeksToMonth([BOTH], AUG_DAYS)
    expect(out).toHaveLength(1)
    expect(out[0].tradeCount, 'kept the whole span’s count').toBe(8)
    expect(out[0].netPnl).toBeCloseTo(19.24, 8)
    expect(out[0].scoped).toBe(true)
  })

  it('and says so on its face', async () => {
    await compose({ weeks: scopeWeeksToMonth([AUG_WEEKS[1], BOTH], AUG_DAYS) })
    expect(rec.texts).toContain('THIS MONTH ONLY')
  })

  it('its week-scoped lines are dropped rather than shown unscoped', () => {
    const [w] = scopeWeeksToMonth([BOTH], AUG_DAYS)
    expect(w.streak).toEqual({ kind: 'none', days: 0 })
    expect(w.topMistake).toBeNull()
    expect(w.daysJournaled).toBe(0)
    // a ratio of averages cannot be re-derived from per-day averages
    expect(w.plRatio).toBeNull()
    expect(weekTierLines(w)).toEqual(['fees'])
  })

  it('a week entirely inside the month is NOT marked', () => {
    const out = scopeWeeksToMonth([AUG_WEEKS[1]], AUG_DAYS)
    expect(out[0].scoped).toBeUndefined()
  })
})

describe('T4 STAND-DOWN: the GRID still draws adjacent-month days as context', () => {
  it('the grid is 42 Sunday-first cells, padded from the neighbours', () => {
    const cells = buildCells(2026, 8)
    expect(cells).toHaveLength(42)
    expect(cells.filter((c) => !c.inMonth).length).toBeGreaterThan(0)
  })

  it('and those days are still drawn — only the RAIL was trimmed', async () => {
    await compose({}, 'square')
    // Aug 2026 starts on a Saturday, so Jul 26-31 lead the grid.
    for (const d of ['26', '27', '28', '29', '30', '31']) {
      expect(rec.texts, `the grid lost ${d}`).toContain(d)
    }
  })

  it('the mapping wires the scope in, so a real month gets it too', () => {
    const day = (date: string, net: number, trades: number): CalendarDay => ({
      date, net_pnl: net, gross_pnl: net, total_fees: 0.5, trade_count: trades,
      winners: trades, losers: 0, avg_winner: net / trades, avg_loser: null,
      day_tags: [], has_journal: false, no_trade_day: false, is_holiday: false,
      sentiment: null,
    })
    const week = (start: string, end: string, trades: number, net: number): WeeklySummary =>
      ({
        week_start: start, week_end: end, in_month: true, trade_count: trades,
        net_pnl: net, gross_pnl: net, total_fees: 0, winners: trades, losers: 0,
        win_rate: 1, profit_factor: null, avg_winner: null, avg_loser: null,
        best_day: null, worst_day: null, best_symbol: null, days_traded: 1,
        days_journaled: 0, emotion_avg: null, streak: { kind: 'none', days: 0 },
        top_mistake: null, notes: '',
      }) as WeeklySummary
    const month: CalendarMonth = {
      stats: {
        year: 2026, month: 8, net_pnl: 12.4, gross_pnl: 12.4, total_fees: 0.5,
        trade_count: 4, winners: 4, losers: 0, trading_days: 1,
      },
      days: [day('2026-08-03', 12.4, 4)],
      range: { earliest: null, latest: null, monthsWithTrades: [] },
      weeks: [
        week('2026-07-26', '2026-08-01', 16, 0.99), // all July — must go
        week('2026-08-02', '2026-08-08', 4, 12.4), // ours
      ],
    }
    const built = buildMonthCardData(month, 'percent', null)
    expect(built.weeks.map((w) => w.weekStart)).toEqual(['2026-08-02'])
    expect(built.weeks.reduce((a, w) => a + w.tradeCount, 0)).toBe(month.stats.trade_count)
  })
})
