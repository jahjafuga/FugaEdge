import { describe, it, expect } from 'vitest'
import { countNoTradeDaysThisMonth } from '../today'
import type { SessionMeta } from '@shared/session-types'

function s(date: string, no_trade_day: boolean): SessionMeta {
  return {
    date,
    sentiment: null,
    notes: '',
    no_trade_day,
    no_trade_reason: no_trade_day ? 'reason' : '',
  }
}

describe('countNoTradeDaysThisMonth', () => {
  it('counts distinct session_meta no-trade dates within the current month', () => {
    const sessions: SessionMeta[] = [
      s('2026-05-05', true),
      s('2026-05-06', true),
      s('2026-05-07', true),
      // Previous month — must NOT be counted.
      s('2026-04-30', true),
      // Trading day this month — must NOT be counted.
      s('2026-05-11', false),
    ]
    expect(countNoTradeDaysThisMonth('2026-05-14', sessions)).toBe(3)
  })

  it('unions dates from the calendar (journal day_tags path) with session_meta', () => {
    // Repro of the v0.1.3 Case-D bug: May 12 was marked via the calendar
    // modal only (day_tags), May 13 via the dashboard (session_meta).
    // Counter must see both.
    const sessions: SessionMeta[] = [s('2026-05-13', true)]
    const extra = ['2026-05-12', '2026-05-13'] // calendar union — overlap allowed
    expect(countNoTradeDaysThisMonth('2026-05-14', sessions, extra)).toBe(2)
  })

  it('de-duplicates a date present in BOTH stores (idempotent count)', () => {
    const sessions: SessionMeta[] = [s('2026-05-13', true)]
    const extra = ['2026-05-13']
    expect(countNoTradeDaysThisMonth('2026-05-14', sessions, extra)).toBe(1)
  })

  it('ignores extra dates outside the current calendar month', () => {
    const sessions: SessionMeta[] = []
    const extra = ['2026-04-30', '2026-05-12', '2026-06-01']
    expect(countNoTradeDaysThisMonth('2026-05-14', sessions, extra)).toBe(1)
  })

  it('returns 0 when no inputs match', () => {
    expect(countNoTradeDaysThisMonth('2026-05-14', [])).toBe(0)
    expect(countNoTradeDaysThisMonth('2026-05-14', [], [])).toBe(0)
  })
})
