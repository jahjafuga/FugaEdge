import { describe, it, expect, vi } from 'vitest'

// Characterization test (safety net for the computeFullStats extraction).
// Mirrors full-stats-pershare.test.ts's setup: stub the db module so get.ts's
// transitive better-sqlite3 import doesn't load its native binary under vitest.
vi.mock('../../db/database', () => ({
  openDatabase: () => {
    throw new Error('openDatabase must not be called from computeFullStats unit tests')
  },
  getDbPath: () => ':memory:',
}))

import { computeFullStats } from '../get'

type Trade = Parameters<typeof computeFullStats>[0][number]

function mk(over: Partial<Trade> = {}): Trade {
  return {
    date: '2026-05-01',
    symbol: 'AAA',
    side: 'long',
    open_time: '2026-05-01T13:30:00.000Z',
    close_time: '2026-05-01T14:00:00.000Z',
    avg_buy_price: 10,
    avg_sell_price: 11,
    shares_bought: 100,
    shares_sold: 100,
    net_pnl: 0,
    gross_pnl: 0,
    total_fees: 0,
    mae: null,
    mfe: null,
    country: 'US',
    region: 'North America',
    sector: null,
    industry: null,
    ...over,
  } as Trade
}

// Deterministic 7-trade fixture across 4 trading days, ordered chronologically
// by open_time so streaks are unambiguous. Designed so EVERY FullStats field is
// non-trivial:
//   winners  T1,T2,T6 (net > +2)   losers T3,T4,T7 (net < -2)   scratch T5 (|net| <= 2)
//   win streak T1,T2 = 2 ; loss streak T3,T4 = 2 (T5 scratch breaks it, T7 isolated)
//   mae/mfe populated on all but T5 -> excursion_coverage = 6 (of 7)
//   varied hold times across win/loss/scratch buckets
//   varied shares/prices for per-share + volume stats
const FIXTURE: Trade[] = [
  // Day 1 — two wins (start the win streak)
  mk({ date: '2026-05-01', open_time: '2026-05-01T13:30:00.000Z', close_time: '2026-05-01T14:00:00.000Z',
       avg_buy_price: 10, avg_sell_price: 12, shares_bought: 100, shares_sold: 100,
       gross_pnl: 200, total_fees: 4, net_pnl: 196, mae: 0.10, mfe: 0.50 }),            // win, hold 1800s
  mk({ date: '2026-05-01', open_time: '2026-05-01T14:30:00.000Z', close_time: '2026-05-01T14:50:00.000Z',
       avg_buy_price: 20, avg_sell_price: 21, shares_bought: 50, shares_sold: 50,
       gross_pnl: 50, total_fees: 2, net_pnl: 48, mae: 0.20, mfe: 0.40 }),              // win, hold 1200s
  // Day 2 — two losses (start the loss streak)
  mk({ date: '2026-05-04', open_time: '2026-05-04T13:30:00.000Z', close_time: '2026-05-04T13:40:00.000Z',
       avg_buy_price: 8, avg_sell_price: 7.5, shares_bought: 200, shares_sold: 200,
       gross_pnl: -100, total_fees: 3, net_pnl: -103, mae: 0.30, mfe: 0.15 }),          // loss, hold 600s
  mk({ date: '2026-05-04', open_time: '2026-05-04T14:00:00.000Z', close_time: '2026-05-04T14:30:00.000Z',
       avg_buy_price: 15, avg_sell_price: 14.7, shares_bought: 100, shares_sold: 100,
       gross_pnl: -30, total_fees: 2, net_pnl: -32, mae: 0.25, mfe: 0.20 }),            // loss, hold 1800s
  // Day 3 — a scratch (breaks the loss streak; null excursions) then a win.
  // net_pnl == 0 is a true scratch (|net| <= SCRATCH_EPSILON = 0.005).
  mk({ date: '2026-05-05', open_time: '2026-05-05T13:30:00.000Z', close_time: '2026-05-05T13:35:00.000Z',
       avg_buy_price: 5, avg_sell_price: 5, shares_bought: 50, shares_sold: 50,
       gross_pnl: 0, total_fees: 0, net_pnl: 0, mae: null, mfe: null }),                // scratch, hold 300s
  mk({ date: '2026-05-05', open_time: '2026-05-05T14:00:00.000Z', close_time: '2026-05-05T15:00:00.000Z',
       avg_buy_price: 12, avg_sell_price: 12.7, shares_bought: 100, shares_sold: 100,
       gross_pnl: 70, total_fees: 3, net_pnl: 67, mae: 0.05, mfe: 0.30 }),              // win, hold 3600s
  // Day 4 — one loss
  mk({ date: '2026-05-06', open_time: '2026-05-06T13:30:00.000Z', close_time: '2026-05-06T13:50:00.000Z',
       avg_buy_price: 9, avg_sell_price: 8.5, shares_bought: 150, shares_sold: 150,
       gross_pnl: -75, total_fees: 2, net_pnl: -77, mae: 0.40, mfe: 0.10 }),            // loss, hold 1200s
]

// Characterization: every FullStats field pinned to the CURRENT output of the
// unmodified computeFullStats (captured by running it on FIXTURE — not hand-
// computed). The next beat moves computeFullStats to src/core; re-running this
// test there must produce these exact values to prove the move is behaviour-
// preserving. Each field gets its own assertion line — no snapshot/toMatchObject
// shortcut, so no field can silently slip unpinned.
describe('computeFullStats — characterization (extraction safety net)', () => {
  const stats = computeFullStats(FIXTURE)

  it('P&L totals', () => {
    expect(stats.total_net_pnl).toBe(99)
    expect(stats.total_gross_pnl).toBe(115)
    expect(stats.total_fees).toBe(16)
    expect(stats.total_commissions).toBeNull() // always null (not in import)
  })

  it('P&L averages', () => {
    expect(stats.avg_trade_pnl).toBeCloseTo(14.142857142857142, 5)
    expect(stats.avg_daily_pnl).toBeCloseTo(24.75, 5)
    expect(stats.avg_winner).toBeCloseTo(103.66666666666667, 5)
    expect(stats.avg_loser).toBeCloseTo(-70.66666666666667, 5)
    expect(stats.avg_per_share_pnl).toBeCloseTo(0.132, 5)
    expect(stats.std_dev_pnl).toBeCloseTo(101.13592927578304, 5)
    expect(stats.profit_factor).toBeCloseTo(1.4669811320754718, 5)
  })

  it('volume', () => {
    expect(stats.total_shares_traded).toBe(1500)
    expect(stats.avg_daily_volume).toBeCloseTo(375, 5)
  })

  it('counts', () => {
    expect(stats.trade_count).toBe(7)
    expect(stats.winners).toBe(3)
    expect(stats.losers).toBe(3)
    expect(stats.scratches).toBe(1)
    expect(stats.scratch_pct).toBeCloseTo(0.14285714285714285, 5)
    expect(stats.trading_days).toBe(4)
  })

  it('hold time (seconds)', () => {
    expect(stats.avg_hold_seconds).toBeCloseTo(1500, 5)
    expect(stats.avg_hold_seconds_winners).toBeCloseTo(2200, 5)
    expect(stats.avg_hold_seconds_losers).toBeCloseTo(1200, 5)
    expect(stats.avg_hold_seconds_scratches).toBeCloseTo(300, 5)
  })

  it('streaks', () => {
    expect(stats.max_consecutive_wins).toBe(2)
    expect(stats.max_consecutive_losses).toBe(2)
  })

  it('system quality (SQN / Kelly / K-Ratio / random chance)', () => {
    expect(stats.kelly_pct).toBeCloseTo(15.916398713826368, 5)
    expect(stats.sqn).toBeCloseTo(0.3699820933654419, 5)
    expect(stats.k_ratio).toBeCloseTo(-0.7042214239214003, 5)
    expect(stats.random_chance_pct).toBeCloseTo(0.986496174536129, 5)
  })

  it('excursion (MAE / MFE)', () => {
    expect(stats.avg_mae).toBeCloseTo(0.2166666666666667, 5)
    expect(stats.avg_mfe).toBeCloseTo(0.275, 5)
    expect(stats.avg_mae_dollars).toBeCloseTo(0.2166666666666667, 5)
    expect(stats.avg_mfe_dollars).toBeCloseTo(0.275, 5)
    expect(stats.avg_mae_pct).toBeCloseTo(2.0462962962962963, 5)
    expect(stats.avg_mfe_pct).toBeCloseTo(2.303240740740741, 5)
    expect(stats.excursion_coverage).toBe(6)
  })
})
