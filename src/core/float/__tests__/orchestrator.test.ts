import { describe, it, expect, vi } from 'vitest'
import { enrichFloatForSymbols } from '../orchestrator'

describe('enrichFloatForSymbols', () => {
  it('persists each fetched float and counts fetched vs missing per symbol', async () => {
    // AAA returns a number → fetched
    // BBB returns null (Polygon has no shares_outstanding) → missing
    const floats: Record<string, number | null> = { AAA: 12_000_000, BBB: null }
    const writes: { symbol: string; float: number | null }[] = []

    const result = await enrichFloatForSymbols({
      symbols: ['AAA', 'BBB'],
      fetchFloat: async (s) => floats[s],
      persistFloat: (symbol, float) => writes.push({ symbol, float }),
    })

    expect(result.fetched).toBe(1)
    expect(result.missing).toBe(1)
    expect(result.errors).toEqual([])

    expect(writes).toEqual([
      { symbol: 'AAA', float: 12_000_000 },
      { symbol: 'BBB', float: null },
    ])
  })

  it('records fetch errors without persisting and never throws', async () => {
    const writes: string[] = []
    const result = await enrichFloatForSymbols({
      symbols: ['OOPS'],
      fetchFloat: async () => {
        throw new Error('429 rate limit')
      },
      persistFloat: (s) => writes.push(s),
    })

    expect(result.fetched).toBe(0)
    expect(result.missing).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ symbol: 'OOPS', message: '429 rate limit' })
    // Persist must not run when the fetch failed — leave the prior row
    // untouched so a future refresh can retry.
    expect(writes).toEqual([])
  })

  it('is a fast no-op on an empty symbol list', async () => {
    const fetchFloat = vi.fn(async () => 1)
    const persistFloat = vi.fn()
    const emitProgress = vi.fn()

    const result = await enrichFloatForSymbols({
      symbols: [],
      fetchFloat,
      persistFloat,
      emitProgress,
    })

    expect(result).toEqual({ fetched: 0, missing: 0, errors: [] })
    expect(fetchFloat).not.toHaveBeenCalled()
    expect(persistFloat).not.toHaveBeenCalled()
    expect(emitProgress).not.toHaveBeenCalled()
  })

  it('emits progress per symbol with current/total/symbol', async () => {
    const events: { current: number; total: number; symbol: string }[] = []
    await enrichFloatForSymbols({
      symbols: ['A', 'B', 'C'],
      fetchFloat: async () => 1,
      persistFloat: () => {},
      emitProgress: (p) => events.push(p),
    })
    expect(events).toEqual([
      { current: 1, total: 3, symbol: 'A' },
      { current: 2, total: 3, symbol: 'B' },
      { current: 3, total: 3, symbol: 'C' },
    ])
  })
})
