import { describe, it, expect, vi } from 'vitest'
import { enrichAfterCommit, type ImportEnrichProgress } from '../post-commit-enrich'

describe('enrichAfterCommit', () => {
  it('runs country → float → aggregates strictly sequentially', async () => {
    const calls: string[] = []
    const country = vi.fn(async () => {
      calls.push('country:start')
      await new Promise((r) => setTimeout(r, 1))
      calls.push('country:end')
      return { resolved: 2, unknown: 0, errors: [] }
    })
    const float = vi.fn(async () => {
      calls.push('float:start')
      await new Promise((r) => setTimeout(r, 1))
      calls.push('float:end')
      return { fetched: 2, missing: 0, errored: 0, errors: [] }
    })
    const aggregates = vi.fn(async () => {
      calls.push('aggregates:start')
      await new Promise((r) => setTimeout(r, 1))
      calls.push('aggregates:end')
      return { fetched: 2, empty: 0, errored: 0, errors: [] }
    })

    const result = await enrichAfterCommit({
      newSymbols: ['AAA', 'BBB'],
      country,
      float,
      aggregates,
    })

    expect(country).toHaveBeenCalledTimes(1)
    expect(float).toHaveBeenCalledTimes(1)
    expect(aggregates).toHaveBeenCalledTimes(1)
    // Each phase must fully finish before the next begins — same
    // market_data row is the racing surface; parallel writes corrupt it.
    expect(calls).toEqual([
      'country:start',
      'country:end',
      'float:start',
      'float:end',
      'aggregates:start',
      'aggregates:end',
    ])
    expect(result.country.resolved).toBe(2)
    expect(result.float.fetched).toBe(2)
    expect(result.aggregates.fetched).toBe(2)
  })

  it('still runs float + aggregates when country throws — failure isolation', async () => {
    const float = vi.fn(async () => ({ fetched: 1, missing: 0, errored: 0, errors: [] }))
    const aggregates = vi.fn(async () => ({ fetched: 1, empty: 0, errored: 0, errors: [] }))
    const result = await enrichAfterCommit({
      newSymbols: ['AAA'],
      country: async () => {
        throw new Error('settings unavailable')
      },
      float,
      aggregates,
    })

    expect(result.country.resolved).toBe(0)
    expect(result.country.unknown).toBe(1)
    expect(result.country.errors).toEqual([
      { symbol: '*', message: 'settings unavailable' },
    ])
    // Later phases still ran.
    expect(float).toHaveBeenCalledTimes(1)
    expect(aggregates).toHaveBeenCalledTimes(1)
    expect(result.float.fetched).toBe(1)
    expect(result.aggregates.fetched).toBe(1)
  })

  it('still runs aggregates when float throws — symmetric failure isolation', async () => {
    const aggregates = vi.fn(async () => ({ fetched: 1, empty: 0, errored: 0, errors: [] }))
    const result = await enrichAfterCommit({
      newSymbols: ['AAA'],
      country: async () => ({ resolved: 1, unknown: 0, errors: [] }),
      float: async () => {
        throw new Error('polygon 500')
      },
      aggregates,
    })

    expect(result.country.resolved).toBe(1)
    expect(result.float.fetched).toBe(0)
    expect(result.float.errors).toEqual([
      { symbol: '*', message: 'polygon 500' },
    ])
    // Aggregates still ran — earlier failures don't cascade.
    expect(aggregates).toHaveBeenCalledTimes(1)
    expect(result.aggregates.fetched).toBe(1)
  })

  it('returns earlier results when aggregates throws — last-phase isolation', async () => {
    const result = await enrichAfterCommit({
      newSymbols: ['AAA', 'BBB'],
      country: async () => ({ resolved: 2, unknown: 0, errors: [] }),
      float: async () => ({ fetched: 2, missing: 0, errored: 0, errors: [] }),
      aggregates: async () => {
        throw new Error('aggregates endpoint down')
      },
    })

    expect(result.country.resolved).toBe(2)
    expect(result.float.fetched).toBe(2)
    expect(result.aggregates.fetched).toBe(0)
    expect(result.aggregates.empty).toBe(0)
    // Runner-level throw routes to `errored` — distinct from `empty`
    // which means Polygon returned zero bars on a successful call.
    expect(result.aggregates.errored).toBe(2)
    expect(result.aggregates.errors).toEqual([
      { symbol: '*', message: 'aggregates endpoint down' },
    ])
  })

  it('is a fast no-op when newSymbols is empty', async () => {
    const country = vi.fn(async () => ({ resolved: 99, unknown: 0, errors: [] }))
    const float = vi.fn(async () => ({ fetched: 99, missing: 0, errored: 0, errors: [] }))
    const aggregates = vi.fn(async () => ({ fetched: 99, empty: 0, errored: 0, errors: [] }))

    const result = await enrichAfterCommit({
      newSymbols: [],
      country,
      float,
      aggregates,
    })

    expect(country).not.toHaveBeenCalled()
    expect(float).not.toHaveBeenCalled()
    expect(aggregates).not.toHaveBeenCalled()
    expect(result).toEqual({
      country: { resolved: 0, unknown: 0, errors: [] },
      float: { fetched: 0, missing: 0, errored: 0, errors: [] },
      aggregates: { fetched: 0, empty: 0, errored: 0, errors: [] },
    })
  })

  it('tags emitted progress events with their phase', async () => {
    const events: ImportEnrichProgress[] = []
    await enrichAfterCommit({
      newSymbols: ['AAA'],
      country: async (_s, onProgress) => {
        onProgress?.({ current: 1, total: 1, symbol: 'AAA' })
        return { resolved: 1, unknown: 0, errors: [] }
      },
      float: async (_s, onProgress) => {
        onProgress?.({ current: 1, total: 1, symbol: 'AAA' })
        return { fetched: 1, missing: 0, errored: 0, errors: [] }
      },
      aggregates: async (_s, onProgress) => {
        onProgress?.({ current: 1, total: 1, symbol: 'AAA' })
        return { fetched: 1, empty: 0, errored: 0, errors: [] }
      },
      emitProgress: (e) => events.push(e),
    })
    expect(events).toEqual([
      { phase: 'country', current: 1, total: 1, symbol: 'AAA' },
      { phase: 'float', current: 1, total: 1, symbol: 'AAA' },
      { phase: 'aggregates', current: 1, total: 1, symbol: 'AAA' },
    ])
  })
})

