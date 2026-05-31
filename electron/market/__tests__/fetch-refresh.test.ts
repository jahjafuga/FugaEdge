import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.3 Commit B — pins existing-wins for sector/industry on the Polygon
// market-refresh path (electron/market/fetch.ts → fetchOne). The success path
// used to pass details.sector (Polygon SIC text) straight into the sector
// column, clobbering the clean FMP sector Stage A / import wrote. Commit A's
// COALESCE stopped the *null* wipe but cannot stop a *non-null* SIC value from
// winning; B reads the existing row first and resolves existing-wins.
//
// First coverage of refreshMarketData. Test infra composes two existing
// patterns: the import-side in-memory market_data shim (import/__tests__/
// backfill-profile.test.ts) for the repo half, and the intraday-refresh tests'
// massive + getSettings mocks (intraday-refresh-progress.test.ts) for the
// Polygon HTTP half.
//
// Shim models the SQL ON CONFLICT COALESCE semantics introduced by
// Commit A for the guarded columns (sector / industry / country /
// country_name / region). Test (d) exercises the preservation path
// on a failing refresh. better-sqlite3's native binary won't load under
// vitest, so the shim is a principled model of well-known SQL semantics,
// not a verified mirror of a specific sandbox run.

interface MarketDbRow {
  symbol: string
  float: number | null
  shares_outstanding: number | null
  market_cap: number | null
  sector: string | null
  industry: string | null
  avg_volume: number | null
  daily_volumes: string
  country: string | null
  country_name: string | null
  region: string | null
  fetched_at: string
  error: string | null
}

const SEED_FETCHED_AT = '2026-05-31T00:00:00.000Z'
const marketData = new Map<string, MarketDbRow>()

// Per-test Polygon mock state (mutated by each test before the action).
let refResult: { results?: Record<string, unknown> } = {}
let refError: Error | null = null

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

function seed(symbol: string, over: Partial<MarketDbRow> = {}): void {
  marketData.set(symbol, {
    symbol,
    float: null,
    shares_outstanding: null,
    market_cap: null,
    sector: null,
    industry: null,
    avg_volume: null,
    daily_volumes: '{}',
    country: 'US',
    country_name: 'United States',
    region: 'North America',
    fetched_at: SEED_FETCHED_AT,
    error: null,
    ...over,
  })
}

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { polygon_api_key: 'test-key' } }),
}))

vi.mock('@/core/country/resolve', () => ({
  resolveCountryFromPolygon: () => ({
    country: 'US',
    country_name: 'United States',
    region: 'North America',
  }),
}))

vi.mock('../massive', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../massive')>()
  return {
    ...actual, // keep real extractTickerDetails + MassiveError
    fetchTickerReference: vi.fn(async () => {
      if (refError) throw refError
      return refResult
    }),
    fetchDailyAggregates: vi.fn(async () => []),
  }
})

// db/database — stateful shim modeling `market_data` + the `trades` reads the
// refresh worklist issues. The upsert branch replicates repo.ts's post-Commit-A
// ON CONFLICT: guarded columns (sector/industry/country*) resolve
// `boundValue ?? existing`; everything else overwrites.
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      const q = norm(sql)

      // symbolsNeedingFetch(force=true) → SELECT DISTINCT symbol FROM trades …
      if (q.includes('DISTINCT symbol FROM trades')) {
        return { all: () => [...marketData.keys()].map((symbol) => ({ symbol })) }
      }

      // tradeDateRangePerSymbol → SELECT symbol, MIN(date) … FROM trades GROUP BY symbol
      if (q.includes('MIN(date)') && q.includes('FROM trades')) {
        return {
          all: () =>
            [...marketData.keys()].map((symbol) => ({
              symbol,
              from_date: '2026-05-01',
              to_date: '2026-05-02',
            })),
        }
      }

      // getMarketRow → SELECT … FROM market_data WHERE symbol = ?
      if (q.includes('FROM market_data WHERE symbol = ?')) {
        return { get: (symbol: string) => marketData.get(symbol) }
      }

      // upsertMarketRow → INSERT INTO market_data … ON CONFLICT DO UPDATE
      if (q.startsWith('INSERT INTO market_data')) {
        return {
          run: (params: MarketDbRow) => {
            const ex = marketData.get(params.symbol)
            const guard = (k: keyof MarketDbRow): string | null =>
              ((params[k] as string | null) ?? (ex?.[k] as string | null) ?? null)
            marketData.set(params.symbol, {
              ...params,
              sector: guard('sector'),
              industry: guard('industry'),
              country: guard('country'),
              country_name: guard('country_name'),
              region: guard('region'),
            })
            return { changes: 1 }
          },
        }
      }

      // getAllMarketRows fallback (not hit with force=true, but keep it honest)
      if (q.includes('FROM market_data')) {
        return { all: () => [...marketData.values()] }
      }

      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
  }),
}))

import { refreshMarketData } from '../fetch'
import { MassiveError } from '../massive'

beforeEach(() => {
  marketData.clear()
  refResult = {}
  refError = null
})

describe('refreshMarketData — sector/industry existing-wins (Commit B)', () => {
  it('case (a): a non-null Polygon SIC never overwrites an existing FMP sector/industry', async () => {
    seed('TEST', { sector: 'Healthcare', industry: 'Biotechnology' })
    refResult = { results: { sic_description: 'PHARMACEUTICAL PREPARATIONS', market_cap: 1234 } }

    await refreshMarketData({ force: true })

    const row = marketData.get('TEST')!
    expect(row.sector).toBe('Healthcare')        // SIC clobber blocked — the fix
    expect(row.industry).toBe('Biotechnology')   // FMP-only, preserved
  })

  it('case (b): a null Polygon sector preserves the existing FMP sector', async () => {
    seed('TEST', { sector: 'Healthcare', industry: 'Biotechnology' })
    refResult = { results: { market_cap: 1234 } } // no sic_description → details.sector null

    await refreshMarketData({ force: true })

    const row = marketData.get('TEST')!
    expect(row.sector).toBe('Healthcare')
    expect(row.industry).toBe('Biotechnology')
  })

  it('case (c): fills sector from Polygon when there is no existing sector', async () => {
    seed('TEST', { sector: null, industry: null })
    refResult = { results: { sic_description: 'PHARMACEUTICAL PREPARATIONS', market_cap: 1234 } }

    await refreshMarketData({ force: true })

    const row = marketData.get('TEST')!
    expect(row.sector).toBe('PHARMACEUTICAL PREPARATIONS') // acceptable fill-when-empty
    expect(row.industry).toBeNull()                        // Polygon has no industry
  })

  it('case (d): both null is a no-op for sector but still refreshes other fields', async () => {
    seed('TEST', { sector: null, industry: null, market_cap: null })
    refResult = { results: { market_cap: 9999 } } // no sic_description

    await refreshMarketData({ force: true })

    const row = marketData.get('TEST')!
    expect(row.sector).toBeNull()
    expect(row.industry).toBeNull()
    expect(row.market_cap).toBe(9999) // row was processed, not skipped
  })

  it('error path: a failed refresh leaves sector/industry intact and records the error', async () => {
    seed('TEST', {
      sector: 'Healthcare',
      industry: 'Biotechnology',
      market_cap: 500,
    })
    refError = new MassiveError('boom', 500, '/v3/reference/tickers/TEST')

    await refreshMarketData({ force: true })

    const row = marketData.get('TEST')!
    expect(row.sector).toBe('Healthcare')       // untouched via Commit A COALESCE
    expect(row.industry).toBe('Biotechnology')  // untouched
    expect(row.error).toContain('500')          // failure recorded
    expect(row.fetched_at).not.toBe(SEED_FETCHED_AT) // timestamp advanced
  })
})
