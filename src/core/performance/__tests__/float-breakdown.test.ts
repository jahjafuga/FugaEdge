// Compare v2 By-Float + the computeBreakdownComparison `notShown` coverage count.
// notShown = in-scope (rangeA ∪ rangeB) trades whose dimension key is null — the
// trades the breakdown silently drops — counted at the drop site so the card can
// disclose the coverage gap (e.g. "1 trade without float data").

import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeBreakdownComparison } from '../comparison'

// The breakdown reads only date + the dimension's source field; a partial cast
// keeps the fixture focused. Defaults are KEYED (catalyst + float set) so a test
// opts INTO a null key explicitly.
function pr(over: Partial<TradeListRow>): TradeListRow {
  return {
    date: '2026-05-01',
    side: 'long',
    avg_buy_price: 5,
    avg_sell_price: 0,
    net_pnl: 0,
    open_time: '2026-05-01T13:30:00Z',
    catalyst_type: 'News',
    float_shares: 1_000_000,
    ...over,
  } as unknown as TradeListRow
}

const RANGE = { from: '2026-05-01', to: '2026-05-31' }

describe('computeBreakdownComparison — notShown (in-scope null-key trades)', () => {
  it('counts in-scope trades whose dimension key is null', () => {
    const out = computeBreakdownComparison(
      [
        pr({ catalyst_type: 'News', net_pnl: 10 }),
        pr({ catalyst_type: null, net_pnl: 5 }),
        pr({ catalyst_type: null, net_pnl: -3 }),
      ],
      RANGE,
      RANGE,
      'catalyst',
    )
    expect(out.notShown).toBe(2)
  })

  it('notShown is 0 when every in-scope trade has a key', () => {
    const out = computeBreakdownComparison(
      [pr({ avg_buy_price: 3 }), pr({ avg_buy_price: 12 })],
      RANGE,
      RANGE,
      'price',
    )
    expect(out.notShown).toBe(0)
  })

  it('out-of-scope null-key trades do NOT count toward notShown', () => {
    const out = computeBreakdownComparison(
      [pr({ date: '2020-01-01', catalyst_type: null, net_pnl: 1 })],
      RANGE,
      RANGE,
      'catalyst',
    )
    expect(out.notShown).toBe(0)
  })
})

describe('computeBreakdownComparison — float dimension', () => {
  it('buckets float_shares to the get.ts boundaries, low -> high', () => {
    const out = computeBreakdownComparison(
      [
        pr({ float_shares: 999_999, net_pnl: 1 }), // < 1M
        pr({ float_shares: 1_000_000, net_pnl: 1 }), // 1–2.5M (half-open lower edge)
        pr({ float_shares: 2_500_000, net_pnl: 1 }), // 2.5–5M
        pr({ float_shares: 50_000_000, net_pnl: 1 }), // > 50M (half-open upper)
      ],
      RANGE,
      RANGE,
      'float',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['< 1M', '1–2.5M', '2.5–5M', '> 50M'])
  })

  it('null float_shares -> excluded from rows AND counted in notShown', () => {
    const out = computeBreakdownComparison(
      [
        pr({ float_shares: 1_500_000, net_pnl: 1 }), // 1–2.5M
        pr({ float_shares: null, net_pnl: 1 }), // no float -> notShown
        pr({ float_shares: null, net_pnl: -2 }), // no float -> notShown
      ],
      RANGE,
      RANGE,
      'float',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['1–2.5M'])
    expect(out.notShown).toBe(2)
  })

  it('aggregates A and B per float bucket', () => {
    const out = computeBreakdownComparison(
      [
        pr({ date: '2026-05-10', float_shares: 7_000_000, net_pnl: 100 }), // A, 5–10M
        pr({ date: '2026-04-10', float_shares: 7_000_000, net_pnl: -30 }), // B, 5–10M
      ],
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
      'float',
    )
    const row = out.rows.find((r) => r.key === '5–10M')!
    expect(row.netPnLA).toBe(100)
    expect(row.tradesA).toBe(1)
    expect(row.netPnLB).toBe(-30)
    expect(row.tradesB).toBe(1)
  })
})
