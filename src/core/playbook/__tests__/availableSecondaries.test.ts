import { describe, expect, it } from 'vitest'
import { filterAvailableSecondaries } from '../availableSecondaries'

type Row = { id: number; name: string; archived: boolean; is_system: boolean }
const pb = (id: number, name: string, over: Partial<Row> = {}): Row => ({
  id,
  name,
  archived: false,
  is_system: false,
  ...over,
})

describe('filterAvailableSecondaries', () => {
  it('excludes the system row (No Setup)', () => {
    const rows = [pb(1, 'Bull Flag'), pb(108, 'No Setup', { is_system: true })]
    expect(filterAvailableSecondaries(rows, null, []).map((r) => r.id)).toEqual([1])
  })

  it('excludes archived rows', () => {
    const rows = [pb(1, 'Bull Flag'), pb(2, 'Old Setup', { archived: true })]
    expect(filterAvailableSecondaries(rows, null, []).map((r) => r.id)).toEqual([1])
  })

  it("excludes the trade's current primary", () => {
    const rows = [pb(1, 'Bull Flag'), pb(2, 'VWAP Bounce')]
    expect(filterAvailableSecondaries(rows, 1, []).map((r) => r.id)).toEqual([2])
  })

  it('excludes already-selected secondaries', () => {
    // Name-sorted input so this reads as a pure exclusion (the by-name sort is
    // covered separately below).
    const rows = [pb(1, 'ABCD'), pb(2, 'Bull Flag'), pb(3, 'VWAP Bounce')]
    expect(filterAvailableSecondaries(rows, null, [2]).map((r) => r.id)).toEqual([1, 3])
  })

  it('primaryId null still excludes system / archived / selected', () => {
    const rows = [
      pb(1, 'Bull Flag'),
      pb(108, 'No Setup', { is_system: true }),
      pb(2, 'Old', { archived: true }),
      pb(3, 'ABCD'),
    ]
    expect(filterAvailableSecondaries(rows, null, [3]).map((r) => r.id)).toEqual([1])
  })

  it('orders by name', () => {
    const rows = [pb(1, 'Zeta'), pb(2, 'Alpha'), pb(3, 'Mango')]
    expect(filterAvailableSecondaries(rows, null, []).map((r) => r.name)).toEqual([
      'Alpha',
      'Mango',
      'Zeta',
    ])
  })

  it('empty inputs are safe', () => {
    expect(filterAvailableSecondaries([], null, [])).toEqual([])
    expect(filterAvailableSecondaries([], 5, [1, 2])).toEqual([])
  })
})
