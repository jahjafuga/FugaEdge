import { describe, it, expect } from 'vitest'
import { computeFullStats } from '@/core/performance/fullStats'

// Phase 2 of the Compare-tab metrics (djsevans87) — price-move % per trade.
// LOCKED denominator: per-trade % = per_share_$ / entry_price, where
//   per_share_$ = net_pnl / max(shares_bought, shares_sold)   (Phase-1 basis)
//   entry_price = entryPriceOf (avg_buy_price long / avg_sell_price short) —
//                 the SAME entry basis avg_mae_pct / avg_mfe_pct use.
// Stored as a RATIO (fraction); the ×100 is applied at display by CompareView's
// 'pct' kind (like greenDayPct / winRate / scratch_pct). So a 20% move is 0.20.
//
// Per-trade means over winner/loser subsets (mirroring avg_winner/avg_loser);
// APPT% is the mean over winners+losers. Scratch (|net| <= 0.005) excluded.
// entry <= 0 (or position 0) -> that trade's % is null and it's EXCLUDED (never 0%).
// Empty side -> null -> em-dash downstream, never 0/NaN.

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

describe('computeFullStats — price-move % per trade (Phase 2)', () => {
  // Known per-share $ and entry prices -> known ratios:
  //   T1 win:  +2.00/sh @ entry 10 -> +0.20 (20%)
  //   T2 win:  +0.50/sh @ entry 5  -> +0.10 (10%)
  //   T3 loss: -1.00/sh @ entry 10 -> -0.10 (-10%)
  //   T4 loss: -0.30/sh @ entry 6  -> -0.05 (-5%)
  //   T5 scratch (net 0) -> excluded
  const FIXTURE = [
    mk({ net_pnl: 200, shares_bought: 100, shares_sold: 100, avg_buy_price: 10 }),
    mk({ net_pnl: 50, shares_bought: 100, shares_sold: 100, avg_buy_price: 5 }),
    mk({ net_pnl: -100, shares_bought: 100, shares_sold: 100, avg_buy_price: 10 }),
    mk({ net_pnl: -30, shares_bought: 100, shares_sold: 100, avg_buy_price: 6 }),
    mk({ net_pnl: 0, shares_bought: 100, shares_sold: 100, avg_buy_price: 10 }),
  ]

  it('APPT % = per-trade mean over winners+losers (scratch excluded)', () => {
    // (0.20 + 0.10 - 0.10 - 0.05) / 4 = 0.0375
    expect(computeFullStats(FIXTURE).appt_pct).toBeCloseTo(0.0375, 10)
  })
  it('Avg Win % = per-trade mean over winners (+0.20, +0.10 -> +0.15)', () => {
    expect(computeFullStats(FIXTURE).avg_win_pct).toBeCloseTo(0.15, 10)
  })
  it('Avg Loss % = per-trade mean over losers (-0.10, -0.05 -> -0.075)', () => {
    expect(computeFullStats(FIXTURE).avg_loss_pct).toBeCloseTo(-0.075, 10)
  })
  it('Max Win % = highest winner ratio (+0.20)', () => {
    expect(computeFullStats(FIXTURE).max_win_pct).toBeCloseTo(0.2, 10)
  })
  it('Max Loss % = lowest (most negative) loser ratio (-0.10)', () => {
    expect(computeFullStats(FIXTURE).max_loss_pct).toBeCloseTo(-0.1, 10)
  })

  it('short uses avg_sell_price as entry', () => {
    // short: per_share = net/pos = 100/100 = +1.00; entry = avg_sell_price = 20
    // -> ratio +0.05 (5%). (avg_buy_price set high to prove it is NOT used.)
    const s = computeFullStats([
      mk({ side: 'short', net_pnl: 100, shares_bought: 100, shares_sold: 100, avg_sell_price: 20, avg_buy_price: 999 }),
    ])
    expect(s.avg_win_pct).toBeCloseTo(0.05, 10)
    expect(s.max_win_pct).toBeCloseTo(0.05, 10)
  })

  it('all winners -> loss-side % null (no fabrication)', () => {
    const s = computeFullStats([
      mk({ net_pnl: 200, avg_buy_price: 10 }), // +0.20
      mk({ net_pnl: 50, avg_buy_price: 5 }), //   +0.10
    ])
    expect(s.avg_loss_pct).toBeNull()
    expect(s.max_loss_pct).toBeNull()
    expect(s.avg_win_pct).toBeCloseTo(0.15, 10)
    expect(s.appt_pct).toBeCloseTo(0.15, 10) // winners only -> APPT% == avg win %
  })

  it('all losers -> win-side % null', () => {
    const s = computeFullStats([
      mk({ net_pnl: -100, avg_buy_price: 10 }), // -0.10
      mk({ net_pnl: -30, avg_buy_price: 6 }), //   -0.05
    ])
    expect(s.avg_win_pct).toBeNull()
    expect(s.max_win_pct).toBeNull()
    expect(s.avg_loss_pct).toBeCloseTo(-0.075, 10)
    expect(s.max_loss_pct).toBeCloseTo(-0.1, 10)
  })

  it('entry_price 0 -> that trade EXCLUDED from % (not folded in as 0%)', () => {
    const s = computeFullStats([
      mk({ net_pnl: 200, avg_buy_price: 10, avg_sell_price: 11 }), // +0.20 (valid)
      mk({ net_pnl: 200, avg_buy_price: 0, avg_sell_price: 0 }), //   entry 0 -> excluded
    ])
    // if the zero-entry trade were treated as 0%, avg would be 0.10 — assert 0.20
    expect(s.avg_win_pct).toBeCloseTo(0.2, 10)
    expect(s.max_win_pct).toBeCloseTo(0.2, 10)
  })

  it('breakeven (scratch) excluded from both sides', () => {
    const s = computeFullStats([
      mk({ net_pnl: 200, avg_buy_price: 10 }), // win +0.20
      mk({ net_pnl: 0, avg_buy_price: 10 }), //   scratch
    ])
    expect(s.avg_win_pct).toBeCloseTo(0.2, 10)
    expect(s.avg_loss_pct).toBeNull()
    expect(s.appt_pct).toBeCloseTo(0.2, 10) // scratch not in the APPT% population
  })

  it('single winning trade -> win % = its ratio, loss-side null', () => {
    const s = computeFullStats([mk({ net_pnl: 150, shares_bought: 100, shares_sold: 100, avg_buy_price: 10 })])
    expect(s.avg_win_pct).toBeCloseTo(0.15, 10) // 1.50/sh / 10
    expect(s.max_win_pct).toBeCloseTo(0.15, 10)
    expect(s.avg_loss_pct).toBeNull()
    expect(s.max_loss_pct).toBeNull()
  })

  it('empty -> all five null', () => {
    const s = computeFullStats([])
    expect(s.appt_pct).toBeNull()
    expect(s.avg_win_pct).toBeNull()
    expect(s.avg_loss_pct).toBeNull()
    expect(s.max_win_pct).toBeNull()
    expect(s.max_loss_pct).toBeNull()
  })
})
