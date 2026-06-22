// Compare v2 By-Price breakdown — pins the price-at-entry bucketing to the
// get.ts PRICE_BUCKETS boundaries/labels, the [min, max) edge behaviour, the
// short-side entry price, and the cheap->expensive ordering.

import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeBreakdownComparison } from '../comparison'

// The 'price' path reads only date / side / avg_buy_price / avg_sell_price /
// net_pnl, so a partial cast keeps the fixture focused.
function pr(over: Partial<TradeListRow>): TradeListRow {
  return {
    date: '2026-05-01',
    side: 'long',
    avg_buy_price: 0,
    avg_sell_price: 0,
    net_pnl: 0,
    open_time: '2026-05-01T13:30:00Z',
    ...over,
  } as unknown as TradeListRow
}

const RANGE = { from: '2026-05-01', to: '2026-05-31' }

describe('computeBreakdownComparison — price dimension', () => {
  it('buckets entry price to the get.ts boundaries, cheap -> expensive', () => {
    const out = computeBreakdownComparison(
      [
        pr({ avg_buy_price: 1.5, net_pnl: 10 }), // < $2
        pr({ avg_buy_price: 3, net_pnl: 20 }), // $2–5
        pr({ avg_buy_price: 7, net_pnl: 30 }), // $5–10
        pr({ avg_buy_price: 12, net_pnl: 40 }), // $10–15
        pr({ avg_buy_price: 18, net_pnl: 50 }), // $15–20
        pr({ avg_buy_price: 25, net_pnl: 60 }), // > $20
      ],
      RANGE,
      RANGE,
      'price',
    )
    expect(out.dimension).toBe('price')
    expect(out.rows.map((r) => r.key)).toEqual([
      '< $2',
      '$2–5',
      '$5–10',
      '$10–15',
      '$15–20',
      '> $20',
    ])
  })

  it('boundary is [min, max) — $5 lands in $5–10, not $2–5', () => {
    const out = computeBreakdownComparison([pr({ avg_buy_price: 5, net_pnl: 1 })], RANGE, RANGE, 'price')
    expect(out.rows.map((r) => r.key)).toEqual(['$5–10'])
  })

  it('shorts bucket by the sell-side entry price', () => {
    const out = computeBreakdownComparison(
      [pr({ side: 'short', avg_buy_price: 0, avg_sell_price: 8, net_pnl: 5 })],
      RANGE,
      RANGE,
      'price',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['$5–10'])
  })

  it('aggregates A and B per bucket with the BreakdownRow shape', () => {
    const out = computeBreakdownComparison(
      [
        pr({ date: '2026-05-10', avg_buy_price: 7, net_pnl: 100 }), // A
        pr({ date: '2026-04-10', avg_buy_price: 7, net_pnl: -30 }), // B
      ],
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
      'price',
    )
    const row = out.rows.find((r) => r.key === '$5–10')!
    expect(row.netPnLA).toBe(100)
    expect(row.tradesA).toBe(1)
    expect(row.netPnLB).toBe(-30)
    expect(row.tradesB).toBe(1)
  })
})
