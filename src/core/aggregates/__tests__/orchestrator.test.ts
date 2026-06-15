import { describe, it, expect, vi } from 'vitest'
import {
  enrichAggregatesForSymbols,
  type AggregatesFetchResult,
} from '../orchestrator'

describe('enrichAggregatesForSymbols', () => {
  it('persists each fetched payload and counts fetched vs empty per symbol', async () => {
    // AAA returns a real bar set → fetched
    // BBB returns zero bars (range outside trading days, delisted, etc.) → empty
    const fetches: Record<string, AggregatesFetchResult> = {
      AAA: {
        daily_volumes: { '2026-05-12': 4_200_000, '2026-05-13': 5_800_000 },
        avg_volume: 5_000_000,
        daily_closes: {},
      },
      BBB: { daily_volumes: {}, avg_volume: null, daily_closes: {} },
    }
    const writes: { symbol: string; result: AggregatesFetchResult }[] = []

    const result = await enrichAggregatesForSymbols({
      symbols: ['AAA', 'BBB'],
      fetchAggregates: async (s) => fetches[s],
      persistAggregates: (symbol, r) => writes.push({ symbol, result: r }),
    })

    expect(result.fetched).toBe(1)
    expect(result.empty).toBe(1)
    expect(result.errored).toBe(0)
    expect(result.errors).toEqual([])

    // Both symbols must persist — even the empty payload writes through so
    // the row reflects "we asked, nothing there" instead of looking
    // unfetched on the next refresh.
    expect(writes).toEqual([
      { symbol: 'AAA', result: fetches.AAA },
      { symbol: 'BBB', result: fetches.BBB },
    ])
  })

  it('records fetch errors without persisting and never throws', async () => {
    const writes: string[] = []
    const result = await enrichAggregatesForSymbols({
      symbols: ['OOPS'],
      fetchAggregates: async () => {
        throw new Error('500 internal')
      },
      persistAggregates: (s) => writes.push(s),
    })

    expect(result.fetched).toBe(0)
    expect(result.empty).toBe(0)
    expect(result.errored).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ symbol: 'OOPS', message: '500 internal' })
    expect(writes).toEqual([])
  })

  it('is a fast no-op on an empty symbol list', async () => {
    const fetchAggregates = vi.fn(async () => ({ daily_volumes: {}, avg_volume: null, daily_closes: {} }))
    const persistAggregates = vi.fn()
    const emitProgress = vi.fn()

    const result = await enrichAggregatesForSymbols({
      symbols: [],
      fetchAggregates,
      persistAggregates,
      emitProgress,
    })

    expect(result).toEqual({ fetched: 0, empty: 0, errored: 0, errors: [] })
    expect(fetchAggregates).not.toHaveBeenCalled()
    expect(persistAggregates).not.toHaveBeenCalled()
    expect(emitProgress).not.toHaveBeenCalled()
  })

  it('emits progress per symbol with current/total/symbol', async () => {
    const events: { current: number; total: number; symbol: string }[] = []
    await enrichAggregatesForSymbols({
      symbols: ['A', 'B', 'C'],
      fetchAggregates: async () => ({
        daily_volumes: { '2026-05-12': 1 },
        avg_volume: 1,
        daily_closes: {},
      }),
      persistAggregates: () => {},
      emitProgress: (p) => events.push(p),
    })
    expect(events).toEqual([
      { current: 1, total: 3, symbol: 'A' },
      { current: 2, total: 3, symbol: 'B' },
      { current: 3, total: 3, symbol: 'C' },
    ])
  })
})
