import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
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
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: 'Unknown',
    region: 'Unknown',
    country_source: 'unknown',
    attachment_count: 0,
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
})
