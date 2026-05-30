import { describe, it, expect, vi } from 'vitest'
import { resolveCountriesForImport } from '../import-orchestrator'
import type { ResolvedSymbol } from '../import-orchestrator'
import type { PolygonTickerRef } from '../resolve'
import type { CompanyProfile } from '@shared/fmp-types'

// Pure orchestrator: injected provider fetches + persistence callbacks, so
// these run with no network and no electron.
//
// v0.2.3 Stage 1 — FMP PRIMARY (country), Polygon FALLBACK.
// v0.2.3 Stage 2 — the SAME FMP profile call carries marketCap/sector/industry
// passengers that ride alongside the resolved country through ResolvedSymbol.
//
// applyToTrades / applyToCache now receive a ResolvedSymbol:
//   { resolved: ResolvedCountry, marketCap, sector, industry }

interface Capture {
  applied: { symbol: string; r: ResolvedSymbol }[]
}
function makeApply(cap: Capture) {
  return (symbol: string, r: ResolvedSymbol) => cap.applied.push({ symbol, r })
}

/** Build a CompanyProfile with sensible nulls for omitted fields. */
function profile(p: Partial<CompanyProfile>): CompanyProfile {
  return { country: null, marketCap: null, sector: null, industry: null, ...p }
}

// ── Group 1: Polygon-only back-compat (no FMP dep wired) ────────────────────

describe('resolveCountriesForImport — Polygon-only (no fetchProfile)', () => {
  it('reports resolved vs unknown per ticker and writes to trades + cache', async () => {
    const refs: Record<string, PolygonTickerRef> = {
      AAA: { results: { address: { country: 'US' } } },
      BBB: { results: { name: 'Acme Mystery Holdings' } }, // → country null
    }
    const cap: Capture = { applied: [] }
    const cache: Capture = { applied: [] }

    const result = await resolveCountriesForImport({
      symbols: ['AAA', 'BBB'],
      fetchRef: async (s) => refs[s] ?? {},
      applyToTrades: makeApply(cap),
      applyToCache: makeApply(cache),
    })

    expect(result.resolved).toBe(1)
    expect(result.unknown).toBe(1)
    expect(result.errors).toEqual([])

    expect(cap.applied[0].r.resolved).toMatchObject({ country: 'US', source: 'polygon' })
    expect(cap.applied[1].r.resolved).toMatchObject({ country: null, source: 'unknown' })
    // Polygon-only → passengers all null.
    expect(cap.applied[0].r).toMatchObject({ marketCap: null, sector: null, industry: null })
    expect(cache.applied).toHaveLength(2)
  })

  it('counts fetch errors as unknown and never throws', async () => {
    const cap: Capture = { applied: [] }
    const result = await resolveCountriesForImport({
      symbols: ['OOPS'],
      fetchRef: async () => {
        throw new Error('429 rate limit')
      },
      applyToTrades: makeApply(cap),
    })

    expect(result.resolved).toBe(0)
    expect(result.unknown).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ symbol: 'OOPS', message: '429 rate limit' })
    expect(cap.applied).toHaveLength(0) // nothing applied on a hard failure
  })

  it('respects spacing between Polygon calls when configured', async () => {
    vi.useFakeTimers()
    const fetchRef = vi.fn(async (s: string) => ({
      results: { address: { country: s === 'A' ? 'US' : 'GB' } },
    }))
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

// ── Group 2: v0.2.3 — FMP PRIMARY (country) + Stage 2 passengers ─────────────

describe('resolveCountriesForImport — FMP primary, Polygon fallback', () => {
  it('confident FMP hit → source "fmp", passengers ride through, Polygon NEVER called', async () => {
    const cap: Capture = { applied: [] }
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({}))
    const fetchProfile = vi.fn(async () =>
      profile({ country: 'IL', marketCap: 567401, sector: 'Healthcare', industry: 'Biotechnology' }),
    )

    const out = await resolveCountriesForImport({
      symbols: ['SPRC'],
      fetchProfile,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 1, unknown: 0, errors: [] })
    expect(cap.applied[0].r.resolved).toEqual({
      country: 'IL', country_name: 'Israel', region: 'Israel', source: 'fmp',
    })
    // Stage 2 — passengers from the same call.
    expect(cap.applied[0].r).toMatchObject({
      marketCap: 567401, sector: 'Healthcare', industry: 'Biotechnology',
    })
    expect(fetchProfile).toHaveBeenCalledTimes(1)
    expect(fetchRef).not.toHaveBeenCalled() // fallback skipped — request-count win
  })

  it('FMP null country → falls back to Polygon, but FMP passengers STILL ride through', async () => {
    const cap: Capture = { applied: [] }
    // FMP had no country but DID return marketCap/sector/industry.
    const fetchProfile = vi.fn(async () =>
      profile({ country: null, marketCap: 999, sector: 'Energy', industry: 'Oil & Gas' }),
    )
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({
      results: { address: { country: 'US' } },
    }))

    const out = await resolveCountriesForImport({
      symbols: ['AAPL'],
      fetchProfile,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    expect(out).toMatchObject({ resolved: 1, unknown: 0, errors: [] })
    expect(cap.applied[0].r.resolved).toMatchObject({ country: 'US', source: 'polygon' })
    // Passengers preserved from the FMP call even though country fell back.
    expect(cap.applied[0].r).toMatchObject({ marketCap: 999, sector: 'Energy', industry: 'Oil & Gas' })
    expect(fetchProfile).toHaveBeenCalledTimes(1)
    expect(fetchRef).toHaveBeenCalledTimes(1)
  })

  it('FMP total miss (null profile) → Polygon fallback, passengers all null', async () => {
    const cap: Capture = { applied: [] }
    const out = await resolveCountriesForImport({
      symbols: ['SHOP'],
      fetchProfile: async () => null,
      fetchRef: async () => ({ results: { address: { country: 'CA' } } }),
      applyToTrades: makeApply(cap),
    })
    expect(out.resolved).toBe(1)
    expect(cap.applied[0].r.resolved).toMatchObject({ country: 'CA', source: 'polygon' })
    expect(cap.applied[0].r).toMatchObject({ marketCap: null, sector: null, industry: null })
  })

  it('FMP throws (e.g. timeout) → records error but STILL falls back to Polygon', async () => {
    const cap: Capture = { applied: [] }
    const fetchProfile = vi.fn(async () => {
      throw new Error('Request timed out after 15000ms')
    })
    const fetchRef = vi.fn(async (): Promise<PolygonTickerRef> => ({
      results: { address: { country: 'CA' } },
    }))

    const out = await resolveCountriesForImport({
      symbols: ['SHOP'],
      fetchProfile,
      fetchRef,
      applyToTrades: makeApply(cap),
    })

    expect(cap.applied[0].r.resolved).toMatchObject({ country: 'CA', source: 'polygon' })
    // On an FMP throw, profile is null → passengers null.
    expect(cap.applied[0].r).toMatchObject({ marketCap: null, sector: null, industry: null })
    expect(out.resolved).toBe(1)
    expect(out.errors).toHaveLength(1)
    expect(out.errors[0]).toMatchObject({ symbol: 'SHOP' })
    expect(out.errors[0].message).toContain('fmp:')
    expect(fetchRef).toHaveBeenCalledTimes(1)
  })

  it('both providers yield nothing → unknown (FMP null, Polygon empty)', async () => {
    const cap: Capture = { applied: [] }
    const out = await resolveCountriesForImport({
      symbols: ['NADA'],
      fetchProfile: async () => null,
      fetchRef: async () => ({}),
      applyToTrades: makeApply(cap),
    })
    expect(out).toMatchObject({ resolved: 0, unknown: 1 })
    expect(cap.applied[0].r.resolved).toEqual({
      country: null, country_name: 'Unknown', region: 'Unknown', source: 'unknown',
    })
  })

  it('Polygon fallback throwing IS terminal (unknown + error, nothing applied)', async () => {
    const cap: Capture = { applied: [] }
    const out = await resolveCountriesForImport({
      symbols: ['BOOM'],
      fetchProfile: async () => null,
      fetchRef: async () => {
        throw new Error('429 rate limited')
      },
      applyToTrades: makeApply(cap),
    })
    expect(out.resolved).toBe(0)
    expect(out.unknown).toBe(1)
    expect(out.errors).toHaveLength(1)
    expect(cap.applied).toHaveLength(0)
  })

  it('mixed batch counters: one fmp hit, one polygon fallback, one unknown', async () => {
    const cap: Capture = { applied: [] }
    const prof: Record<string, CompanyProfile | null> = {
      SPRC: profile({ country: 'IL', marketCap: 5, sector: 'Healthcare', industry: 'Biotechnology' }),
      AAPL: null,
      NADA: null,
    }
    const poly: Record<string, PolygonTickerRef> = {
      AAPL: { results: { address: { country: 'US' } } },
      NADA: {},
    }
    const out = await resolveCountriesForImport({
      symbols: ['SPRC', 'AAPL', 'NADA'],
      fetchProfile: async (s) => prof[s] ?? null,
      fetchRef: async (s) => poly[s] ?? {},
      applyToTrades: makeApply(cap),
    })
    expect(out).toMatchObject({ resolved: 2, unknown: 1, errors: [] })
    const bySym = Object.fromEntries(cap.applied.map((a) => [a.symbol, a.r.resolved.source]))
    expect(bySym).toEqual({ SPRC: 'fmp', AAPL: 'polygon', NADA: 'unknown' })
  })

  it('writes the FMP result (country + passengers) to the cache callback too', async () => {
    const trades: Capture = { applied: [] }
    const cache: Capture = { applied: [] }
    await resolveCountriesForImport({
      symbols: ['SPRC'],
      fetchProfile: async () =>
        profile({ country: 'IL', marketCap: 567401, sector: 'Healthcare', industry: 'Biotechnology' }),
      fetchRef: async () => ({}),
      applyToTrades: makeApply(trades),
      applyToCache: makeApply(cache),
    })
    expect(cache.applied[0].r.resolved).toMatchObject({ country: 'IL', source: 'fmp' })
    expect(cache.applied[0].r).toMatchObject({
      marketCap: 567401, sector: 'Healthcare', industry: 'Biotechnology',
    })
  })
})
