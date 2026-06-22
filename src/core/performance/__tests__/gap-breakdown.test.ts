// Compare v2 By-Gap % — at-entry daily-change bucketing on the breakdown
// dimension. Mirrors the By-RVOL tests; reuses the computeBreakdownComparison
// notShown path (no core change). daily_change_pct is a SIGNED percentage
// (+50% stored as 50, gapped-down negative), so the first bucket is '< 0%' and
// the ladder is exhaustive over all reals via ±Infinity.

import { describe, it, expect } from 'vitest'
import type { TradeListRow } from '@shared/trades-types'
import { computeBreakdownComparison } from '../comparison'

// Defaults are KEYED (daily_change_pct set) so a test opts INTO a null explicitly.
function pr(over: Partial<TradeListRow>): TradeListRow {
  return {
    date: '2026-05-01',
    side: 'long',
    avg_buy_price: 5,
    avg_sell_price: 0,
    net_pnl: 0,
    open_time: '2026-05-01T13:30:00Z',
    daily_change_pct: 25,
    ...over,
  } as unknown as TradeListRow
}

const RANGE = { from: '2026-05-01', to: '2026-05-31' }

describe('computeBreakdownComparison — gap dimension', () => {
  it('signed buckets, down -> up: negatives in < 0%, the half-open ladder, +921 -> top', () => {
    const out = computeBreakdownComparison(
      [
        pr({ daily_change_pct: -82.5, net_pnl: 1 }), // < 0%
        pr({ daily_change_pct: 0, net_pnl: 1 }), // 0–50% (0 is the lower edge, NOT < 0%)
        pr({ daily_change_pct: 50, net_pnl: 1 }), // 50–100% (half-open lower edge)
        pr({ daily_change_pct: 100, net_pnl: 1 }), // 100–200%
        pr({ daily_change_pct: 200, net_pnl: 1 }), // 200–500%
        pr({ daily_change_pct: 500, net_pnl: 1 }), // 500%+
        pr({ daily_change_pct: 921, net_pnl: 1 }), // 500%+ (the real max)
      ],
      RANGE,
      RANGE,
      'gap',
    )
    expect(out.rows.map((r) => r.key)).toEqual([
      '< 0%',
      '0–50%',
      '50–100%',
      '100–200%',
      '200–500%',
      '500%+',
    ])
  })

  it('any negative gap -> < 0% (down bucket)', () => {
    const out = computeBreakdownComparison([pr({ daily_change_pct: -0.1, net_pnl: 1 })], RANGE, RANGE, 'gap')
    expect(out.rows.map((r) => r.key)).toEqual(['< 0%'])
  })

  it('half-open upper edges: 49.9 -> 0–50%, 199.9 -> 100–200%', () => {
    const out = computeBreakdownComparison(
      [pr({ daily_change_pct: 49.9 }), pr({ daily_change_pct: 199.9 })],
      RANGE,
      RANGE,
      'gap',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['0–50%', '100–200%'])
  })

  it('null daily_change_pct -> excluded from rows AND counted in notShown', () => {
    const out = computeBreakdownComparison(
      [
        pr({ daily_change_pct: 75, net_pnl: 1 }), // 50–100%
        pr({ daily_change_pct: null, net_pnl: 1 }), // no gap -> notShown
        pr({ daily_change_pct: null, net_pnl: -2 }), // no gap -> notShown
      ],
      RANGE,
      RANGE,
      'gap',
    )
    expect(out.rows.map((r) => r.key)).toEqual(['50–100%'])
    expect(out.notShown).toBe(2)
  })

  it('aggregates A and B per gap bucket', () => {
    const out = computeBreakdownComparison(
      [
        pr({ date: '2026-05-10', daily_change_pct: 150, net_pnl: 100 }), // A, 100–200%
        pr({ date: '2026-04-10', daily_change_pct: 150, net_pnl: -30 }), // B, 100–200%
      ],
      { from: '2026-05-01', to: '2026-05-31' },
      { from: '2026-04-01', to: '2026-04-30' },
      'gap',
    )
    const row = out.rows.find((r) => r.key === '100–200%')!
    expect(row.netPnLA).toBe(100)
    expect(row.tradesA).toBe(1)
    expect(row.netPnLB).toBe(-30)
    expect(row.tradesB).toBe(1)
  })
})
