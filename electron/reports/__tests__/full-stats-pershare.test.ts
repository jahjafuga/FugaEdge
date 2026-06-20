import { describe, it, expect, vi } from 'vitest'

// computeFullStats is PURE (reads fields off the trade objects, never opens the
// DB), but get.ts transitively imports ../db/database (better-sqlite3, whose
// native binary won't load under vitest). Stub the db module with a throwing
// openDatabase: if the stat computation ever reaches for the DB the test fails
// loudly. Mirrors electron/reports/__tests__/reports-breakdown.test.ts.
vi.mock('../../db/database', () => ({
  openDatabase: () => {
    throw new Error('openDatabase must not be called from computeFullStats unit tests')
  },
  getDbPath: () => ':memory:',
}))

import { computeFullStats } from '../get'

// Element type of computeFullStats' parameter — avoids exporting the internal
// TradeForReport type just for tests (same trick as reports-breakdown.test.ts).
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

describe('computeFullStats — per-share uses position size; volume stats stay both-leg', () => {
  it('balanced trades: avg_per_share_pnl = net / Σ max(legs), not / Σ both-leg', () => {
    const stats = computeFullStats([
      mk({ date: '2026-05-01', shares_bought: 100, shares_sold: 100, net_pnl: 200 }), // position 100
      mk({ date: '2026-05-01', shares_bought: 50, shares_sold: 50, net_pnl: 100 }), // position 50
    ])
    // 300 / position 150 = 2.0  (NOT 300 / both-leg 300 = 1.0)
    expect(stats.avg_per_share_pnl).toBeCloseTo(2.0, 5)
    // Volume stat is unchanged — both legs: (100+100) + (50+50) = 300.
    expect(stats.total_shares_traded).toBe(300)
  })

  it('unbalanced (partial) trip: denominator = max(legs); volume stats stay both-leg', () => {
    const stats = computeFullStats([
      // Partial short: bought 60 (partial cover), sold 100 (entry). max = 100; both-leg = 160.
      mk({ date: '2026-05-04', side: 'short', shares_bought: 60, shares_sold: 100, net_pnl: 120 }),
    ])
    // 120 / max(60,100)=100 = 1.2  (NOT 120 / both-leg 160 = 0.75)
    expect(stats.avg_per_share_pnl).toBeCloseTo(1.2, 5)
    // Both volume stats keep the both-leg sum (160) over one trading day.
    expect(stats.total_shares_traded).toBe(160)
    expect(stats.avg_daily_volume).toBeCloseTo(160, 5)
  })
})
