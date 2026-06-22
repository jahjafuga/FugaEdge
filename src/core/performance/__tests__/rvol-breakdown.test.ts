// Compare v2 By-RVOL — relative-volume bucketing on the breakdown dimension.
// Mirrors the By-Float tests; reuses the same computeBreakdownComparison notShown
// path (no core change). Boundaries quote-match electron/reports/get.ts RVOL_BUCKETS.

import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeBreakdownComparison } from '../comparison'

// Defaults are KEYED (rvol set) so a test opts INTO a null rvol explicitly.
function pr(over: Partial<TradeListRow>): TradeListRow {
  return {
    date: '2026-05-01',
    side: 'long',
    avg_buy_price: 5,
    avg_sell_price: 0,
    net_pnl: 0,
    open_time: '2026-05-01T13:30:00Z',
    rvol: 3,
    ...over,
  } as unknown as TradeListRow
}

const RANGE = { from: '2026-05-01', to: '2026-05-31' }

describe('computeBreakdownComparison — rvol dimension', () => {
  it('buckets rvol to the get.ts boundaries, low -> high', () => {
    const out = computeBreakdownComparison(
      [
        pr({ rvol: 1.9, net_pnl: 1 }), // 0–2×
        pr({ rvol: 2.0, net_pnl: 1 }), // 2–5× (half-open lower edge)
        pr({ rvol: 5.0, net_pnl: 1 }), // 5–10×
        pr({ rvol: 10.0, net_pnl: 1 }), // 10×+ (half-open upper)
      ],
      RANGE,
      RANGE,
      'rvol',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['0–2×', '2–5×', '5–10×', '10×+'])
  })

  it('null rvol -> excluded from rows AND counted in notShown', () => {
    const out = computeBreakdownComparison(
      [
        pr({ rvol: 7, net_pnl: 1 }), // 5–10×
        pr({ rvol: null, net_pnl: 1 }), // no rvol -> notShown
        pr({ rvol: null, net_pnl: -2 }), // no rvol -> notShown
      ],
      RANGE,
      RANGE,
      'rvol',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['5–10×'])
    expect(out.notShown).toBe(2)
  })

  it('aggregates A and B per rvol bucket', () => {
    const out = computeBreakdownComparison(
      [
        pr({ date: '2026-05-10', rvol: 12, net_pnl: 100 }), // A, 10×+
        pr({ date: '2026-04-10', rvol: 12, net_pnl: -30 }), // B, 10×+
      ],
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
      'rvol',
    )
    const row = out.rows.find((r) => r.key === '10×+')!
    expect(row.netPnLA).toBe(100)
    expect(row.tradesA).toBe(1)
    expect(row.netPnLB).toBe(-30)
    expect(row.tradesB).toBe(1)
  })
})
