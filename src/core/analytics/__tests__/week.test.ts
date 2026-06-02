import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { ExitDelta } from '@shared/analytics-types'
import { computeWeekMetrics } from '../week'

// Minimal TradeListRow factory — tests override only what they read. Mirrors
// the day.test.ts pattern.
function tradeRow(overrides: Partial<TradeListRow>): TradeListRow {
  return {
    id: 0,
    date: '2026-05-11',
    symbol: 'TEST',
    side: 'long',
    open_time: '2026-05-11T13:30:00Z',
    close_time: '2026-05-11T13:45:00Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 10,
    gross_pnl: 0,
    total_fees: 0,
    net_pnl: 0,
    executions: [],
    note: null,
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
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
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
    deleted_at: null,
    mae: null,
    mfe: null,
    ...overrides,
  }
}

// Week of 2026-05-10 (Sunday) … 2026-05-16 (Saturday).
const WEEK_END = '2026-05-16'

describe('computeWeekMetrics', () => {
  it('returns zeroed-out metrics for an empty week', () => {
    const r = computeWeekMetrics({ trades: [], weekEnd: WEEK_END })

    expect(r.netPnl).toBe(0)
    expect(r.grossPnl).toBe(0)
    expect(r.totalFees).toBe(0)
    expect(r.tradeCount).toBe(0)
    expect(r.winCount).toBe(0)
    expect(r.lossCount).toBe(0)
    expect(r.scratchCount).toBe(0)
    expect(r.winRate).toBeNull()
    expect(r.profitFactor).toBeNull()
    expect(r.avgWin).toBeNull()
    expect(r.avgLoss).toBeNull()
    expect(r.symbolBreakdown).toEqual([])
    expect(r.mistakeTagCounts).toEqual([])
    expect(r.dayByDay).toEqual([])
    expect(r.bestDay).toBeNull()
    expect(r.worstDay).toBeNull()
    expect(r.perPlaybook).toEqual([])
    expect(r.greenDays).toBe(0)
    expect(r.tradingDays).toBe(0)
    expect(r.dayPnlStdDev).toBeNull()
    expect(r.streak).toEqual({ kind: 'none', days: 0 })
    expect(r.biggestWin).toBeNull()
    expect(r.worstLoss).toBeNull()
    expect(r.avgRMultiple).toBeNull()
    expect(r.totalDollarVolume).toBe(0)
    expect(r.avgPerShareGainLoss).toBeNull()
    expect(r.moneyLeftOnTable).toBeNull()
    expect(r.moneyLeftCoverage).toBeNull()
    expect(r.pnlRatio).toBeNull()
  })

  it('computes pnlRatio as avg win ÷ |avg loss| (distinct from profitFactor)', () => {
    // avgWin = (300 + 100)/2 = 200 ; avgLoss = -100 ; ratio = 2.0.
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 300 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 100 }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: -100 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.pnlRatio).toBeCloseTo(2.0, 5)
    expect(r.profitFactor).toBeCloseTo(4.0, 5) // 400/100 — confirms they differ
  })

  it('returns Infinity pnlRatio for a winning-only week (no losers)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 50 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 100 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.pnlRatio).toBe(Infinity)
  })

  it('returns pnlRatio 0 for a losing-only week (no winners)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: -40 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -60 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.pnlRatio).toBe(0)
  })

  it('returns null pnlRatio when no decided trades (all scratches)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 0 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 0 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.pnlRatio).toBeNull()
  })

  it('sums moneyLeftOnTable from exitDeltas and reports coverage against total trades', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, symbol: 'HCTO', net_pnl: 100 }),
      tradeRow({ id: 2, symbol: 'AMSS', net_pnl: 50 }),
      tradeRow({ id: 3, symbol: 'MOBX', net_pnl: -20 }),
    ]
    // Only 2 of 3 trades scaled out with a better available exit fill.
    const exitDeltas: ExitDelta[] = [
      {
        trade_id: 1, date: '2026-05-11', symbol: 'HCTO', side: 'long',
        exit_count: 2, actual_avg_exit: 10.4, best_exit_price: 10.8,
        actual_net_pnl: 100, best_exit_net_pnl: 280, delta: 180,
      },
      {
        trade_id: 2, date: '2026-05-12', symbol: 'AMSS', side: 'long',
        exit_count: 2, actual_avg_exit: 5.2, best_exit_price: 5.6,
        actual_net_pnl: 50, best_exit_net_pnl: 130, delta: 80,
      },
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END, exitDeltas })

    expect(r.moneyLeftOnTable).toBeCloseTo(260, 5) // 180 + 80
    expect(r.moneyLeftCoverage).toEqual({ withMfe: 2, total: 3 })
  })

  it('returns null moneyLeftOnTable + null coverage when no exitDeltas are available', () => {
    const trades: TradeListRow[] = [tradeRow({ id: 1, symbol: 'HCTO', net_pnl: 100 })]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    // Mirrors the day pattern (Decision 3): 0 coverage shows the empty state,
    // NOT a misleading $0.00 sum.
    expect(r.moneyLeftOnTable).toBeNull()
    expect(r.moneyLeftCoverage).toBeNull()
  })

  it('aggregates net / counts / win rate over the week (scratches excluded from win rate)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', gross_pnl: 200, total_fees: 4, net_pnl: 196 }),
      tradeRow({ id: 2, date: '2026-05-12', gross_pnl: -100, total_fees: 2, net_pnl: -102 }),
      tradeRow({ id: 3, date: '2026-05-13', gross_pnl: 2, total_fees: 2, net_pnl: 0 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.tradeCount).toBe(3)
    expect(r.winCount).toBe(1)
    expect(r.lossCount).toBe(1)
    expect(r.scratchCount).toBe(1)
    expect(r.grossPnl).toBeCloseTo(102, 5)
    expect(r.totalFees).toBeCloseTo(8, 5)
    expect(r.netPnl).toBeCloseTo(94, 5)
    expect(r.winRate).toBeCloseTo(0.5, 5) // 1 / (1 + 1)
    expect(r.avgWin).toBeCloseTo(196, 5)
    expect(r.avgLoss).toBeCloseTo(-102, 5)
  })

  it('builds dayByDay chronologically with greenDays / tradingDays', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-13', net_pnl: 50 }),
      tradeRow({ id: 2, date: '2026-05-11', net_pnl: 100 }),
      tradeRow({ id: 3, date: '2026-05-11', net_pnl: -30 }), // 05-11 net +70
      tradeRow({ id: 4, date: '2026-05-12', net_pnl: -40 }), // 05-12 net -40
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.dayByDay).toEqual([
      { date: '2026-05-11', netPnl: 70, tradeCount: 2 },
      { date: '2026-05-12', netPnl: -40, tradeCount: 1 },
      { date: '2026-05-13', netPnl: 50, tradeCount: 1 },
    ])
    expect(r.tradingDays).toBe(3)
    expect(r.greenDays).toBe(2) // 05-11 (+70) and 05-13 (+50)
  })

  it('sign-gates bestDay/worstDay — mixed week has both', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 250 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -180 }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: 40 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.bestDay).toEqual({ date: '2026-05-11', netPnl: 250 })
    expect(r.worstDay).toEqual({ date: '2026-05-12', netPnl: -180 })
  })

  it('all-green week → bestDay set, worstDay null', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 60 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.bestDay).toEqual({ date: '2026-05-11', netPnl: 100 })
    expect(r.worstDay).toBeNull()
  })

  it('all-red week → worstDay set (most negative day), bestDay null', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: -100 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -60 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.bestDay).toBeNull()
    expect(r.worstDay).toEqual({ date: '2026-05-11', netPnl: -100 }) // lowest net of the week
  })

  it('handles a week spanning a month boundary (lexicographic date ordering)', () => {
    // Week of 2026-05-31 (Sun) … 2026-06-06 (Sat) — straddles month-end.
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-31', net_pnl: 30 }),
      tradeRow({ id: 2, date: '2026-06-02', net_pnl: -10 }),
      tradeRow({ id: 3, date: '2026-06-05', net_pnl: 75 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: '2026-06-06' })

    expect(r.tradingDays).toBe(3)
    expect(r.dayByDay.map((d) => d.date)).toEqual([
      '2026-05-31',
      '2026-06-02',
      '2026-06-05',
    ])
    expect(r.netPnl).toBeCloseTo(95, 5)
  })

  it('profitFactor is Infinity for a winning-only week, null when no decided trades', () => {
    const winnersOnly = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 50 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 100 }),
    ]
    expect(computeWeekMetrics({ trades: winnersOnly, weekEnd: WEEK_END }).profitFactor).toBe(Infinity)

    const scratchesOnly = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 0 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 0 }),
    ]
    expect(computeWeekMetrics({ trades: scratchesOnly, weekEnd: WEEK_END }).profitFactor).toBeNull()
  })

  it('profitFactor finite for a mixed week', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 200 }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: -50 }),
      tradeRow({ id: 4, date: '2026-05-14', net_pnl: -100 }),
    ]
    // Σ positives 300 / |Σ negatives| 150 = 2.0
    expect(computeWeekMetrics({ trades, weekEnd: WEEK_END }).profitFactor).toBeCloseTo(2.0, 5)
  })

  it('dayPnlStdDev: null when < 3 trading days, sample sd when >= 3', () => {
    const twoDays = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -50 }),
    ]
    expect(computeWeekMetrics({ trades: twoDays, weekEnd: WEEK_END }).dayPnlStdDev).toBeNull()

    // Three day-net values [10, 20, 30] → mean 20, Σ(x−mean)²=200, var=200/2=100, sd=10
    const threeDays = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 10 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 20 }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: 30 }),
    ]
    expect(computeWeekMetrics({ trades: threeDays, weekEnd: WEEK_END }).dayPnlStdDev).toBeCloseTo(10, 5)
  })

  it('builds perPlaybook (tagged trades only) sorted by net P&L desc, with win rate', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -40, playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: 200, playbook_id: 2, playbook_name: 'Reversal' }),
      tradeRow({ id: 4, date: '2026-05-14', net_pnl: 25, playbook_id: null, playbook_name: null }), // untagged → excluded
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.perPlaybook).toEqual([
      { playbook: 'Reversal', tradeCount: 1, netPnl: 200, winRate: 1 },
      { playbook: 'Gap-and-Go', tradeCount: 2, netPnl: 60, winRate: 0.5 },
    ])
  })

  it('aggregates symbolBreakdown and mistakeTagCounts across the week', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', symbol: 'HCTO', net_pnl: 100, mistakes: ['FOMO entry'] }),
      tradeRow({ id: 2, date: '2026-05-12', symbol: 'HCTO', net_pnl: 50, mistakes: ['FOMO entry', 'Sized too big'] }),
      tradeRow({ id: 3, date: '2026-05-13', symbol: 'AMSS', net_pnl: -20, mistakes: [] }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.symbolBreakdown).toEqual([
      { symbol: 'HCTO', tradeCount: 2, netPnl: 150 },
      { symbol: 'AMSS', tradeCount: 1, netPnl: -20 },
    ])
    expect(r.mistakeTagCounts).toEqual([
      { tag: 'FOMO entry', count: 2 },
      { tag: 'Sized too big', count: 1 },
    ])
  })

  it('computes streak into the week end from the daily P&L map (reaches prior weeks)', () => {
    // Daily P&L incl. days before the week — a 3-day win streak ending 05-16.
    const dailyPnl = new Map<string, number>([
      ['2026-05-08', -50], // breaks the streak before it
      ['2026-05-14', 100],
      ['2026-05-15', 60],
      ['2026-05-16', 25],
    ])
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-16', net_pnl: 25 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END, dailyPnl })
    expect(r.streak).toEqual({ kind: 'win', days: 3 })
  })

  it('reports a loss streak when the most recent traded days are red', () => {
    const dailyPnl = new Map<string, number>([
      ['2026-05-13', 80],
      ['2026-05-15', -40],
      ['2026-05-16', -25],
    ])
    const trades: TradeListRow[] = [tradeRow({ id: 1, date: '2026-05-16', net_pnl: -25 })]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END, dailyPnl })
    expect(r.streak).toEqual({ kind: 'loss', days: 2 })
  })

  // ── Cheap Tier-B additions (v0.2.2 Day 4.5c) — single-trade extremes,
  //    R-multiple, notional volume, per-share P&L. Mirror day.ts conventions.

  it('biggestWin / worstLoss track the single largest winning / losing TRADE (with symbol)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', symbol: 'HCTO', net_pnl: 100 }),
      tradeRow({ id: 2, date: '2026-05-11', symbol: 'ABCD', net_pnl: 300 }), // biggest win
      tradeRow({ id: 3, date: '2026-05-12', symbol: 'XYZ', net_pnl: -50 }),
      tradeRow({ id: 4, date: '2026-05-12', symbol: 'QQQ', net_pnl: -220 }), // worst loss
      tradeRow({ id: 5, date: '2026-05-13', symbol: 'TEST', net_pnl: 20 }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.biggestWin).toEqual({ symbol: 'ABCD', pnl: 300 })
    expect(r.worstLoss).toEqual({ symbol: 'QQQ', pnl: -220 })
    // Distinct axis from bestDay: 05-11 nets +400 (the best DAY) but the biggest
    // single TRADE is +300.
    expect(r.bestDay).toEqual({ date: '2026-05-11', netPnl: 400 })
  })

  it('all-green week → worstLoss null; all-loss week → biggestWin null', () => {
    const allGreen = [
      tradeRow({ id: 1, date: '2026-05-11', symbol: 'AAA', net_pnl: 100 }),
      tradeRow({ id: 2, date: '2026-05-12', symbol: 'BBB', net_pnl: 60 }),
    ]
    const g = computeWeekMetrics({ trades: allGreen, weekEnd: WEEK_END })
    expect(g.biggestWin).toEqual({ symbol: 'AAA', pnl: 100 })
    expect(g.worstLoss).toBeNull()

    const allLoss = [
      tradeRow({ id: 1, date: '2026-05-11', symbol: 'CCC', net_pnl: -100 }),
      tradeRow({ id: 2, date: '2026-05-12', symbol: 'DDD', net_pnl: -60 }),
    ]
    const l = computeWeekMetrics({ trades: allLoss, weekEnd: WEEK_END })
    expect(l.biggestWin).toBeNull()
    expect(l.worstLoss).toEqual({ symbol: 'CCC', pnl: -100 })
  })

  it('avgRMultiple averages trades with r_multiple set and ignores those without', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, r_multiple: 2 }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -50, r_multiple: -1 }),
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: 25, r_multiple: null }), // ignored
    ]
    // (2 + −1) / 2 = 0.5  — the null-R trade is not in the denominator.
    expect(computeWeekMetrics({ trades, weekEnd: WEEK_END }).avgRMultiple).toBeCloseTo(0.5, 5)

    const noneSet = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, r_multiple: null }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: -50, r_multiple: null }),
    ]
    expect(computeWeekMetrics({ trades: noneSet, weekEnd: WEEK_END }).avgRMultiple).toBeNull()
  })

  it('totalDollarVolume sums per-trade notional (buy + sell legs)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', shares_bought: 100, avg_buy_price: 10, shares_sold: 100, avg_sell_price: 11 }), // 1000 + 1100
      tradeRow({ id: 2, date: '2026-05-12', shares_bought: 50, avg_buy_price: 20, shares_sold: 50, avg_sell_price: 22 }), // 1000 + 1100
    ]
    expect(computeWeekMetrics({ trades, weekEnd: WEEK_END }).totalDollarVolume).toBeCloseTo(4200, 5)
  })

  it('avgPerShareGainLoss = netPnl / total shares traded', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 200, shares_bought: 100, shares_sold: 100 }), // 200 shares
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 100, shares_bought: 50, shares_sold: 50 }), // 100 shares
    ]
    // netPnl 300 / totalShares 300 = 1.0 per share
    expect(computeWeekMetrics({ trades, weekEnd: WEEK_END }).avgPerShareGainLoss).toBeCloseTo(1.0, 5)
  })

  // v0.2.2 Day 5a — intraday MAE/MFE display wiring (mean $/share over covered).
  it('averages MFE/MAE in $/share over covered trades only', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', mfe: 0.60, mae: 0.20 }),
      tradeRow({ id: 2, date: '2026-05-12', mfe: 0.20, mae: 0.40 }),
      tradeRow({ id: 3, date: '2026-05-13', mfe: null, mae: null }), // excluded
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })
    expect(r.avgMfeDollars).toBeCloseTo(0.4, 5)
    expect(r.avgMaeDollars).toBeCloseTo(0.3, 5)
  })

  it('avgMfe/avgMae null when no trade has intraday data', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', mfe: null, mae: null }),
      tradeRow({ id: 2, date: '2026-05-12', mfe: null, mae: null }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })
    expect(r.avgMfeDollars).toBeNull()
    expect(r.avgMaeDollars).toBeNull()
  })

  // ── v0.2.2 Day 5b — Week Performance Hold Time. Mirrors day.ts: hold seconds
  //    = (close_time − open_time)/1000, bucketed by net_pnl sign, still-open
  //    trades (close_time null) skipped, empty buckets → null.

  it('computes avgHoldSeconds as the mean hold across the week’s trades', () => {
    const trades: TradeListRow[] = [
      // 10 min = 600s
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, open_time: '2026-05-11T13:30:00Z', close_time: '2026-05-11T13:40:00Z' }),
      // 20 min = 1200s
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 50, open_time: '2026-05-12T13:30:00Z', close_time: '2026-05-12T13:50:00Z' }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.avgHoldSeconds).toBeCloseTo(900, 5) // (600 + 1200) / 2
  })

  it('partitions hold time into winners / losers / scratches by net_pnl sign', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, open_time: '2026-05-11T13:30:00Z', close_time: '2026-05-11T13:40:00Z' }), // win 600s
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 200, open_time: '2026-05-12T13:30:00Z', close_time: '2026-05-12T13:50:00Z' }), // win 1200s
      tradeRow({ id: 3, date: '2026-05-13', net_pnl: -50, open_time: '2026-05-13T13:30:00Z', close_time: '2026-05-13T14:00:00Z' }), // loss 1800s
      tradeRow({ id: 4, date: '2026-05-14', net_pnl: 0, open_time: '2026-05-14T13:30:00Z', close_time: '2026-05-14T13:35:00Z' }),   // scratch 300s
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.avgHoldSecondsWinners).toBeCloseTo(900, 5)   // (600 + 1200) / 2
    expect(r.avgHoldSecondsLosers).toBeCloseTo(1800, 5)
    expect(r.avgHoldSecondsScratches).toBeCloseTo(300, 5)
    expect(r.avgHoldSeconds).toBeCloseTo(975, 5)          // (600 + 1200 + 1800 + 300) / 4
  })

  it('skips still-open trades (close_time null) — no NaN', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, open_time: '2026-05-11T13:30:00Z', close_time: '2026-05-11T13:40:00Z' }), // closed, 600s
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 0, is_open: true, open_time: '2026-05-12T13:30:00Z', close_time: null }),        // open position
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(Number.isNaN(r.avgHoldSeconds as number)).toBe(false)
    expect(r.avgHoldSeconds).toBeCloseTo(600, 5)   // only the closed trade counts
    // The open trade is net 0 but is skipped entirely — the scratch bucket
    // never sees it, so it stays empty → null (mirrors day.ts guard).
    expect(r.avgHoldSecondsScratches).toBeNull()
  })

  it('all four hold fields null for an empty week', () => {
    const r = computeWeekMetrics({ trades: [], weekEnd: WEEK_END })

    expect(r.avgHoldSeconds).toBeNull()
    expect(r.avgHoldSecondsWinners).toBeNull()
    expect(r.avgHoldSecondsLosers).toBeNull()
    expect(r.avgHoldSecondsScratches).toBeNull()
  })

  it('empty buckets are null on a winners-only week (no losers / scratches)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, date: '2026-05-11', net_pnl: 100, open_time: '2026-05-11T13:30:00Z', close_time: '2026-05-11T13:40:00Z' }),
      tradeRow({ id: 2, date: '2026-05-12', net_pnl: 60, open_time: '2026-05-12T13:30:00Z', close_time: '2026-05-12T13:50:00Z' }),
    ]
    const r = computeWeekMetrics({ trades, weekEnd: WEEK_END })

    expect(r.avgHoldSecondsWinners).toBeCloseTo(900, 5)
    expect(r.avgHoldSecondsLosers).toBeNull()
    expect(r.avgHoldSecondsScratches).toBeNull()
  })
})
