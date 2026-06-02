// v0.2.3 Stage A — one-off FMP /stable/profile backfill that writes clean
// sector + industry onto EXISTING market_data rows. Mirrors backfill-float.ts:
// user-triggered from Settings → Data backfill, independent of country/float.
//
// LOAD-BEARING PROPERTIES these tests pin:
//   (a) idempotency — a row whose industry IS already non-null is SKIPPED (only
//       Stage A writes industry, so non-null industry == "already done"). The
//       skip is enforced by the REAL worklist SQL (`WHERE industry IS NULL`),
//       which runs through the db shim below — drop that guard in production and
//       the idempotency test fails.
//   (b) force=true re-fetches every row regardless of industry.
//   (c) null profile (FMP has no data) leaves the row UNTOUCHED — upsert is NOT
//       called for it, sector/industry/all other columns are byte-for-byte
//       preserved, and the symbol is NAMED in unavailableSymbols.
//   (d) partial hit (sector present, industry null) WRITES sector but the row
//       stays in unavailableSymbols (industry still null) so it retries next run.
//   (e) apiKeyMissing short-circuits before any fetch.
//
// Test infra mirrors backfill-float.test.ts / repo-industry.test.ts: better-
// sqlite3's native binary won't load under vitest, so a stateful shim models the
// `market_data` table and executes the REAL repo SQL (worklist SELECT,
// getMarketRow SELECT, upsertMarketRow INSERT…ON CONFLICT) against an in-memory
// map. Real end-to-end SQLite is smoke-verified on the sandbox DB before commit.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Shared in-memory state ──────────────────────────────────────────────────

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

const marketData = new Map<string, MarketDbRow>()
const upsertedSymbols: string[] = []
let fmpKey = 'test-key'

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
    country: null,
    country_name: null,
    region: null,
    fetched_at: '2026-05-31T00:00:00.000Z',
    error: null,
    ...over,
  })
}

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/services/fmp', () => ({ fetchCompanyProfile: vi.fn() }))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { fmp_api_key: fmpKey, polygon_api_key: '' }, db_path: '' }),
}))

// db/database — stateful shim modeling `market_data`. Executes the REAL SQL the
// repo issues. The worklist's `WHERE industry IS NULL` guard is honored only
// when the production SQL string actually contains it, so a regression that
// drops the guard makes the idempotency test fail.
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      const q = norm(sql)

      // Worklist — SELECT symbol FROM market_data [WHERE industry IS NULL] ...
      if (/^SELECT symbol FROM market_data/i.test(q)) {
        const guardsNullIndustry = /industry IS NULL/i.test(q)
        return {
          all: () => {
            const rows = [...marketData.values()]
              .filter((r) => (guardsNullIndustry ? r.industry === null : true))
              .sort((a, b) => a.symbol.localeCompare(b.symbol))
            return rows.map((r) => ({ symbol: r.symbol }))
          },
        }
      }

      // getMarketRow — SELECT symbol, float, ... FROM market_data WHERE symbol = ?
      if (/^SELECT symbol, float/i.test(q) && /WHERE symbol = \?/i.test(q)) {
        return {
          get: (symbol: string) => marketData.get(symbol),
        }
      }

      // upsertMarketRow — INSERT INTO market_data (...) ON CONFLICT DO UPDATE.
      // The core resolves every column in JS (sector/industry via ?? existing),
      // so storing the bound row verbatim is faithful. We record which symbols
      // were upserted so "null leaves the row untouched" can assert NO upsert.
      if (/^INSERT INTO market_data/i.test(q)) {
        return {
          run: (params: Record<string, unknown>) => {
            const p = params as unknown as MarketDbRow
            upsertedSymbols.push(p.symbol)
            marketData.set(p.symbol, { ...p })
            return { changes: 1, lastInsertRowid: 0 }
          },
        }
      }

      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
  }),
}))

import { fetchCompanyProfile } from '@/services/fmp'
import { backfillAllProfiles } from '../backfill-profile'

const fmpMock = fetchCompanyProfile as unknown as ReturnType<typeof vi.fn>

interface ProfileLite {
  country: string | null
  marketCap: number | null
  sector: string | null
  industry: string | null
}

function fmpReturns(map: Record<string, ProfileLite | null>): void {
  fmpMock.mockImplementation(async (_key: string, symbol: string) =>
    symbol in map ? map[symbol] : null,
  )
}

beforeEach(() => {
  marketData.clear()
  upsertedSymbols.length = 0
  fmpMock.mockReset()
  fmpKey = 'test-key'
  // AMPG/JFB carry stale SIC sector text + null industry (must be processed and
  // overwritten). AMSS has nothing. DONE already has industry (must be skipped).
  seed('AMPG', {
    sector: 'COMMUNICATIONS EQUIPMENT, NEC',
    industry: null,
    country: 'US',
    float: 1_000,
    daily_volumes: '{"2026-05-01":123}',
    market_cap: 5,
  })
  seed('AMSS', { sector: null, industry: null, float: 2_000, country: 'CN' })
  seed('JFB', { sector: 'GENERAL BLDG CONTRACTORS - NONRESIDENTIAL BLDGS', industry: null })
  seed('DONE', { sector: 'Healthcare', industry: 'Biotechnology' })
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('backfillAllProfiles — Stage A sector/industry backfill', () => {
  it('(a) idempotency: skips rows whose industry is already non-null', async () => {
    fmpReturns({
      AMPG: { country: null, marketCap: null, sector: 'Technology', industry: 'Communication Equipment' },
      AMSS: { country: null, marketCap: null, sector: 'Energy', industry: 'Oil & Gas' },
      JFB: { country: null, marketCap: null, sector: 'Industrials', industry: 'Engineering & Construction' },
      DONE: { country: null, marketCap: null, sector: 'SHOULD-NOT', industry: 'SHOULD-NOT' },
    })

    const result = await backfillAllProfiles()

    // DONE already had industry → never fetched, never upserted, unchanged.
    expect(fetchCompanyProfile).not.toHaveBeenCalledWith('test-key', 'DONE')
    expect(upsertedSymbols).not.toContain('DONE')
    expect(marketData.get('DONE')!.sector).toBe('Healthcare')
    expect(marketData.get('DONE')!.industry).toBe('Biotechnology')
    // The three industry-NULL rows were attempted.
    expect(result.attempted).toBe(3)
    expect(result.filled).toBe(3)
  })

  it('(a2) writes FMP sector + industry, overwriting stale SIC sector', async () => {
    fmpReturns({
      AMPG: { country: null, marketCap: null, sector: 'Technology', industry: 'Communication Equipment' },
      AMSS: null,
      JFB: null,
    })

    await backfillAllProfiles()

    expect(marketData.get('AMPG')!.sector).toBe('Technology')
    expect(marketData.get('AMPG')!.industry).toBe('Communication Equipment')
  })

  it('(a3) preserves every other market_data column on a hit (read-modify-write)', async () => {
    fmpReturns({
      AMSS: { country: null, marketCap: null, sector: 'Energy', industry: 'Oil & Gas Midstream' },
      AMPG: null,
      JFB: null,
    })

    await backfillAllProfiles()

    const row = marketData.get('AMSS')!
    expect(row.sector).toBe('Energy')
    expect(row.industry).toBe('Oil & Gas Midstream')
    // Untouched passengers — country/float must survive the upsert.
    expect(row.float).toBe(2_000)
    expect(row.country).toBe('CN')
  })

  it('(b) force=true re-fetches rows that already have industry', async () => {
    fmpReturns({
      AMPG: null,
      AMSS: null,
      JFB: null,
      DONE: { country: null, marketCap: null, sector: 'Financials', industry: 'Banks' },
    })

    await backfillAllProfiles({ force: true })

    expect(fetchCompanyProfile).toHaveBeenCalledWith('test-key', 'DONE')
    expect(marketData.get('DONE')!.sector).toBe('Financials')
    expect(marketData.get('DONE')!.industry).toBe('Banks')
  })

  it('(c) null profile leaves the row UNTOUCHED and names it unavailable', async () => {
    const before = { ...marketData.get('AMPG')! }
    fmpReturns({ AMPG: null, AMSS: null, JFB: null })

    const result = await backfillAllProfiles()

    // No upsert for AMPG; the SIC sector + null industry + all passengers intact.
    expect(upsertedSymbols).not.toContain('AMPG')
    expect(marketData.get('AMPG')).toEqual(before)
    expect(result.unavailableSymbols).toContain('AMPG')
    expect(result.unavailable).toBe(3)
    expect(result.filled).toBe(0)
  })

  it('(d) partial hit: sector written, industry null → still unavailable, retried next run', async () => {
    fmpReturns({
      JFB: { country: null, marketCap: null, sector: 'Industrials', industry: null },
      AMPG: null,
      AMSS: null,
    })

    const result = await backfillAllProfiles()

    // Sector was written...
    expect(marketData.get('JFB')!.sector).toBe('Industrials')
    // ...but industry is still null, so the symbol is unavailable and would be
    // picked up again by a non-force worklist (industry IS NULL).
    expect(marketData.get('JFB')!.industry).toBeNull()
    expect(result.unavailableSymbols).toContain('JFB')
  })

  it('(e) apiKeyMissing: returns early without fetching when no FMP key is set', async () => {
    fmpKey = ''
    fmpReturns({})

    const result = await backfillAllProfiles()

    expect(result.apiKeyMissing).toBe(true)
    expect(result.attempted).toBe(0)
    expect(fetchCompanyProfile).not.toHaveBeenCalled()
  })
})
