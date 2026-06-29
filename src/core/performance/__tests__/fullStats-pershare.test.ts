import { describe, it, expect } from 'vitest'
import { computeFullStats } from '@/core/performance/fullStats'

// Phase 1 of the Compare-tab metrics (beta-tester djsevans87) — per-share gain /
// loss / extremes added to computeFullStats alongside the existing pooled
// avg_per_share_pnl. computeFullStats is pure (no DB import), so this tests it
// directly from src/core — no db mock needed (unlike the electron/reports tests
// that import it via ../get).
//
// Conventions under test (LOCKED):
//   per-share value = net_pnl / max(shares_bought, shares_sold)  (position size)
//   avg gain/loss   = per-TRADE mean over winners/losers (NOT pooled), matching
//                     avg_winner/avg_loser semantics
//   classification  = isWin/isLoss (scratch |net| <= SCRATCH_EPSILON=0.005 is
//                     excluded from BOTH sides)
//   empty side      = null (em-dash downstream), never 0/NaN

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

describe('computeFullStats — per-share gain/loss/extremes (Phase 1)', () => {
  // Known per-share values: +2.00, +1.00 (winners), -1.00, -0.50 (losers),
  // plus one scratch (net 0) that must be excluded from both sides.
  const FIXTURE = [
    mk({ shares_bought: 100, shares_sold: 100, net_pnl: 200 }), // win  +2.00/sh
    mk({ shares_bought: 50, shares_sold: 50, net_pnl: 50 }), //    win  +1.00/sh
    mk({ shares_bought: 100, shares_sold: 100, net_pnl: -100 }), // loss -1.00/sh
    mk({ shares_bought: 200, shares_sold: 200, net_pnl: -100 }), // loss -0.50/sh
    mk({ shares_bought: 10, shares_sold: 10, net_pnl: 0 }), //     scratch (excluded)
  ]

  it('avg per-share gain = per-trade mean over winners (+2.00, +1.00 -> +1.50)', () => {
    expect(computeFullStats(FIXTURE).avg_per_share_gain).toBeCloseTo(1.5, 10)
  })
  it('avg per-share loss = per-trade mean over losers (-1.00, -0.50 -> -0.75)', () => {
    expect(computeFullStats(FIXTURE).avg_per_share_loss).toBeCloseTo(-0.75, 10)
  })
  it('max per-share win = highest winner per-share (+2.00)', () => {
    expect(computeFullStats(FIXTURE).max_per_share_win).toBeCloseTo(2.0, 10)
  })
  it('max per-share loss = lowest (most negative) loser per-share (-1.00)', () => {
    expect(computeFullStats(FIXTURE).max_per_share_loss).toBeCloseTo(-1.0, 10)
  })

  it('all winners -> loss-side metrics null (no fabrication)', () => {
    const s = computeFullStats([
      mk({ net_pnl: 100, shares_bought: 100, shares_sold: 100 }), // +1.00/sh
      mk({ net_pnl: 60, shares_bought: 100, shares_sold: 100 }), //  +0.60/sh
    ])
    expect(s.avg_per_share_loss).toBeNull()
    expect(s.max_per_share_loss).toBeNull()
    expect(s.avg_per_share_gain).toBeCloseTo(0.8, 10)
    expect(s.max_per_share_win).toBeCloseTo(1.0, 10)
  })

  it('all losers -> win-side metrics null', () => {
    const s = computeFullStats([
      mk({ net_pnl: -100, shares_bought: 100, shares_sold: 100 }), // -1.00/sh
      mk({ net_pnl: -40, shares_bought: 100, shares_sold: 100 }), //  -0.40/sh
    ])
    expect(s.avg_per_share_gain).toBeNull()
    expect(s.max_per_share_win).toBeNull()
    expect(s.avg_per_share_loss).toBeCloseTo(-0.7, 10)
    expect(s.max_per_share_loss).toBeCloseTo(-1.0, 10)
  })

  it('single winning trade -> gain = its per-share, loss-side null', () => {
    const s = computeFullStats([mk({ net_pnl: 150, shares_bought: 100, shares_sold: 100 })])
    expect(s.avg_per_share_gain).toBeCloseTo(1.5, 10)
    expect(s.max_per_share_win).toBeCloseTo(1.5, 10)
    expect(s.avg_per_share_loss).toBeNull()
    expect(s.max_per_share_loss).toBeNull()
  })

  it('a breakeven (scratch) trade is excluded from BOTH sides', () => {
    const s = computeFullStats([
      mk({ net_pnl: 80, shares_bought: 100, shares_sold: 100 }), // win +0.80/sh
      mk({ net_pnl: 0, shares_bought: 100, shares_sold: 100 }), //  scratch (net 0)
    ])
    expect(s.avg_per_share_gain).toBeCloseTo(0.8, 10)
    expect(s.max_per_share_win).toBeCloseTo(0.8, 10)
    expect(s.avg_per_share_loss).toBeNull() // a scratch is NOT a loss
    expect(s.max_per_share_loss).toBeNull()
  })

  it('empty -> all four null', () => {
    const s = computeFullStats([])
    expect(s.avg_per_share_gain).toBeNull()
    expect(s.avg_per_share_loss).toBeNull()
    expect(s.max_per_share_win).toBeNull()
    expect(s.max_per_share_loss).toBeNull()
  })
})
