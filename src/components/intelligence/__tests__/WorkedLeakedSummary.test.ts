import { describe, it, expect } from 'vitest'
import { headerStats } from '../WorkedLeakedSummary'
import type { WeekMetrics } from '@shared/week-types'
import type { DayMetrics } from '@shared/day-types'

// Regression for the EdgeIQ "What worked / What leaked" Session↔Week toggle crash
// (2026-06-14). headerStats read week-only fields (streak.kind / greenDays) off
// whatever metrics was loaded; during the async toggle a DayMetrics could be
// passed in 'week' scope — and DayMetrics has NO `streak` — so `wm.streak.kind`
// threw a TypeError and crashed the page. headerStats must branch by scope AND
// never throw on a shape mismatch (the desynced-render input). Case (c) below is
// the exact crash input — it throws on the pre-fix code, passes after.
//
// Only the fields headerStats reads are populated (cast to the full types).

const day = (over: Partial<DayMetrics> = {}): DayMetrics =>
  ({ netPnl: 120, winRate: 0.6, profitFactor: 2, winCount: 5, lossCount: 3, ...over }) as DayMetrics

const week = (over: Partial<WeekMetrics> = {}): WeekMetrics =>
  ({
    netPnl: 300,
    winRate: 0.55,
    profitFactor: 1.8,
    winCount: 9,
    lossCount: 7,
    greenDays: 3,
    tradingDays: 5,
    streak: { kind: 'win', days: 2 },
    ...over,
  }) as WeekMetrics

describe('headerStats — mode-aware + crash-proof on shape mismatch', () => {
  it('(a) session scope (DayMetrics): Net/Win/PF + W/L record, no week-only rows', () => {
    const rows = headerStats(day(), 'session')
    expect(rows.map((r) => r.label)).toEqual(['Net P&L', 'Win rate', 'Profit factor', 'Record'])
    expect(rows.find((r) => r.label === 'Record')?.value).toBe('5W 3L')
    expect(rows.map((r) => r.label)).not.toContain('Streak')
    expect(rows.map((r) => r.label)).not.toContain('Green days')
  })

  it('(b) week scope (WeekMetrics): Net/Win/PF + Green days + Streak', () => {
    const rows = headerStats(week(), 'week')
    expect(rows.map((r) => r.label)).toEqual([
      'Net P&L',
      'Win rate',
      'Profit factor',
      'Green days',
      'Streak',
    ])
    expect(rows.find((r) => r.label === 'Green days')?.value).toBe('3/5')
    expect(rows.find((r) => r.label === 'Streak')?.value).toBe('2d win')
  })

  it('(c) does NOT throw when a DayMetrics is fed in week scope (the desync repro)', () => {
    expect(() => headerStats(day(), 'week')).not.toThrow()
    const rows = headerStats(day(), 'week')
    expect(rows.find((r) => r.label === 'Streak')?.value).toBe('—')
    expect(rows.find((r) => r.label === 'Green days')?.value).toBe('—/—')
  })
})
