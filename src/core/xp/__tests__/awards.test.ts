import { describe, expect, it } from 'vitest'
import {
  FRESH_WINDOW_DAYS,
  XP_AWARDS,
  diffUtcDays,
  isDisciplinedEntry,
  isFullyAnnotated,
  isJournaledDay,
  tradeKeyFor,
} from '../awards'
import type { SessionFact, TradeFact } from '../types'

// v0.2.5 Phase A Session 2 — award amounts, predicates, and the UTC
// day-diff helper (spec §A2, D7, D8, D9, D13; rulings L8 + adjustment A1).

function trade(overrides: Partial<TradeFact> = {}): TradeFact {
  return {
    id: 1,
    tradeKey: 'hash-1',
    date: '2026-06-10',
    hasPlaybook: true,
    hasCatalyst: true,
    hasNote: true,
    isPreMarket: false,
    technicals1m: { macdPositive: true, vwapDistPct: 0.8, ema9DistPct: 0.4 },
    ...overrides,
  }
}

function session(overrides: Partial<SessionFact> = {}): SessionFact {
  return {
    date: '2026-06-10',
    tradeCount: 2,
    sentimentSet: true,
    allTradesPlaybookTagged: true,
    isNoTradeDay: false,
    importedAt: '2026-06-10T18:00:00.000Z',
    ...overrides,
  }
}

describe('XP_AWARDS', () => {
  it('pins every §A2 amount and cap', () => {
    expect(XP_AWARDS.session_journaled).toEqual({ xp: 40, capPerDate: 1 })
    expect(XP_AWARDS.session_journaled_archive).toEqual({ xp: 10, capPerDate: 1 })
    expect(XP_AWARDS.trade_fully_annotated).toEqual({ xp: 12, capPerDate: 6 })
    expect(XP_AWARDS.disciplined_entry).toEqual({ xp: 15, capPerDate: 4 })
    expect(XP_AWARDS.daily_streak_bonus).toEqual({ xp: 25, capPerDate: 1 })
    expect(XP_AWARDS.weekly_review_completed).toEqual({ xp: 175 })
    expect(XP_AWARDS.goal_completed).toEqual({ xp: 1000 })
  })

  it('structural drift guard: the daily-capped types sum to 197 XP/day (§A2)', () => {
    const dailyMax =
      XP_AWARDS.session_journaled.xp * XP_AWARDS.session_journaled.capPerDate +
      XP_AWARDS.trade_fully_annotated.xp * XP_AWARDS.trade_fully_annotated.capPerDate +
      XP_AWARDS.disciplined_entry.xp * XP_AWARDS.disciplined_entry.capPerDate +
      XP_AWARDS.daily_streak_bonus.xp * XP_AWARDS.daily_streak_bonus.capPerDate
    expect(dailyMax).toBe(197) // 40 + 72 + 60 + 25
  })

  it('FRESH_WINDOW_DAYS is 7', () => {
    expect(FRESH_WINDOW_DAYS).toBe(7)
  })
})

describe('tradeKeyFor (D13)', () => {
  it('uses content_hash when non-NULL', () => {
    expect(tradeKeyFor({ content_hash: 'abc123', id: 42 })).toBe('abc123')
  })

  it("falls back to 'id:' + id when content_hash is NULL", () => {
    expect(tradeKeyFor({ content_hash: null, id: 42 })).toBe('id:42')
  })
})

describe('isFullyAnnotated (D8)', () => {
  it('playbook AND catalyst AND non-empty note → true', () => {
    expect(isFullyAnnotated(trade())).toBe(true)
  })

  it.each([
    ['playbook missing', { hasPlaybook: false }],
    ['catalyst missing', { hasCatalyst: false }],
    ['note missing', { hasNote: false }],
  ] as const)('%s → false', (_label, overrides) => {
    expect(isFullyAnnotated(trade(overrides))).toBe(false)
  })

  it('all three missing → false', () => {
    expect(
      isFullyAnnotated(
        trade({ hasPlaybook: false, hasCatalyst: false, hasNote: false }),
      ),
    ).toBe(false)
  })
})

describe('isDisciplinedEntry (D7 — strict triple on the tf_1m snapshot)', () => {
  it('macd_positive === true AND vwap_dist_pct > 0 AND ema9_dist_pct > 0 → true', () => {
    expect(isDisciplinedEntry(trade())).toBe(true)
  })

  it('snapshot missing entirely → false', () => {
    expect(isDisciplinedEntry(trade({ technicals1m: null }))).toBe(false)
  })

  it.each([
    ['macdPositive null', { macdPositive: null, vwapDistPct: 0.8, ema9DistPct: 0.4 }],
    ['vwapDistPct null', { macdPositive: true, vwapDistPct: null, ema9DistPct: 0.4 }],
    ['ema9DistPct null', { macdPositive: true, vwapDistPct: 0.8, ema9DistPct: null }],
    ['macdPositive false', { macdPositive: false, vwapDistPct: 0.8, ema9DistPct: 0.4 }],
    ['vwapDistPct zero (strict >0)', { macdPositive: true, vwapDistPct: 0, ema9DistPct: 0.4 }],
    ['vwapDistPct negative', { macdPositive: true, vwapDistPct: -0.1, ema9DistPct: 0.4 }],
    ['ema9DistPct zero (strict >0)', { macdPositive: true, vwapDistPct: 0.8, ema9DistPct: 0 }],
    ['ema9DistPct negative', { macdPositive: true, vwapDistPct: 0.8, ema9DistPct: -2 }],
  ] as const)('%s → false', (_label, snapshot) => {
    expect(isDisciplinedEntry(trade({ technicals1m: { ...snapshot } }))).toBe(false)
  })
})

describe('isDisciplinedEntry — pre-market amendment (session VWAP N/A before 09:30)', () => {
  it('pre-market, macd + 9EMA aligned, VWAP null → disciplined (the fix)', () => {
    expect(
      isDisciplinedEntry(
        trade({ isPreMarket: true, technicals1m: { macdPositive: true, vwapDistPct: null, ema9DistPct: 0.4 } }),
      ),
    ).toBe(true)
  })
  it('regular hours with the SAME null-VWAP snapshot → NOT disciplined (VWAP still required)', () => {
    expect(
      isDisciplinedEntry(
        trade({ isPreMarket: false, technicals1m: { macdPositive: true, vwapDistPct: null, ema9DistPct: 0.4 } }),
      ),
    ).toBe(false)
  })
  it('pre-market still requires MACD-positive AND above the 9EMA', () => {
    expect(
      isDisciplinedEntry(trade({ isPreMarket: true, technicals1m: { macdPositive: false, vwapDistPct: null, ema9DistPct: 0.4 } })),
    ).toBe(false)
    expect(
      isDisciplinedEntry(trade({ isPreMarket: true, technicals1m: { macdPositive: true, vwapDistPct: null, ema9DistPct: -0.1 } })),
    ).toBe(false)
  })
})

describe('isJournaledDay (D9 per L8)', () => {
  it('no-trade day → true regardless of the trade-side conditions', () => {
    expect(
      isJournaledDay(
        session({
          isNoTradeDay: true,
          tradeCount: 0,
          sentimentSet: false,
          allTradesPlaybookTagged: false,
        }),
      ),
    ).toBe(true)
  })

  it('≥1 trade AND sentiment set AND 100% playbook-tagged → true', () => {
    expect(isJournaledDay(session())).toBe(true)
  })

  it('missing sentiment → false', () => {
    expect(isJournaledDay(session({ sentimentSet: false }))).toBe(false)
  })

  it('one untagged trade (allTradesPlaybookTagged false) → false', () => {
    expect(isJournaledDay(session({ allTradesPlaybookTagged: false }))).toBe(false)
  })

  it('neutral day (zero trades, no no-trade mark) → false', () => {
    expect(
      isJournaledDay(session({ tradeCount: 0, isNoTradeDay: false })),
    ).toBe(false)
  })
})

describe('diffUtcDays (A1 — date-prefix only, component-parsed UTC)', () => {
  it('format equivalence: SQLite datetime and ISO-8601 give identical diffs', () => {
    expect(diffUtcDays('2026-06-05', '2026-06-12 23:59:59')).toBe(7)
    expect(diffUtcDays('2026-06-05', '2026-06-12T23:59:59Z')).toBe(7)
    expect(diffUtcDays('2026-06-05', '2026-06-12T23:59:59.123+09:00')).toBe(7)
  })

  it('near-midnight boundary: day 7 inclusive, day 8 exclusive — time of day never matters', () => {
    // A local-time Date.parse of 'YYYY-MM-DD HH:MM:SS' near midnight would
    // shift these across the boundary in non-UTC zones; the prefix rule
    // makes them exact by construction.
    expect(diffUtcDays('2026-06-05', '2026-06-12 00:00:01')).toBe(7)
    expect(diffUtcDays('2026-06-05', '2026-06-13 00:00:01')).toBe(8)
    expect(diffUtcDays('2026-06-05', '2026-06-12 23:59:59')).toBe(7)
  })

  it('is pure component math — equals Date.UTC arithmetic for the same prefixes', () => {
    // Asserted equivalence with the by-construction definition, so the
    // result cannot depend on the runner's local timezone.
    const expected =
      (Date.UTC(2026, 5, 12) - Date.UTC(2026, 5, 5)) / 86_400_000
    expect(diffUtcDays('2026-06-05 09:30:00', '2026-06-12 16:00:00')).toBe(expected)
  })

  it('zero and negative diffs', () => {
    expect(diffUtcDays('2026-06-12', '2026-06-12 18:00:00')).toBe(0)
    expect(diffUtcDays('2026-06-12', '2026-06-10')).toBe(-2)
  })

  it('month and year boundaries', () => {
    expect(diffUtcDays('2026-05-31', '2026-06-01')).toBe(1)
    expect(diffUtcDays('2025-12-29', '2026-01-05')).toBe(7)
    expect(diffUtcDays('2024-02-28', '2024-03-01')).toBe(2) // leap year
  })

  it.each([
    ['empty', ''],
    ['not a date', 'yesterday'],
    ['unpadded', '2026-6-7'],
    ['slashes', '2026/06/07'],
    ['semantic rollover', '2026-02-31'],
  ] as const)('malformed input (%s) → null', (_label, bad) => {
    expect(diffUtcDays(bad, '2026-06-12')).toBeNull()
    expect(diffUtcDays('2026-06-12', bad)).toBeNull()
  })
})
