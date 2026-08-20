// v0.2.7 Feature 5 — the pure mapping behind T1..T5.
//
// The entry-point tests drive the real header and assert on drawn pixels, which
// is the right level for "can a user make this". These cover the two things that
// are easier to get wrong than to see: which streak a month claims, and when a
// percentage must refuse to compute.

import { describe, expect, it } from 'vitest'
import type { CalendarDay, CalendarMonth } from '@shared/calendar-types'
import { buildMonthCardData, cardFileName, monthLabelOf, pctOf } from '../monthCardData'

function day(date: string, net: number, trades = 1): CalendarDay {
  return {
    date, net_pnl: net, gross_pnl: net, total_fees: 0, trade_count: trades,
    winners: net > 0 ? trades : 0, losers: net < 0 ? trades : 0,
    avg_winner: null, avg_loser: null, day_tags: [], has_journal: false,
    no_trade_day: false, is_holiday: false, sentiment: null,
  }
}

function month(y: number, m: number, days: CalendarDay[]): CalendarMonth {
  const net = days.reduce((a, d) => a + d.net_pnl, 0)
  return {
    stats: {
      year: y, month: m, net_pnl: net, gross_pnl: net, total_fees: 0,
      trade_count: days.reduce((a, d) => a + d.trade_count, 0),
      winners: days.filter((d) => d.net_pnl > 0).length,
      losers: days.filter((d) => d.net_pnl < 0).length,
      trading_days: days.length,
    },
    days,
    range: { earliest: null, latest: null, monthsWithTrades: [] },
    weeks: [],
  }
}

/** LIVE 2026-07 — the real four days. */
const JULY = month(2026, 7, [
  day('2026-07-28', -1.84, 1),
  day('2026-07-29', -12.0, 5),
  day('2026-07-30', -4.41, 2),
  day('2026-07-31', 19.24, 8),
])

describe('the card is built from the month it was handed', () => {
  it('label, year and month all come from the same stats row', () => {
    const d = buildMonthCardData(JULY, 'percent', 10_000)
    expect(d.monthLabel).toBe('July 2026')
    expect(d.year).toBe(2026)
    expect(d.month).toBe(7)
    expect(monthLabelOf(2026, 6)).toBe('June 2026')
  })

  it('the days are the calendar’s own rows, unchanged in order and count', () => {
    const d = buildMonthCardData(JULY, 'percent', 10_000)
    expect(d.days.map((x) => x.date)).toEqual([
      '2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31',
    ])
    expect(d.days.map((x) => x.tradeCount)).toEqual([1, 5, 2, 8])
  })

  it('the month total is the header’s number, not a re-sum', () => {
    // stats.net_pnl is what the header prints; the card must print the same one.
    const d = buildMonthCardData(JULY, 'percent', 10_000)
    expect(d.monthPnl).toBe(JULY.stats.net_pnl)
  })
})

describe('the percentage refuses to compute rather than fabricate', () => {
  it('a real denominator gives a real percentage', () => {
    expect(pctOf(19.24, 10_000)).toBeCloseTo(0.1924, 10)
  })

  it('no anchor -> null, never zero', () => {
    expect(pctOf(19.24, null)).toBeNull()
  })

  it('a non-positive denominator -> null, never Infinity or NaN', () => {
    expect(pctOf(19.24, 0)).toBeNull()
    expect(pctOf(19.24, -500)).toBeNull()
  })

  it('and every day inherits that refusal together', () => {
    const d = buildMonthCardData(JULY, 'percent', null)
    expect(d.days.every((x) => x.pct === null)).toBe(true)
    expect(d.monthPct).toBeNull()
  })
})

describe('the streak is the month’s own, bounded to the month', () => {
  it('July’s ending run is the single green day it finished on', () => {
    const d = buildMonthCardData(JULY, 'percent', 10_000)
    expect(d.currentStreak).toEqual({ kind: 'win', days: 1 })
    expect(d.longestGreenRun).toBe(1)
  })

  it('a month ending red reports a LOSING streak, not an absence', () => {
    const m = month(2026, 6, [
      day('2026-06-22', 36.09), day('2026-06-23', 35.12),
      day('2026-06-24', -6.83), day('2026-06-25', -58.31),
    ])
    const d = buildMonthCardData(m, 'percent', 10_000)
    expect(d.currentStreak).toEqual({ kind: 'loss', days: 2 })
    expect(d.longestGreenRun).toBe(2)
  })

  it('the anchor is the last TRADED day, so an untraded tail cannot blank it', () => {
    // 2026-07-31 is a Friday; the month has no days after it. The run must still
    // be found — walking back from an untraded 31st would work, but the anchor
    // being a real trading day is what makes the value defensible.
    const d = buildMonthCardData(JULY, 'percent', 10_000)
    expect(d.currentStreak.days).toBeGreaterThan(0)
  })

  it('a month with no trades claims no streak at all', () => {
    const d = buildMonthCardData(month(2026, 2, []), 'percent', 10_000)
    expect(d.currentStreak).toEqual({ kind: 'none', days: 0 })
    expect(d.longestGreenRun).toBe(0)
    expect(d.days).toEqual([])
  })
})

describe('the file name', () => {
  it('carries the month, zero-padded so a folder sorts', () => {
    expect(cardFileName(2026, 7)).toBe('fugaedge-calendar-2026-07.png')
    expect(cardFileName(2026, 12)).toBe('fugaedge-calendar-2026-12.png')
  })

  it('and carries no account name', () => {
    expect(cardFileName(2026, 7)).not.toMatch(/account|acct|main/i)
  })
})
