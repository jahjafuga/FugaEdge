import { describe, expect, it } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import type { ExitDelta } from '@shared/analytics-types'
import { computeDayMetrics } from '../day'

// Minimal TradeListRow factory. Tests override only the fields they care about;
// every other field gets a benign default. Mirrors the pattern from
// src/core/performance/__tests__/metrics.test.ts.
function tradeRow(overrides: Partial<TradeListRow>): TradeListRow {
  return {
    id: 0,
    date: '2026-05-15',
    symbol: 'TEST',
    side: 'long',
    open_time: '2026-05-15T09:30:00',
    close_time: '2026-05-15T09:45:00',
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

describe('computeDayMetrics', () => {
  it('returns zeroed-out metrics for a day with no trades', () => {
    const result = computeDayMetrics({
      date: '2026-05-15',
      trades: [],
      exitDeltas: [],
    })

    expect(result.date).toBe('2026-05-15')
    // 2026-05-15 was a Friday — sanity-checks day-of-week derivation
    expect(result.dayOfWeek).toBe('Friday')
    expect(result.tradeCount).toBe(0)
    expect(result.winCount).toBe(0)
    expect(result.lossCount).toBe(0)
    expect(result.scratchCount).toBe(0)
    expect(result.grossPnl).toBe(0)
    expect(result.totalFees).toBe(0)
    expect(result.netPnl).toBe(0)
    expect(result.winRate).toBeNull()
    expect(result.biggestWin).toBeNull()
    expect(result.worstLoss).toBeNull()
    expect(result.firstTradePnl).toBeNull()
    expect(result.avgRMultiple).toBeNull()
    expect(result.avgWin).toBeNull()
    expect(result.avgLoss).toBeNull()
    expect(result.sessionFirstTradeTime).toBeNull()
    expect(result.sessionLastTradeTime).toBeNull()
    expect(result.symbolsTraded).toEqual([])
    expect(result.topThreeSymbols).toEqual([])
    expect(result.totalShares).toBe(0)
    expect(result.totalDollarVolume).toBe(0)
    expect(result.mostUsedPlaybook).toBeNull()
    expect(result.moneyLeftOnTable).toBeNull()
    expect(result.moneyLeftCoverage).toBeNull()
  })

  it('counts wins, losses, scratches and sums gross/fees/net across the day', () => {
    const trades: TradeListRow[] = [
      // Winner: net +196
      tradeRow({ id: 1, symbol: 'HCTO', open_time: '2026-05-15T09:31:00', gross_pnl: 200, total_fees: 4, net_pnl: 196 }),
      // Loser: net -102
      tradeRow({ id: 2, symbol: 'AMSS', open_time: '2026-05-15T09:45:00', gross_pnl: -100, total_fees: 2, net_pnl: -102 }),
      // Scratch: net 0
      tradeRow({ id: 3, symbol: 'AIIO', open_time: '2026-05-15T10:15:00', gross_pnl: 2, total_fees: 2, net_pnl: 0 }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    expect(result.tradeCount).toBe(3)
    expect(result.winCount).toBe(1)
    expect(result.lossCount).toBe(1)
    expect(result.scratchCount).toBe(1)

    expect(result.grossPnl).toBeCloseTo(102, 5)   // 200 - 100 + 2
    expect(result.totalFees).toBeCloseTo(8, 5)    // 4 + 2 + 2
    expect(result.netPnl).toBeCloseTo(94, 5)      // 196 - 102 + 0

    // Scratches don't count in the denominator — matches the existing
    // electron/analytics/get.ts convention (decided = wins + losses).
    expect(result.winRate).toBeCloseTo(0.5, 5)    // 1 / (1 + 1)
  })

  it('attributes biggestWin, worstLoss, and firstTradePnl by P&L and chronology', () => {
    const trades: TradeListRow[] = [
      // First chronologically (open_time 09:31) — small winner +50
      tradeRow({ id: 1, symbol: 'HCTO', open_time: '2026-05-15T09:31:00', net_pnl: 50, r_multiple: 1.4 }),
      // Biggest winner +250 (not first)
      tradeRow({ id: 2, symbol: 'BIGW', open_time: '2026-05-15T09:45:00', net_pnl: 250 }),
      // Mid-day loser -80 (not the worst)
      tradeRow({ id: 3, symbol: 'AMSS', open_time: '2026-05-15T10:15:00', net_pnl: -80 }),
      // Worst loss -300
      tradeRow({ id: 4, symbol: 'BAD', open_time: '2026-05-15T11:00:00', net_pnl: -300 }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    expect(result.biggestWin).toEqual({ symbol: 'BIGW', pnl: 250 })
    expect(result.worstLoss).toEqual({ symbol: 'BAD', pnl: -300 })
    // First trade — chronologically (open_time ascending), NOT first in the input array
    expect(result.firstTradePnl).toEqual({ symbol: 'HCTO', pnl: 50, rMultiple: 1.4 })
  })

  it('averages winners, losers, and R-multiples (excluding nulls from R)', () => {
    const trades: TradeListRow[] = [
      // Winners: 100, 200, 300 → avg 200
      tradeRow({ id: 1, symbol: 'W1', net_pnl: 100, r_multiple: 1.0 }),
      tradeRow({ id: 2, symbol: 'W2', net_pnl: 200, r_multiple: 2.0 }),
      tradeRow({ id: 3, symbol: 'W3', net_pnl: 300, r_multiple: null }), // no R
      // Losers: -50, -150 → avg -100
      tradeRow({ id: 4, symbol: 'L1', net_pnl: -50, r_multiple: -0.5 }),
      tradeRow({ id: 5, symbol: 'L2', net_pnl: -150, r_multiple: null }), // no R
      // Scratch — excluded from both averages
      tradeRow({ id: 6, symbol: 'S', net_pnl: 0, r_multiple: null }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    expect(result.avgWin).toBeCloseTo(200, 5)        // (100 + 200 + 300) / 3
    expect(result.avgLoss).toBeCloseTo(-100, 5)      // (-50 + -150) / 2
    // R-multiple average over the 3 trades that have R set: (1.0 + 2.0 - 0.5) / 3 = 0.833...
    expect(result.avgRMultiple).toBeCloseTo(2.5 / 3, 5)
  })

  it('returns null R-multiple average when no trade has planned risk set', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 100, r_multiple: null }),
      tradeRow({ id: 2, net_pnl: -50, r_multiple: null }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    expect(result.avgRMultiple).toBeNull()
  })

  it('computes session window (HH:MM) and total shares + dollar volume', () => {
    const trades: TradeListRow[] = [
      tradeRow({
        id: 1,
        symbol: 'HCTO',
        open_time: '2026-05-15T09:31:15',
        close_time: '2026-05-15T09:45:00',
        shares_bought: 500,
        avg_buy_price: 10,
        shares_sold: 500,
        avg_sell_price: 10.4,
      }),
      tradeRow({
        id: 2,
        symbol: 'AMSS',
        open_time: '2026-05-15T10:15:00',
        close_time: '2026-05-15T11:02:30',
        shares_bought: 300,
        avg_buy_price: 5,
        shares_sold: 300,
        avg_sell_price: 4.8,
      }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    expect(result.sessionFirstTradeTime).toBe('09:31')  // earliest open
    expect(result.sessionLastTradeTime).toBe('11:02')   // latest close
    expect(result.totalShares).toBe(1600)               // 500+500 + 300+300
    // Notional: 500*10 + 500*10.4 + 300*5 + 300*4.8 = 5000 + 5200 + 1500 + 1440 = 13140
    expect(result.totalDollarVolume).toBeCloseTo(13140, 5)
  })

  it('aggregates distinct symbols, top three by trade count, and most-used playbook with its win rate', () => {
    const trades: TradeListRow[] = [
      // HCTO: 3 trades on the Gap-and-Go playbook (2W, 1L)
      tradeRow({ id: 1,  symbol: 'HCTO', net_pnl: 100,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 2,  symbol: 'HCTO', net_pnl: 200,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 3,  symbol: 'HCTO', net_pnl: -50,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      // AMSS: 2 trades on Reversal
      tradeRow({ id: 4,  symbol: 'AMSS', net_pnl: 50,   playbook_id: 2, playbook_name: 'Reversal' }),
      tradeRow({ id: 5,  symbol: 'AMSS', net_pnl: -20,  playbook_id: 2, playbook_name: 'Reversal' }),
      // AIIO: 1 trade on Gap-and-Go
      tradeRow({ id: 6,  symbol: 'AIIO', net_pnl: 30,   playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      // BIGW: 1 trade with no playbook — excluded from playbook ranking
      tradeRow({ id: 7,  symbol: 'BIGW', net_pnl: 75,   playbook_id: null, playbook_name: null }),
      // Two more symbols with 1 trade each to test "top three" cutoff
      tradeRow({ id: 8,  symbol: 'EXTRA1', net_pnl: 10, playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 9,  symbol: 'EXTRA2', net_pnl: 5,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    // 6 distinct symbols total
    expect(result.symbolsTraded).toHaveLength(6)
    expect(result.symbolsTraded).toEqual(expect.arrayContaining(['HCTO', 'AMSS', 'AIIO', 'BIGW', 'EXTRA1', 'EXTRA2']))

    // Top 3 by trade count: HCTO (3), AMSS (2), then a 1-trade tie — any one of the four
    expect(result.topThreeSymbols).toHaveLength(3)
    expect(result.topThreeSymbols[0]).toEqual({ symbol: 'HCTO', tradeCount: 3 })
    expect(result.topThreeSymbols[1]).toEqual({ symbol: 'AMSS', tradeCount: 2 })
    expect(result.topThreeSymbols[2].tradeCount).toBe(1)

    // Most-used playbook: Gap-and-Go has 5 trades (HCTO x3 + AIIO + EXTRA1 + EXTRA2 = 6, wait — let me recount)
    // Gap-and-Go: ids 1, 2, 3, 6, 8, 9 → 6 trades. Wins: 1, 2, 6, 8, 9 (5 of 6); loss: 3
    // decided = 6 (no scratches); winRate = 5/6
    expect(result.mostUsedPlaybook).toEqual({
      playbook: 'Gap-and-Go',
      tradeCount: 6,
      winRate: 5 / 6,
    })
  })

  it('sums moneyLeftOnTable from exitDeltas and reports coverage against total trades', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, symbol: 'HCTO', net_pnl: 100 }),
      tradeRow({ id: 2, symbol: 'AMSS', net_pnl: 50 }),
      tradeRow({ id: 3, symbol: 'AIIO', net_pnl: 200 }),
    ]

    // Only 2 of 3 trades have intraday excursion data — partial coverage
    const exitDeltas: ExitDelta[] = [
      {
        trade_id: 1, date: '2026-05-15', symbol: 'HCTO', side: 'long',
        exit_count: 1, actual_avg_exit: 10.4, best_exit_price: 10.8,
        actual_net_pnl: 100, best_exit_net_pnl: 280, delta: 180,
      },
      {
        trade_id: 2, date: '2026-05-15', symbol: 'AMSS', side: 'long',
        exit_count: 1, actual_avg_exit: 5.2, best_exit_price: 5.5,
        actual_net_pnl: 50, best_exit_net_pnl: 130, delta: 80,
      },
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas,
    })

    expect(result.moneyLeftOnTable).toBeCloseTo(260, 5)  // 180 + 80
    expect(result.moneyLeftCoverage).toEqual({ withMfe: 2, total: 3 })
  })

  it('returns null moneyLeftOnTable + null coverage when no exitDeltas are available (awaiting intraday)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, symbol: 'HCTO', net_pnl: 100 }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    // Decision 3 in the v0.2.2 plan: 0/N coverage shows "awaiting intraday data"
    // empty state, NOT a misleading $0.00 sum.
    expect(result.moneyLeftOnTable).toBeNull()
    expect(result.moneyLeftCoverage).toBeNull()
  })
})
