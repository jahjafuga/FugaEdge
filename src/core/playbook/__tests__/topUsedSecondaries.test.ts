import { describe, expect, it } from 'vitest'
import { topUsedSecondaries } from '../topUsedSecondaries'

type Row = { id: number; name: string; stats: { trade_count: number } }
const pb = (id: number, name: string, trade_count: number): Row => ({
  id,
  name,
  stats: { trade_count },
})

describe('topUsedSecondaries', () => {
  it('orders by usage (trade_count) descending', () => {
    const rows = [pb(1, 'Low', 2), pb(2, 'High', 9), pb(3, 'Mid', 5)]
    expect(topUsedSecondaries(rows, 3).map((r) => r.id)).toEqual([2, 3, 1])
  })

  it('caps the result at n', () => {
    const rows = [pb(1, 'A', 1), pb(2, 'B', 2), pb(3, 'C', 3), pb(4, 'D', 4)]
    expect(topUsedSecondaries(rows, 3).map((r) => r.id)).toEqual([4, 3, 2])
  })

  it('returns all when n exceeds the input length', () => {
    const rows = [pb(1, 'A', 1), pb(2, 'B', 2)]
    expect(topUsedSecondaries(rows, 3).map((r) => r.id)).toEqual([2, 1])
  })

  it('sinks zero-usage rows to the bottom but keeps them eligible', () => {
    const rows = [pb(1, 'Unused', 0), pb(2, 'Used', 4)]
    expect(topUsedSecondaries(rows, 3).map((r) => r.id)).toEqual([2, 1])
  })

  it('keeps incoming order for ties (stable sort)', () => {
    const rows = [pb(1, 'First', 3), pb(2, 'Second', 3), pb(3, 'Third', 3)]
    expect(topUsedSecondaries(rows, 3).map((r) => r.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the input array', () => {
    const rows = [pb(1, 'Low', 1), pb(2, 'High', 9)]
    topUsedSecondaries(rows, 1)
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })

  it('empty input is safe', () => {
    expect(topUsedSecondaries([], 3)).toEqual([])
  })
})
