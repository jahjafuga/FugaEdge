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
    expect(result.symbolBreakdown).toEqual([])
    expect(result.totalShares).toBe(0)
    expect(result.totalDollarVolume).toBe(0)
    expect(result.mostUsedPlaybook).toBeNull()
    expect(result.moneyLeftOnTable).toBeNull()
    expect(result.moneyLeftCoverage).toBeNull()

    // v0.2.2 Day 2 — Performance tab additions. Empty-day defaults.
    expect(result.avgTradePnl).toBeNull()
    expect(result.avgPerShareGainLoss).toBeNull()
    expect(result.profitFactor).toBeNull()
    expect(result.maxConsecutiveWins).toBe(0)
    expect(result.maxConsecutiveLosses).toBe(0)
    expect(result.avgHoldSeconds).toBeNull()
    expect(result.avgHoldSecondsWinners).toBeNull()
    expect(result.avgHoldSecondsLosers).toBeNull()
    expect(result.avgHoldSecondsScratches).toBeNull()
    expect(result.stdDevPnl).toBeNull()
    expect(result.avgMfeDollars).toBeNull()
    expect(result.avgMaeDollars).toBeNull()
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

  it('builds the per-symbol breakdown (count + net P&L, sorted by net P&L desc) and most-used playbook', () => {
    const trades: TradeListRow[] = [
      // HCTO: 3 trades on the Gap-and-Go playbook (2W, 1L) → net 250
      tradeRow({ id: 1,  symbol: 'HCTO', net_pnl: 100,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 2,  symbol: 'HCTO', net_pnl: 200,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 3,  symbol: 'HCTO', net_pnl: -50,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      // AMSS: 2 trades on Reversal → net 30
      tradeRow({ id: 4,  symbol: 'AMSS', net_pnl: 50,   playbook_id: 2, playbook_name: 'Reversal' }),
      tradeRow({ id: 5,  symbol: 'AMSS', net_pnl: -20,  playbook_id: 2, playbook_name: 'Reversal' }),
      // AIIO: 1 trade → net 30 (ties AMSS on P&L; AMSS wins tiebreak on trade count)
      tradeRow({ id: 6,  symbol: 'AIIO', net_pnl: 30,   playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      // BIGW: 1 trade, no playbook → net 75
      tradeRow({ id: 7,  symbol: 'BIGW', net_pnl: 75,   playbook_id: null, playbook_name: null }),
      tradeRow({ id: 8,  symbol: 'EXTRA1', net_pnl: 10, playbook_id: 1, playbook_name: 'Gap-and-Go' }),
      tradeRow({ id: 9,  symbol: 'EXTRA2', net_pnl: 5,  playbook_id: 1, playbook_name: 'Gap-and-Go' }),
    ]

    const result = computeDayMetrics({
      date: '2026-05-15',
      trades,
      exitDeltas: [],
    })

    // All 6 symbols, sorted by net P&L desc. The 30-tie (AMSS vs AIIO) breaks
    // on trade count desc → AMSS (2 trades) before AIIO (1 trade).
    expect(result.symbolBreakdown).toEqual([
      { symbol: 'HCTO', tradeCount: 3, netPnl: 250 },
      { symbol: 'BIGW', tradeCount: 1, netPnl: 75 },
      { symbol: 'AMSS', tradeCount: 2, netPnl: 30 },
      { symbol: 'AIIO', tradeCount: 1, netPnl: 30 },
      { symbol: 'EXTRA1', tradeCount: 1, netPnl: 10 },
      { symbol: 'EXTRA2', tradeCount: 1, netPnl: 5 },
    ])

    // Most-used playbook: Gap-and-Go has 6 trades (ids 1,2,3,6,8,9).
    // Wins: 1,2,6,8,9 (5); loss: 3. decided = 6, no scratches; winRate = 5/6.
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

  // ── v0.2.2 Day 2 — Performance tab metrics ──────────────────────────────

  it('computes avgTradePnl (netPnl ÷ tradeCount) and avgPerShareGainLoss (netPnl ÷ totalShares)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 120, shares_bought: 100, shares_sold: 100 }),
      tradeRow({ id: 2, net_pnl: 80,  shares_bought: 100, shares_sold: 100 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    // Total: netPnl 200, tradeCount 2, totalShares 400 (2 × (100+100))
    expect(result.avgTradePnl).toBeCloseTo(100, 5)     // 200 / 2
    expect(result.avgPerShareGainLoss).toBeCloseTo(0.5, 5)  // 200 / 400
  })

  it('computes profitFactor as Σ positive net_pnl ÷ |Σ negative net_pnl|', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 100 }),
      tradeRow({ id: 2, net_pnl: 200 }),
      tradeRow({ id: 3, net_pnl: -50 }),
      tradeRow({ id: 4, net_pnl: -100 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    // Σ positives = 300, |Σ negatives| = 150 → 2.0
    expect(result.profitFactor).toBeCloseTo(2.0, 5)
  })

  it('returns Infinity profitFactor for a winning-only day (no losers — real outcome, not error)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 50 }),
      tradeRow({ id: 2, net_pnl: 100 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.profitFactor).toBe(Infinity)
  })

  it('returns null profitFactor when no decided trades (all scratches)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 0 }),
      tradeRow({ id: 2, net_pnl: 0 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.profitFactor).toBeNull()
  })

  it('counts max consecutive wins and losses chronologically; scratches break both streaks', () => {
    // Chronological pattern: W W L W W W S W L
    // Walking the streaks (scratches reset BOTH per addendum convention):
    //   W(1) W(2) L(1,maxL=1) W(1) W(2) W(3,maxW=3) S(reset both) W(1) L(1)
    // → maxConsecutiveWins = 3, maxConsecutiveLosses = 1
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, open_time: '2026-05-15T09:30:00', net_pnl: 50 }),    // W
      tradeRow({ id: 2, open_time: '2026-05-15T09:35:00', net_pnl: 75 }),    // W
      tradeRow({ id: 3, open_time: '2026-05-15T09:40:00', net_pnl: -30 }),   // L
      tradeRow({ id: 4, open_time: '2026-05-15T09:45:00', net_pnl: 60 }),    // W
      tradeRow({ id: 5, open_time: '2026-05-15T09:50:00', net_pnl: 40 }),    // W
      tradeRow({ id: 6, open_time: '2026-05-15T09:55:00', net_pnl: 90 }),    // W
      tradeRow({ id: 7, open_time: '2026-05-15T10:00:00', net_pnl: 0 }),     // S
      tradeRow({ id: 8, open_time: '2026-05-15T10:05:00', net_pnl: 20 }),    // W
      tradeRow({ id: 9, open_time: '2026-05-15T10:10:00', net_pnl: -10 }),   // L
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.maxConsecutiveWins).toBe(3)
    expect(result.maxConsecutiveLosses).toBe(1)
  })

  it('averages hold time overall and per outcome category (winners / losers / scratches)', () => {
    const trades: TradeListRow[] = [
      // Winner held 15 min = 900s
      tradeRow({ id: 1, open_time: '2026-05-15T09:30:00', close_time: '2026-05-15T09:45:00', net_pnl: 100 }),
      // Winner held 30 min = 1800s → avg winner = (900+1800)/2 = 1350
      tradeRow({ id: 2, open_time: '2026-05-15T09:30:00', close_time: '2026-05-15T10:00:00', net_pnl: 200 }),
      // Loser held 5 min = 300s → avg loser = 300
      tradeRow({ id: 3, open_time: '2026-05-15T09:30:00', close_time: '2026-05-15T09:35:00', net_pnl: -50 }),
      // Scratch held 1 min = 60s → avg scratch = 60
      tradeRow({ id: 4, open_time: '2026-05-15T09:30:00', close_time: '2026-05-15T09:31:00', net_pnl: 0 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    // Overall avg: (900+1800+300+60)/4 = 765s
    expect(result.avgHoldSeconds).toBeCloseTo(765, 5)
    expect(result.avgHoldSecondsWinners).toBeCloseTo(1350, 5)
    expect(result.avgHoldSecondsLosers).toBeCloseTo(300, 5)
    expect(result.avgHoldSecondsScratches).toBeCloseTo(60, 5)
  })

  it('computes sample std dev of net_pnl (n−1 denominator) for n≥3', () => {
    // net_pnl [10, 20, 30] → mean 20, Σ(x−mean)² = 200, variance = 200/2 = 100,
    // sample std dev = √100 = 10.
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 10 }),
      tradeRow({ id: 2, net_pnl: 20 }),
      tradeRow({ id: 3, net_pnl: 30 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.stdDevPnl).toBeCloseTo(10, 5)
  })

  it('returns null stdDevPnl when tradeCount < 3 (sample sd is noise at small N)', () => {
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 100 }),
      tradeRow({ id: 2, net_pnl: -50 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.stdDevPnl).toBeNull()
  })

  it('ships avgMfeDollars / avgMaeDollars as null for non-empty days until Day 5 wires intraday', () => {
    // Day 2 contract per the addendum: the field exists but the value stays
    // null. Day 5 wires intraday-bar excursion data and these light up.
    // Day 2 tests lock the null contract; if they go non-null without the
    // wiring landing first, something silently filled the field.
    const trades: TradeListRow[] = [
      tradeRow({ id: 1, net_pnl: 100 }),
      tradeRow({ id: 2, net_pnl: -50 }),
      tradeRow({ id: 3, net_pnl: 75 }),
    ]

    const result = computeDayMetrics({ date: '2026-05-15', trades, exitDeltas: [] })

    expect(result.avgMfeDollars).toBeNull()
    expect(result.avgMaeDollars).toBeNull()
  })
})
