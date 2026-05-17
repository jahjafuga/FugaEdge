import { describe, it, expect, vi } from 'vitest'
import { enrichAfterCommit, type ImportEnrichProgress } from '../post-commit-enrich'

describe('enrichAfterCommit', () => {
  it('runs country first then float (sequential, never parallel)', async () => {
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
      return { fetched: 2, missing: 0, errors: [] }
    })

    const result = await enrichAfterCommit({
      newSymbols: ['AAA', 'BBB'],
      country,
      float,
    })

    expect(country).toHaveBeenCalledTimes(1)
    expect(float).toHaveBeenCalledTimes(1)
    // Country must fully finish before float begins — same market_data row
    // is the racing surface; parallel writes corrupt it.
    expect(calls).toEqual([
      'country:start',
      'country:end',
      'float:start',
      'float:end',
    ])
    expect(result.country.resolved).toBe(2)
    expect(result.float.fetched).toBe(2)
  })

  it('still runs float when country throws — failure isolation', async () => {
    const float = vi.fn(async () => ({ fetched: 1, missing: 0, errors: [] }))
    const result = await enrichAfterCommit({
      newSymbols: ['AAA'],
      country: async () => {
        throw new Error('settings unavailable')
      },
      float,
    })

    expect(result.country.resolved).toBe(0)
    expect(result.country.unknown).toBe(1)
    expect(result.country.errors).toEqual([
      { symbol: '*', message: 'settings unavailable' },
    ])
    // Float still ran.
    expect(float).toHaveBeenCalledTimes(1)
    expect(result.float.fetched).toBe(1)
  })

  it('returns country result when float throws — symmetric failure isolation', async () => {
    const result = await enrichAfterCommit({
      newSymbols: ['AAA'],
      country: async () => ({ resolved: 1, unknown: 0, errors: [] }),
      float: async () => {
        throw new Error('polygon 500')
      },
    })

    expect(result.country.resolved).toBe(1)
    expect(result.float.fetched).toBe(0)
    expect(result.float.errors).toEqual([
      { symbol: '*', message: 'polygon 500' },
    ])
  })

  it('is a fast no-op when newSymbols is empty', async () => {
    const country = vi.fn(async () => ({ resolved: 99, unknown: 0, errors: [] }))
    const float = vi.fn(async () => ({ fetched: 99, missing: 0, errors: [] }))

    const result = await enrichAfterCommit({ newSymbols: [], country, float })

    expect(country).not.toHaveBeenCalled()
    expect(float).not.toHaveBeenCalled()
    expect(result).toEqual({
      country: { resolved: 0, unknown: 0, errors: [] },
      float: { fetched: 0, missing: 0, errors: [] },
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
        return { fetched: 1, missing: 0, errors: [] }
      },
      emitProgress: (e) => events.push(e),
    })
    expect(events).toEqual([
      { phase: 'country', current: 1, total: 1, symbol: 'AAA' },
      { phase: 'float', current: 1, total: 1, symbol: 'AAA' },
    ])
  })
})
