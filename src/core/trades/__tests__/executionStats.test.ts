import { describe, expect, it } from 'vitest'
import { blendedFillAvg, computeExecutionStats } from '../executionStats'

type Fill = { side: 'B' | 'S'; price: number; time: string }
const fill = (side: 'B' | 'S', price: number, time: string): Fill => ({ side, price, time })

// Minimal structural trade input — only the fields computeExecutionStats reads
// (side, executions, avg_buy_price, avg_sell_price). A full TradeListRow
// satisfies this structurally; the test passes the bare minimum.
const trade = (
  over: Partial<{
    side: 'long' | 'short'
    executions: Fill[]
    avg_buy_price: number
    avg_sell_price: number
  }> = {},
) => ({
  side: 'long' as 'long' | 'short',
  executions: [] as Fill[],
  avg_buy_price: 0,
  avg_sell_price: 0,
  ...over,
})

describe('computeExecutionStats', () => {
  it('long: firstEntry is the earliest BUY fill, lastExit the latest SELL fill (not the avg)', () => {
    const t = trade({
      side: 'long',
      // avgs deliberately differ from every single fill price, to prove the
      // bookends return the FILL price, never the average.
      avg_buy_price: 10.1,
      avg_sell_price: 10.4,
      executions: [
        fill('B', 10.0, '2026-05-11T13:30:05Z'), // earliest buy
        fill('B', 10.2, '2026-05-11T13:31:00Z'),
        fill('S', 10.5, '2026-05-11T13:40:00Z'),
        fill('S', 10.3, '2026-05-11T13:45:00Z'), // latest sell
      ],
    })
    const r = computeExecutionStats(t)
    expect(r.firstEntry).toEqual({ price: 10.0, time: '2026-05-11T13:30:05Z' })
    expect(r.lastExit).toEqual({ price: 10.3, time: '2026-05-11T13:45:00Z' })
  })

  it('short: entry side is SELL, exit side is BUY; firstEntry = earliest sell, lastExit = latest buy', () => {
    const t = trade({
      side: 'short',
      avg_sell_price: 10.0,
      avg_buy_price: 9.51,
      executions: [
        fill('S', 10.0, '2026-05-11T13:30:00Z'), // earliest sell (entry)
        fill('S', 9.9, '2026-05-11T13:31:00Z'),
        fill('B', 9.6, '2026-05-11T13:40:00Z'),
        fill('B', 9.51, '2026-05-11T13:45:00Z'), // latest buy (exit)
      ],
    })
    const r = computeExecutionStats(t)
    expect(r.firstEntry).toEqual({ price: 10.0, time: '2026-05-11T13:30:00Z' })
    expect(r.lastExit).toEqual({ price: 9.51, time: '2026-05-11T13:45:00Z' })
  })

  it('priceMovePct (long): bought 10.00, sold 9.51 → -4.90%', () => {
    const t = trade({ side: 'long', avg_buy_price: 10.0, avg_sell_price: 9.51 })
    expect(computeExecutionStats(t).priceMovePct).toBeCloseTo(-4.9, 5)
  })

  it('priceMovePct (short): sold 10.00, covered 9.51 → +4.90% (covering lower is positive)', () => {
    const t = trade({ side: 'short', avg_sell_price: 10.0, avg_buy_price: 9.51 })
    expect(computeExecutionStats(t).priceMovePct).toBeCloseTo(4.9, 5)
  })

  it('open trade (no exit-side fills): lastExit / priceMovePct / avgExit null (avg_sell_price 0), avgEntry real', () => {
    // An open trade stores the unfilled side's avg as 0 (build-round-trips.ts:226),
    // so Price Move AND Avg Exit must be null (em-dash) — never a fabricated
    // ±100% move or a fake "0.00" exit. Avg Entry stays the real buy average.
    const t = trade({
      side: 'long',
      avg_buy_price: 10.0,
      avg_sell_price: 0,
      executions: [fill('B', 10.0, '2026-05-11T13:30:00Z')],
    })
    const r = computeExecutionStats(t)
    expect(r.firstEntry).toEqual({ price: 10.0, time: '2026-05-11T13:30:00Z' })
    expect(r.lastExit).toBeNull()
    expect(r.priceMovePct).toBeNull()
    expect(r.avgEntry).toBe(10.0)
    expect(r.avgExit).toBeNull()
  })

  it('sub-dollar real trade: avgEntry/avgExit are the real averages, never em-dashed (0-only sentinel, not a <threshold)', () => {
    // This app trades sub-$1 small-caps — 0.42 / 0.38 are LEGITIMATE prices and
    // must render normally. The em-dash sentinel is exactly 0, never "small".
    const t = trade({ side: 'long', avg_buy_price: 0.42, avg_sell_price: 0.38 })
    const r = computeExecutionStats(t)
    expect(r.avgEntry).toBe(0.42)
    expect(r.avgExit).toBe(0.38)
  })

  it('divide-by-zero guard: avg entry price 0 → priceMovePct null, does not throw', () => {
    const t = trade({ side: 'long', avg_buy_price: 0, avg_sell_price: 9.51 })
    expect(computeExecutionStats(t).priceMovePct).toBeNull()
  })

  it('no entry-side fills → firstEntry null', () => {
    const t = trade({ side: 'long', executions: [fill('S', 10.0, '2026-05-11T13:40:00Z')] })
    expect(computeExecutionStats(t).firstEntry).toBeNull()
  })
})

describe('blendedFillAvg', () => {
  it('volume-weights price across ALL fills regardless of side', () => {
    const fills = [
      { qty: 25, price: 7.13 }, // buy
      { qty: 6, price: 7.05 }, // sell
      { qty: 19, price: 6.84 }, // sell
    ]
    // (25*7.13 + 6*7.05 + 19*6.84) / (25 + 6 + 19) = 350.51 / 50 = 7.0102
    expect(blendedFillAvg(fills)).toBeCloseTo(7.0102, 4)
  })

  it('empty fills → null', () => {
    expect(blendedFillAvg([])).toBeNull()
  })

  it('total qty 0 → null, does not throw', () => {
    expect(blendedFillAvg([{ qty: 0, price: 7.13 }])).toBeNull()
  })
})
