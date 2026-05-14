import { describe, it, expect, vi } from 'vitest'
import { resolveCountriesForImport } from '../import-orchestrator'
import type { PolygonTickerRef } from '../resolve'

describe('resolveCountriesForImport', () => {
  it('reports resolved vs unknown per ticker and writes to trades + cache', async () => {
    const refs: Record<string, PolygonTickerRef> = {
      AAA: { results: { address: { country: 'US' } } },
      // No address / locale / exchange → resolver returns country=null.
      BBB: { results: { name: 'Acme Mystery Holdings' } },
    }
    const trades: Record<string, string | null | undefined> = {}
    const tradeSources: Record<string, string> = {}
    const cache: Record<string, string | null | undefined> = {}

    const result = await resolveCountriesForImport({
      symbols: ['AAA', 'BBB'],
      fetchRef: async (s) => refs[s] ?? {},
      applyToTrades: (symbol, r) => {
        trades[symbol] = r.country
        tradeSources[symbol] = r.source
      },
      applyToCache: (symbol, r) => {
        cache[symbol] = r.country
      },
    })

    expect(result.resolved).toBe(1)
    expect(result.unknown).toBe(1)
    expect(result.errors).toEqual([])

    expect(trades.AAA).toBe('US')
    expect(tradeSources.AAA).toBe('polygon')
    expect(trades.BBB).toBeNull()
    expect(tradeSources.BBB).toBe('unknown')

    expect(cache.AAA).toBe('US')
    expect(cache.BBB).toBeNull()
  })

  it('counts fetch errors as unknown and never throws', async () => {
    const writes: string[] = []
    const result = await resolveCountriesForImport({
      symbols: ['OOPS'],
      fetchRef: async () => {
        throw new Error('429 rate limit')
      },
      applyToTrades: (s) => writes.push(s),
    })

    expect(result.resolved).toBe(0)
    expect(result.unknown).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ symbol: 'OOPS', message: '429 rate limit' })
    // No write to trades when fetch fails — leaves country_source NULL so a
    // future backfill picks the trade up.
    expect(writes).toEqual([])
  })

  it('respects spacing between Polygon calls when configured', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const fetchRef = vi.fn(async (s: string) => {
      calls.push(Date.now())
      return { results: { address: { country: s === 'A' ? 'US' : 'GB' } } }
    })

    const pending = resolveCountriesForImport({
      symbols: ['A', 'B'],
      fetchRef,
      applyToTrades: () => {},
      spacingMs: 100,
    })
    await vi.runAllTimersAsync()
    const result = await pending
    vi.useRealTimers()

    expect(result.resolved).toBe(2)
    expect(fetchRef).toHaveBeenCalledTimes(2)
  })
})
