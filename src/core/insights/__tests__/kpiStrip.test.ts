import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeKpiStrip } from '../kpiStrip'

// A full TradeListRow with neutral defaults; override only the fields a case
// cares about (date / symbol / playbook_name / net_pnl / r_multiple).
function mk(over: Partial<TradeListRow>): TradeListRow {
  return {
    id: 1, date: '2026-06-01', symbol: 'AAA', side: 'long',
    open_time: '2026-06-01T13:30:00Z', close_time: '2026-06-01T13:35:00Z',
    is_open: false,
    shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11,
    gross_pnl: 0, total_fees: 0, net_pnl: 0,
    executions: [], note: null, entry_timeframe: null, entry_ema9_distance_pct: null,
    mae: null, mfe: null,
    playbook_id: null, playbook_name: null, playbook_tier: null, confidence: null, mistakes: [],
    planned_risk: null, planned_stop_loss_price: null,
    risk_per_share: null, total_risk: null, r_multiple: null,
    float_shares: null, shares_outstanding: null, catalyst_type: null, days_since_catalyst: null,
    country: null, country_name: 'Unknown', region: 'Unknown', country_source: 'unknown',
    attachment_count: 0, deleted_at: null,
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
    it('bestSetup: a 4-trade playbook (below the ≥5 floor) does not win', () => {
      const trades = [
        ...rep(4, { symbol: 'X', playbook_name: 'Thin', net_pnl: 1000 }),
        ...rep(5, { symbol: 'Y', playbook_name: 'Qualifies', net_pnl: 100 }),
      ]
      expect(computeKpiStrip(trades).bestSetup?.playbook).toBe('Qualifies')
    })
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
})
