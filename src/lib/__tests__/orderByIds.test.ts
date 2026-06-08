import { describe, it, expect } from 'vitest'
import { orderByIds } from '@/lib/orderByIds'

describe('orderByIds', () => {
  // (a)
  it('returns empty array when ids is empty', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    expect(orderByIds(rows, [], (r) => r.id)).toEqual([])
  })

  // (b)
  it('returns empty array when rows is empty', () => {
    const rows: { id: number }[] = []
    expect(orderByIds(rows, [1, 2, 3], (r) => r.id)).toEqual([])
  })

  // (c)
  it('returns rows in the order of the ids input, not the rows input', () => {
    const rows = [
      { id: 1, x: 'a' },
      { id: 2, x: 'b' },
      { id: 3, x: 'c' },
    ]
    expect(orderByIds(rows, [3, 1, 2], (r) => r.id)).toEqual([
      { id: 3, x: 'c' },
      { id: 1, x: 'a' },
      { id: 2, x: 'b' },
    ])
  })

  // (d)
  it('skips ids that have no matching row, preserving input order for the rest', () => {
    const rows = [{ id: 1 }, { id: 3 }]
    expect(orderByIds(rows, [1, 2, 3, 4], (r) => r.id)).toEqual([{ id: 1 }, { id: 3 }])
  })

  // (e)
  it('uses the provided getId callback to extract the id', () => {
    const rows = [{ tradeId: 10 }, { tradeId: 20 }]
    expect(orderByIds(rows, [20, 10], (r) => r.tradeId)).toEqual([
      { tradeId: 20 },
      { tradeId: 10 },
    ])
  })

  // (f)
  it('deduplicates the ids input: a repeated id returns its row once', () => {
    const rows = [{ id: 1 }, { id: 2 }]
    expect(orderByIds(rows, [1, 2, 1], (r) => r.id)).toEqual([{ id: 1 }, { id: 2 }])
  })

  // (g)
  it('if rows contains duplicate ids, the first occurrence wins', () => {
    const rows = [
      { id: 1, v: 'first' },
      { id: 1, v: 'second' },
    ]
    expect(orderByIds(rows, [1], (r) => r.id)).toEqual([{ id: 1, v: 'first' }])
  })

  // (h)
  it('preserves reference identity of rows (no object copying)', () => {
    const row = { id: 1, payload: { nested: true } }
    const out = orderByIds([row], [1], (r) => r.id)
    expect(out[0]).toBe(row)
    expect(out[0].payload).toBe(row.payload)
  })
})
