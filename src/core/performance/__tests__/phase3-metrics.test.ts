import { describe, it, expect } from 'vitest'
import { computeFullStats } from '@/core/performance/fullStats'
import { netPnlPctOfAccount } from '@/core/performance/metrics'

// Phase 3 (djsevans87) — the final two Compare metrics:
//   1. Avg Position Size ($) = mean over ALL trades of position_shares × entry_price
//      (position_shares = max legs; entry = entryPriceOf, the Phase-1/2 basis).
//      entry <= 0 / zero-position -> EXCLUDED (never $0). Pure trade data.
//   2. Net P&L (% of account size) = netPnL / account_size (a RATIO; ×100 at
//      display). account_size is the STATIC configured setting; when it's
//      null/unconfigured (or <= 0) the metric is null -> em-dash, NEVER computed
//      against the 25000 default (no-fabrication law).

type Trade = Parameters<typeof computeFullStats>[0][number]

function mk(over: Partial<Trade> = {}): Trade {
  return {
    date: '2026-05-01',
    side: 'long',
    open_time: '2026-05-01T13:30:00.000Z',
    close_time: '2026-05-01T13:35:00.000Z',
    avg_buy_price: 10,
    avg_sell_price: 11,
    shares_bought: 100,
    shares_sold: 100,
    net_pnl: 0,
    gross_pnl: 0,
    total_fees: 0,
    mae: null,
    mfe: null,
    ...over,
  }
}

describe('computeFullStats — Avg Position Size in $ (Phase 3)', () => {
  // position size = max(legs) × entry. Outcome-independent (all trades counted).
  //   T1 win:  100sh @ 10 -> $1000
  //   T2 loss: 200sh @  5 -> $1000
  //   T3 scratch: 50sh @ 20 -> $1000
  const FIXTURE = [
    mk({ net_pnl: 200, shares_bought: 100, shares_sold: 100, avg_buy_price: 10 }),
    mk({ net_pnl: -100, shares_bought: 200, shares_sold: 200, avg_buy_price: 5 }),
    mk({ net_pnl: 0, shares_bought: 50, shares_sold: 50, avg_buy_price: 20 }),
  ]

  it('mean of (position_shares × entry_price) over all trades (incl scratch)', () => {
    expect(computeFullStats(FIXTURE).avg_position_size).toBeCloseTo(1000, 6)
  })

  it('short uses avg_sell_price as entry', () => {
    // short: pos 100 × entry avg_sell_price 8 = $800 (avg_buy_price high, NOT used)
    const s = computeFullStats([
      mk({ side: 'short', net_pnl: 100, shares_bought: 100, shares_sold: 100, avg_sell_price: 8, avg_buy_price: 999 }),
    ])
    expect(s.avg_position_size).toBeCloseTo(800, 6)
  })

  it('entry_price 0 -> that trade EXCLUDED from the average (not $0)', () => {
    const s = computeFullStats([
      mk({ shares_bought: 100, shares_sold: 100, avg_buy_price: 10, avg_sell_price: 11 }), // $1000
      mk({ shares_bought: 100, shares_sold: 100, avg_buy_price: 0, avg_sell_price: 0 }), //   entry 0 -> excluded
    ])
    // if the zero-entry trade were folded in as $0, mean would be 500 — assert 1000
    expect(s.avg_position_size).toBeCloseTo(1000, 6)
  })

  it('single trade -> its position size; empty -> null', () => {
    expect(computeFullStats([mk({ shares_bought: 100, shares_sold: 100, avg_buy_price: 7 })]).avg_position_size)
      .toBeCloseTo(700, 6)
    expect(computeFullStats([]).avg_position_size).toBeNull()
  })
})

describe('computeFullStats — Avg Share Size (share count, djsevans87)', () => {
  // Avg Share Size = mean over trades of position_shares (max legs) — the SAME
  // per-trade share basis as Avg Position Size, minus the × entry_price (and so
  // minus the entry>0 guard: a pure count doesn't depend on price). Zero-position
  // rows (max legs == 0) are excluded; outcome-independent; null when none qualify.
  it('mean of position_shares (max legs) over all trades, incl scratch', () => {
    // legs 100, 200, 50 -> mean 116.6667 (distinct from the $ version)
    const s = computeFullStats([
      mk({ net_pnl: 200, shares_bought: 100, shares_sold: 100 }),
      mk({ net_pnl: -100, shares_bought: 200, shares_sold: 200 }),
      mk({ net_pnl: 0, shares_bought: 50, shares_sold: 50 }),
    ])
    expect(s.avg_share_size).toBeCloseTo((100 + 200 + 50) / 3, 6)
  })

  it('uses max(legs) on unequal legs (side-independent)', () => {
    // bought 100, sold 80 -> position_shares = max = 100
    expect(computeFullStats([mk({ shares_bought: 100, shares_sold: 80 })]).avg_share_size)
      .toBeCloseTo(100, 6)
  })

  it('counts a pos>0 trade even when entry price is 0 (NOT excluded — pure count)', () => {
    // The $ size version EXCLUDES the entry-0 row; the share count INCLUDES it.
    const s = computeFullStats([
      mk({ shares_bought: 100, shares_sold: 100, avg_buy_price: 10, avg_sell_price: 11 }),
      mk({ shares_bought: 100, shares_sold: 100, avg_buy_price: 0, avg_sell_price: 0 }),
    ])
    expect(s.avg_share_size).toBeCloseTo(100, 6)    // (100 + 100) / 2 — both counted
    expect(s.avg_position_size).toBeCloseTo(1000, 6) // entry-0 row dropped here
  })

  it('zero-share row excluded (sane); all-zero -> null', () => {
    const mixed = computeFullStats([
      mk({ shares_bought: 100, shares_sold: 100 }),
      mk({ shares_bought: 0, shares_sold: 0 }),
    ])
    expect(mixed.avg_share_size).toBeCloseTo(100, 6) // not 50
    expect(computeFullStats([mk({ shares_bought: 0, shares_sold: 0 })]).avg_share_size).toBeNull()
  })

  it('single trade -> its share size; empty -> null (em-dash, never 0/NaN)', () => {
    expect(computeFullStats([mk({ shares_bought: 300, shares_sold: 300 })]).avg_share_size)
      .toBeCloseTo(300, 6)
    expect(computeFullStats([]).avg_share_size).toBeNull()
  })
})

describe('netPnlPctOfAccount — Net P&L as a ratio of static account size (Phase 3)', () => {
  it('real account size -> netPnL / account_size (ratio; ×100 at display)', () => {
    expect(netPnlPctOfAccount(500, 25000)).toBeCloseTo(0.02, 10) // +2%
    expect(netPnlPctOfAccount(-1000, 25000)).toBeCloseTo(-0.04, 10) // -4%
    expect(netPnlPctOfAccount(0, 25000)).toBe(0)
  })

  it('account_size null (UNCONFIGURED) -> null (em-dash, NOT against any default)', () => {
    expect(netPnlPctOfAccount(500, null)).toBeNull()
  })

  it('account_size 0 or negative -> null (divide-by-zero guard)', () => {
    expect(netPnlPctOfAccount(500, 0)).toBeNull()
    expect(netPnlPctOfAccount(500, -100)).toBeNull()
  })
})
