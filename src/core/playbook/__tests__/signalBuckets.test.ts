// Beat 4c PART B — pure confluence count-bucketing for the Performance tab.
// The module takes PRE-CLASSIFIED input (the renderer computes signalCount per
// trade) and partitions into 1 / 2 / 3+ signal buckets, reusing the Convention-A
// computeOutcomeStats helper (4a) for each bucket's stats — NO new stats math.
// It knows nothing about playbook_tier / is_system; 0-signal trades are excluded
// (they're the No-Setup cost line / untagged, surfaced elsewhere).

import { describe, expect, it } from 'vitest'
import { computeSignalBuckets } from '../signalBuckets'

// A trade reduced to the only two fields the bucketer reads.
const t = (signalCount: number, net_pnl: number) => ({ signalCount, net_pnl })

describe('computeSignalBuckets — confluence count-buckets (1 / 2 / 3+ signals)', () => {
  it('always returns three rows in order 1, 2, 3+ (even with no trades)', () => {
    const rows = computeSignalBuckets([])
    expect(rows.map((r) => r.bucket)).toEqual(['1', '2', '3+'])
  })

  it('routes a 1-signal trade into the "1" bucket', () => {
    const rows = computeSignalBuckets([t(1, 10)])
    const one = rows.find((r) => r.bucket === '1')!
    expect(one.count).toBe(1)
    expect(one.net_pnl).toBe(10)
  })

  it('routes a 2-signal trade into the "2" bucket only', () => {
    const rows = computeSignalBuckets([t(2, 10)])
    expect(rows.find((r) => r.bucket === '2')!.count).toBe(1)
    expect(rows.find((r) => r.bucket === '1')!.count).toBe(0)
  })

  it('routes 3-signal AND 5-signal trades into the "3+" bucket', () => {
    const rows = computeSignalBuckets([t(3, 10), t(5, 20)])
    const threePlus = rows.find((r) => r.bucket === '3+')!
    expect(threePlus.count).toBe(2)
    expect(threePlus.net_pnl).toBe(30)
  })

  it('excludes 0-signal trades from every bucket', () => {
    const rows = computeSignalBuckets([t(0, 999), t(1, 5)])
    const total = rows.reduce((n, r) => n + r.count, 0)
    expect(total).toBe(1) // the 0-signal trade is dropped, not bucketed
    expect(rows.find((r) => r.bucket === '1')!.count).toBe(1)
  })

  it('reports empty buckets as count 0 / null win_rate / null expectancy / 0 net', () => {
    const rows = computeSignalBuckets([t(1, 10)])
    const two = rows.find((r) => r.bucket === '2')!
    expect(two.count).toBe(0)
    expect(two.win_rate).toBeNull()
    expect(two.expectancy).toBeNull()
    expect(two.net_pnl).toBe(0)
  })

  it('bucket counts partition the signalled trades (sum === count with signalCount >= 1)', () => {
    const trades = [t(0, 1), t(1, 2), t(2, 3), t(3, 4), t(4, 5), t(0, 6)]
    const rows = computeSignalBuckets(trades)
    const sum = rows.reduce((n, r) => n + r.count, 0)
    const signalled = trades.filter((x) => x.signalCount >= 1).length
    expect(sum).toBe(signalled) // 4 — the two 0-signal trades excluded
  })

  it('per-bucket stats are Convention-A via computeOutcomeStats (win_rate, expectancy)', () => {
    // 1-signal bucket: one win (+10), one loss (-5) → WR 0.5, net 5,
    // expectancy 0.5·10 − 0.5·5 = 2.5.
    const rows = computeSignalBuckets([t(1, 10), t(1, -5)])
    const one = rows.find((r) => r.bucket === '1')!
    expect(one.count).toBe(2)
    expect(one.win_rate).toBe(0.5)
    expect(one.net_pnl).toBe(5)
    expect(one.expectancy).toBeCloseTo(2.5, 10)
  })
})
