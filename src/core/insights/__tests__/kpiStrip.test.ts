import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeKpiStrip } from '../kpiStrip'
import { computeWeekMetrics } from '@/core/analytics/week'

// A full TradeListRow with neutral defaults; override only the fields a case
// cares about (date / symbol / playbook_name / net_pnl / r_multiple).
function mk(over: Partial<TradeListRow>): TradeListRow {
  return {
    account_id: 'ACCT-MAIN',
    id: 1, date: '2026-06-01', symbol: 'AAA', side: 'long',
    open_time: '2026-06-01T13:30:00Z', close_time: '2026-06-01T13:35:00Z',
    is_open: false,
    shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11,
    gross_pnl: 0, total_fees: 0, net_pnl: 0,
    executions: [], note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    mae: null, mfe: null, daily_change_pct: null, rvol: null,
    playbook_id: null, playbook_name: null, playbook_tier: null, confidence: null, mistakes: [],
    planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null,
    float_shares: null, shares_outstanding: null, catalyst_type: null, days_since_catalyst: null,
    country: null, country_name: 'Unknown', region: 'Unknown', country_source: 'unknown',
    attachment_count: 0, secondary_tag_count: 0, deleted_at: null,
    ...over,
  }
}

const rep = (n: number, over: Partial<TradeListRow>) => Array.from({ length: n }, () => mk(over))

// 2026-06-04 is a Thursday; 06-01 Monday, 06-02 Tuesday (distinct weekdays).
// AZI / Bull Flag / Thursday all carry the +1500 group → each best-of tile picks
// it. CCC is untagged (null playbook) and below the symbol floor (2 trades).
const NORMAL: TradeListRow[] = [
  ...rep(5, { symbol: 'AZI', playbook_name: 'Bull Flag', date: '2026-06-04', net_pnl: 300 }),
  ...rep(5, { symbol: 'BBB', playbook_name: 'Dip Buy', date: '2026-06-01', net_pnl: 100 }),
  ...rep(2, { symbol: 'CCC', playbook_name: null, date: '2026-06-02', net_pnl: -200 }),
]

describe('computeKpiStrip', () => {
  describe('normal trade set — each tile picks the right winner', () => {
    const r = computeKpiStrip(NORMAL)

    it('bestSymbol = highest-net ticker (AZI, +1500 over 5t, 100% win)', () => {
      expect(r.bestSymbol).toEqual({ symbol: 'AZI', netPnl: 1500, trades: 5, winRate: 1 })
    })
    it('bestSetup = highest-net playbook (Bull Flag)', () => {
      expect(r.bestSetup).toEqual({ playbook: 'Bull Flag', netPnl: 1500, trades: 5, winRate: 1 })
    })
    it('bestSession = highest-net single DAY (2026-06-04)', () => {
      expect(r.bestSession).toEqual({ date: '2026-06-04', netPnl: 1500, trades: 5, winRate: 1 })
    })
    it('bestWeekday = the weekday of the best day (Thursday)', () => {
      expect(r.bestWeekday).toEqual({ day: 'Thursday', netPnl: 1500, trades: 5, winRate: 1 })
    })
    it('payoffRatio = avg winner ÷ |avg loser| (200 / 200 = 1)', () => {
      expect(r.payoffRatio).toEqual({ ratio: 1, avgWin: 200, avgLoss: -200 })
    })
    it('expectancy.dollars = net ÷ trade count (1600 / 12)', () => {
      expect(r.expectancy?.dollars).toBeCloseTo(1600 / 12, 6)
      expect(r.expectancy?.trades).toBe(12)
      expect(r.expectancy?.rMultiple).toBeUndefined()
    })
  })

  describe('sample floors — a thin bucket never wins (anti-fluke)', () => {
    it('bestSymbol: a 1-trade +99,999 fluke loses to a 3-trade solid symbol', () => {
      const trades = [
        mk({ symbol: 'FLUKE', net_pnl: 99999 }),
        ...rep(3, { symbol: 'SOLID', net_pnl: 100 }),
      ]
      expect(computeKpiStrip(trades).bestSymbol).toEqual({
        symbol: 'SOLID', netPnl: 300, trades: 3, winRate: 1,
      })
    })
    // NOTE: the setup dimension no longer has an anti-fluke floor — it matches the
    // per-playbook breakdown (no minimum) and excludes the "No Setup" catch-all
    // instead. Its coverage lives in the dedicated bestSetup describe below. The
    // symbol floor above stays locked.
  })

  describe('null / honest-empty cases (never a fabricated leader)', () => {
    it('no trades → every tile null', () => {
      const r = computeKpiStrip([])
      expect(r.bestSymbol).toBeNull()
      expect(r.bestWeekday).toBeNull()
      expect(r.bestSetup).toBeNull()
      expect(r.bestSession).toBeNull()
      expect(r.payoffRatio).toBeNull()
      expect(r.expectancy).toBeNull()
    })
    it('no tagged playbooks → bestSetup null, other tiles still compute', () => {
      const r = computeKpiStrip(rep(5, { symbol: 'AAA', playbook_name: null, net_pnl: 100 }))
      expect(r.bestSetup).toBeNull()
      expect(r.bestSymbol).not.toBeNull()
    })
    it('no losers → payoffRatio null (no divide by zero); expectancy still computes', () => {
      const r = computeKpiStrip(rep(5, { net_pnl: 100 }))
      expect(r.payoffRatio).toBeNull()
      expect(r.expectancy?.dollars).toBeCloseTo(100, 6)
    })
    it('no winners → payoffRatio null', () => {
      expect(computeKpiStrip(rep(5, { net_pnl: -100 })).payoffRatio).toBeNull()
    })
  })

  describe('expectancy', () => {
    it('dollars = net ÷ n', () => {
      const e = computeKpiStrip([
        mk({ net_pnl: 100 }), mk({ net_pnl: 200 }), mk({ net_pnl: -60 }),
      ]).expectancy
      expect(e?.dollars).toBeCloseTo(80, 6) // (100 + 200 − 60) / 3
      expect(e?.trades).toBe(3)
    })
    it('rMultiple included only when ≥5 risked trades carry an r_multiple', () => {
      const e = computeKpiStrip([
        mk({ net_pnl: 100, r_multiple: 1 }),
        mk({ net_pnl: 100, r_multiple: 2 }),
        mk({ net_pnl: 100, r_multiple: 3 }),
        mk({ net_pnl: -50, r_multiple: -1 }),
        mk({ net_pnl: 0, r_multiple: 0 }),
      ]).expectancy
      expect(e?.rMultiple).toBeCloseTo(1, 6) // (1 + 2 + 3 − 1 + 0) / 5
    })
    it('rMultiple omitted when fewer than 5 risked trades carry one', () => {
      const trades = [
        ...rep(4, { r_multiple: 5, net_pnl: 100 }),
        mk({ r_multiple: null, net_pnl: 100 }),
      ]
      expect(computeKpiStrip(trades).expectancy?.rMultiple).toBeUndefined()
    })
  })

  // v0.2.5 fix — Best Setup must EXCLUDE the frozen "No Setup" catch-all AND drop
  // its sample floor, so it agrees with the per-playbook breakdown (analytics/
  // week.ts) instead of crowning a losing catch-all. The bug: "No Setup" (6t,
  // net-negative) cleared the ≥5 floor while the genuine leader Break
  // Micro-Pullback (3t) was dropped by it. Symbol / weekday / session are untouched.
  describe('bestSetup — excludes the No Setup catch-all, no sample floor (matches per-playbook)', () => {
    // Dave's week: the genuine leader is a 3-trade setup; the catch-all "No Setup"
    // has the most trades (6) and a losing net.
    const WEEK: TradeListRow[] = [
      ...rep(3, { symbol: 'BRK', playbook_name: 'Break Micro-Pullback', date: '2026-06-01', net_pnl: 16.36 }),
      ...rep(6, { symbol: 'NOS', playbook_name: 'No Setup', date: '2026-06-02', net_pnl: -11.78 }),
      ...rep(2, { symbol: 'BRD', playbook_name: 'Break $', date: '2026-06-03', net_pnl: -20 }),
    ]

    it('CORRECTNESS: the 3-trade genuine leader wins, not the 6-trade No Setup catch-all', () => {
      const best = computeKpiStrip(WEEK).bestSetup
      expect(best?.playbook).toBe('Break Micro-Pullback')
      expect(best?.trades).toBe(3)
    })

    it('CATCH-ALL EXCLUDED: No Setup never wins even when it is the max-net bucket', () => {
      const trades = [
        ...rep(6, { playbook_name: 'No Setup', net_pnl: 100 }), // +600, highest, most trades
        ...rep(5, { playbook_name: 'Bull Flag', net_pnl: 50 }), // +250, a real setup
      ]
      const best = computeKpiStrip(trades).bestSetup
      expect(best?.playbook).toBe('Bull Flag')
      expect(best?.playbook).not.toBe('No Setup')
    })

    it('CATCH-ALL ONLY: with no eligible real setup, bestSetup is null (empty state), not No Setup', () => {
      const trades = [
        ...rep(6, { playbook_name: 'No Setup', net_pnl: 100 }),
        ...rep(3, { playbook_name: null, net_pnl: 50 }), // untagged (dropped by groupBy)
      ]
      expect(computeKpiStrip(trades).bestSetup).toBeNull()
    })

    it('NO FLOOR: a low-count real setup can win now (floor dropped) — isolated from the catch-all', () => {
      const trades = [
        ...rep(3, { playbook_name: 'Break Micro-Pullback', net_pnl: 20 }), // +60, 3t
        ...rep(6, { playbook_name: 'Grinder', net_pnl: 5 }), // +30, 6t
      ]
      // The old ≥5 floor dropped the 3-trade leader and crowned Grinder; no floor now.
      expect(computeKpiStrip(trades).bestSetup?.playbook).toBe('Break Micro-Pullback')
    })

    it('AGREEMENT: bestSetup == the per-playbook breakdown top, excluding the catch-all', () => {
      // Cross-check against the ACTUAL per-playbook computation (analytics/week.ts),
      // which ranks name-keyed buckets net-descending. The two views must agree on
      // the top REAL setup — this fails if they ever drift apart again.
      const wk = computeWeekMetrics({ trades: WEEK, weekEnd: '2026-06-06' })
      const topReal = wk.perPlaybook?.find((p) => p.playbook !== 'No Setup') ?? null
      const best = computeKpiStrip(WEEK).bestSetup
      expect(best?.playbook).toBe(topReal?.playbook)
      expect(best?.playbook).toBe('Break Micro-Pullback')
    })

    it('SIBLING REGRESSION: symbol / weekday / session unchanged (their floors still apply)', () => {
      const r = computeKpiStrip(NORMAL)
      expect(r.bestSymbol).toEqual({ symbol: 'AZI', netPnl: 1500, trades: 5, winRate: 1 })
      expect(r.bestWeekday).toEqual({ day: 'Thursday', netPnl: 1500, trades: 5, winRate: 1 })
      expect(r.bestSession).toEqual({ date: '2026-06-04', netPnl: 1500, trades: 5, winRate: 1 })
      // The setup dimension still resolves the max real playbook (now floor-free).
      expect(r.bestSetup?.playbook).toBe('Bull Flag')
    })
  })
})
