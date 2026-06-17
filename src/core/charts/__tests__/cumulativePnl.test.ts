import { describe, it, expect } from 'vitest'
import { toCumulativeEquity } from '../cumulativePnl'
import type { DailyPnlPoint } from '@shared/dashboard-types'

// Only date + net_pnl matter to the transform; trade_count / avg_trade_pnl are
// required by DailyPnlPoint but ignored by the running sum.
function day(date: string, net_pnl: number): DailyPnlPoint {
  return { date, net_pnl, trade_count: 1, avg_trade_pnl: net_pnl }
}

describe('toCumulativeEquity', () => {
  it('returns an empty array for no days', () => {
    expect(toCumulativeEquity([])).toEqual([])
  })

  it('running-sums net_pnl into cumulative_net_pnl in date order', () => {
    const out = toCumulativeEquity([
      day('2026-06-01', 100),
      day('2026-06-02', -40),
      day('2026-06-03', 25),
    ])
    expect(out).toEqual([
      { date: '2026-06-01', daily_pnl: 100, cumulative_net_pnl: 100 },
      { date: '2026-06-02', daily_pnl: -40, cumulative_net_pnl: 60 },
      { date: '2026-06-03', daily_pnl: 25, cumulative_net_pnl: 85 },
    ])
  })

  it('starts the running total at 0 at the first (window) point — window-relative', () => {
    const out = toCumulativeEquity([day('2026-06-10', -50)])
    expect(out[0].cumulative_net_pnl).toBe(-50)
    expect(out[0].daily_pnl).toBe(-50)
  })

  it('is order-independent — sorts by date before accumulating', () => {
    const out = toCumulativeEquity([
      day('2026-06-03', 25),
      day('2026-06-01', 100),
      day('2026-06-02', -40),
    ])
    expect(out.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
    expect(out.map((p) => p.cumulative_net_pnl)).toEqual([100, 60, 85])
  })

  it('does not mutate the input array', () => {
    const input = [day('2026-06-02', 10), day('2026-06-01', 20)]
    const before = input.map((d) => d.date)
    toCumulativeEquity(input)
    expect(input.map((d) => d.date)).toEqual(before)
  })
})
