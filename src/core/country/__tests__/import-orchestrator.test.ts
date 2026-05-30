import { describe, it, expect, vi } from 'vitest'
import { resolveCountriesForImport } from '../import-orchestrator'
import type { PolygonTickerRef, ResolvedCountry } from '../resolve'

// Pure orchestrator: injected provider fetches + persistence callbacks, so
// these run with no network and no electron.
//
// Two groups:
//   1. Polygon-only back-compat — no fetchProfileCountry dep (pre-v0.2.3).
//   2. v0.2.3 Stage 1 — FMP PRIMARY, Polygon FALLBACK composition at the
//      resolveCountriesForImport seam (the coverage that was lost to a
//      non-persisted write and is restored here).

interface Capture {
  applied: { symbol: string; resolved: ResolvedCountry }[]
}
function makeApply(cap: Capture) {
  return (symbol: string, resolved: ResolvedCountry) =>
    cap.applied.push({ symbol, resolved })
}

// ── Group 1: Polygon-only back-compat (no FMP dep wired) ────────────────────

describe('resolveCountriesForImport — Polygon-only (no fetchProfileCountry)', () => {
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

// ── Group 2: v0.2.3 Stage 1 — FMP PRIMARY, Polygon FALLBACK ─────────────────

describe('resolveCountriesForImport — FMP primary, Polygon fallback', () => {
  it('confident FMP hit → source "fmp" and Polygon is NEVER called (short-circuit)', async () => {
    const cap: Capture = { applied: [] }
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({}))
    const fetchProfileCountry = vi.fn(async () => 'IL')

    const out = await resolveCountriesForImport({
      symbols: ['SPRC'],
      fetchProfileCountry,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 1, unknown: 0, errors: [] })
    expect(cap.applied[0].resolved).toEqual({
      country: 'IL', country_name: 'Israel', region: 'Israel', source: 'fmp',
    })
    expect(fetchProfileCountry).toHaveBeenCalledTimes(1)
    expect(fetchRef).not.toHaveBeenCalled() // fallback skipped — the request-count win
  })

  it('FMP miss (clean null) → falls back to Polygon, NOT counted as an error', async () => {
    const cap: Capture = { applied: [] }
    const fetchProfileCountry = vi.fn(async () => null)
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({
      results: { address: { country: 'US' } },
    }))

    const out = await resolveCountriesForImport({
      symbols: ['AAPL'],
      fetchProfileCountry,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 1, unknown: 0, errors: [] })
    expect(cap.applied[0].resolved).toMatchObject({ country: 'US', source: 'polygon' })
    expect(fetchProfileCountry).toHaveBeenCalledTimes(1)
    expect(fetchRef).toHaveBeenCalledTimes(1)
  })

  it('FMP returns an empty string → treated as a miss, falls back to Polygon', async () => {
    const cap: Capture = { applied: [] }
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({
      results: { address: { country: 'CA' } },
    }))
    const out = await resolveCountriesForImport({
      symbols: ['SHOP'],
      fetchProfileCountry: async () => '',
      fetchRef,
      applyToTrades: makeApply(cap),
    })
    expect(cap.applied[0].resolved).toMatchObject({ country: 'CA', source: 'polygon' })
    expect(out.resolved).toBe(1)
    expect(fetchRef).toHaveBeenCalledTimes(1)
  })

  it('FMP throws (e.g. timeout) → records error but STILL falls back to Polygon', async () => {
    const cap: Capture = { applied: [] }
    const fetchProfileCountry = vi.fn(async () => {
      throw new Error('Request timed out after 15000ms')
    })
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({
      results: { address: { country: 'CA' } },
    }))

    const out = await resolveCountriesForImport({
      symbols: ['SHOP'],
      fetchProfileCountry,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    // Polygon still resolved the symbol…
    expect(cap.applied[0].resolved).toMatchObject({ country: 'CA', source: 'polygon' })
    expect(out.resolved).toBe(1)
    // …and the FMP failure is surfaced (prefixed) without throwing out.
    expect(out.errors).toHaveLength(1)
    expect(out.errors[0]).toMatchObject({ symbol: 'SHOP' })
    expect(out.errors[0].message).toContain('fmp:')
    expect(fetchRef).toHaveBeenCalledTimes(1)
  })

  it('both providers yield nothing → unknown (FMP null, Polygon empty)', async () => {
    const cap: Capture = { applied: [] }
    const out = await resolveCountriesForImport({
      symbols: ['NADA'],
      fetchProfileCountry: async () => null,
      fetchRef: async () => ({}),
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 0, unknown: 1 })
    expect(cap.applied[0].resolved).toEqual({
      country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown',
    })
  })

  it('Polygon fallback throwing IS terminal for the symbol (unknown + error, nothing applied)', async () => {
    const cap: Capture = { applied: [] }
    const out = await resolveCountriesForImport({
      symbols: ['BOOM'],
      fetchProfileCountry: async () => null,
      fetchRef: async () => {
        throw new Error('429 rate limited')
      },
      applyToTrades: makeApply(cap),
    })

    expect(out.resolved).toBe(0)
    expect(out.unknown).toBe(1)
    expect(out.errors).toHaveLength(1)
    expect(out.errors[0]).toMatchObject({ symbol: 'BOOM' })
    expect(cap.applied).toHaveLength(0) // hard failure persists nothing
  })

  it('counters across a mixed batch: one fmp hit, one polygon fallback, one unknown', async () => {
    const cap: Capture = { applied: [] }
    const country: Record<string, string | null> = { SPRC: 'IL', AAPL: null, NADA: null }
    const poly: Record<string, PolygonTickerRef> = {
      AAPL: { results: { address: { country: 'US' } } },
      NADA: {},
    }
    const out = await resolveCountriesForImport({
      symbols: ['SPRC', 'AAPL', 'NADA'],
      fetchProfileCountry: async (s) => country[s] ?? null,
      fetchRef: async (s) => poly[s] ?? {},
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 2, unknown: 1, errors: [] })
    const bySym = Object.fromEntries(cap.applied.map((a) => [a.symbol, a.resolved.source]))
    expect(bySym).toEqual({ SPRC: 'fmp', AAPL: 'polygon', NADA: 'unknown' })
  })

  it('writes the FMP result to the cache callback too', async () => {
    const trades: Capture = { applied: [] }
    const cache: Capture = { applied: [] }
    await resolveCountriesForImport({
      symbols: ['SPRC'],
      fetchProfileCountry: async () => 'IL',
      fetchRef: async () => ({}),
      applyToTrades: makeApply(trades),
      applyToCache: makeApply(cache),
    })
    expect(cache.applied[0].resolved).toMatchObject({ country: 'IL', source: 'fmp' })
  })
})
