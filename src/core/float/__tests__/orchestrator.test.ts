import { describe, it, expect, vi } from 'vitest'
import { enrichFloatForSymbols, type FloatFetchResult } from '../orchestrator'

describe('enrichFloatForSymbols', () => {
  it('persists each fetched payload (float + passengers) and counts by float', async () => {
    // AAA returns a numeric float → fetched
    // BBB returns null float (Polygon has no shares_outstanding) → missing
    // Both carry market_cap + sector passengers that must persist as-is.
    const fetches: Record<string, FloatFetchResult> = {
      AAA: { float: 12_000_000, market_cap: 50_000_000, sector: 'Biotech' },
      BBB: { float: null, market_cap: null, sector: null },
    }
    const writes: { symbol: string; result: FloatFetchResult }[] = []

    const result = await enrichFloatForSymbols({
      symbols: ['AAA', 'BBB'],
      fetchFloat: async (s) => fetches[s],
      persistFloat: (symbol, r) => writes.push({ symbol, result: r }),
    })

    expect(result.fetched).toBe(1)
    expect(result.missing).toBe(1)
    expect(result.errored).toBe(0)
    expect(result.errors).toEqual([])

    expect(writes).toEqual([
      { symbol: 'AAA', result: fetches.AAA },
      { symbol: 'BBB', result: fetches.BBB },
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
    expect(result.errored).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ symbol: 'OOPS', message: '429 rate limit' })
    // Persist must not run when the fetch failed — leave the prior row
    // untouched so a future refresh can retry.
    expect(writes).toEqual([])
  })

  it('is a fast no-op on an empty symbol list', async () => {
    const fetchFloat = vi.fn(async () => ({ float: 1, market_cap: null, sector: null }))
    const persistFloat = vi.fn()
    const emitProgress = vi.fn()

    const result = await enrichFloatForSymbols({
      symbols: [],
      fetchFloat,
      persistFloat,
      emitProgress,
    })

    expect(result).toEqual({ fetched: 0, missing: 0, errored: 0, errors: [] })
    expect(fetchFloat).not.toHaveBeenCalled()
    expect(persistFloat).not.toHaveBeenCalled()
    expect(emitProgress).not.toHaveBeenCalled()
  })

  it('emits progress per symbol with current/total/symbol', async () => {
    const events: { current: number; total: number; symbol: string }[] = []
    await enrichFloatForSymbols({
      symbols: ['A', 'B', 'C'],
      fetchFloat: async () => ({ float: 1, market_cap: null, sector: null }),
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
