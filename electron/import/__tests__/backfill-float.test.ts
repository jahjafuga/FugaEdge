// v0.2.2 — standalone float backfill over EXISTING trades (not an import
// side effect). backfillAllFloat fetches real FMP float for every distinct
// symbol that still has a NULL-float trade, then propagates via the existing
// backfillFloatShares primitive.
//
// LOAD-BEARING PROPERTIES these tests pin:
//   (a) a NULL float_shares is filled from FMP floatShares.
//   (b) an EXISTING non-null float_shares is NEVER overwritten — the manual-
//       override protection. This lives in backfillFloatShares' SQL
//       (`WHERE float_shares IS NULL`); the test runs the REAL primitive
//       against the shim and the shim honors whatever WHERE clauses the
//       production SQL string actually carries, so dropping the NULL guard
//       in production makes test (b) fail.
//   (c) FMP-has-no-float symbols (LABT case) stay NULL and are NAMED in
//       unavailableSymbols so the user knows which to fill manually.
//
// Test infra: same constraint as migrate-float-rename.test.ts and
// country-manual.test.ts — better-sqlite3's native binary won't load under
// vitest, so a stateful shim models the `trades` table and the real repo SQL
// runs against it. market_data is held in a shared map that both the mocked
// market/repo and the shim's backfill JOIN read from. Real end-to-end SQLite
// execution is smoke-verified by the user on the live 53-trade DB before commit.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Shared in-memory state ──────────────────────────────────────────────────

interface TradeRow {
  id: number
  symbol: string
  float_shares: number | null
  shares_outstanding: number | null
}
interface MarketRowLite {
  symbol: string
  float: number | null
  shares_outstanding: number | null
  market_cap: number | null
  sector: string | null
  avg_volume: number | null
  daily_volumes: Record<string, number>
  country: string | null
  country_name: string | null
  region: string | null
  fetched_at: string
  error: string | null
}

let trades: TradeRow[] = []
const marketData = new Map<string, MarketRowLite>()
let fmpKey = 'test-key'

function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim()
}

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/services/fmp', () => ({ fetchSharesFloat: vi.fn() }))

vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { fmp_api_key: fmpKey, polygon_api_key: '' }, db_path: '' }),
}))

// market/repo — getMarketRow / upsertMarketRow over the shared map.
vi.mock('../../market/repo', () => ({
  getMarketRow: (symbol: string) => marketData.get(symbol) ?? null,
  upsertMarketRow: (row: MarketRowLite) => {
    marketData.set(row.symbol, { ...row })
  },
}))

// db/database — a stateful shim. It models the `trades` table and faithfully
// executes the REAL SQL strings the repo primitives issue. Crucially, the
// UPDATE handler honors whatever WHERE clauses are present in the production
// SQL string: it only applies the NULL guard when the SQL itself contains
// `float_shares IS NULL`. So a regression that drops that guard from
// production SQL would let the manual row be overwritten and fail test (b).
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      const q = norm(sql)

      // symbolsNeedingFloatFetch — distinct symbols with a NULL-float trade.
      if (q.startsWith('SELECT DISTINCT symbol FROM trades') && q.includes('float_shares IS NULL')) {
        return {
          all: () => {
            const set = new Set<string>()
            for (const t of trades) if (t.float_shares === null) set.add(t.symbol)
            return [...set].sort().map((symbol) => ({ symbol }))
          },
        }
      }

      // backfillFloatShares — UPDATE trades SET float_shares = (market_data.float)
      if (q.includes('UPDATE trades') && q.includes('SET float_shares')) {
        const guardsNull = q.includes('float_shares IS NULL')
        const requiresMarketFloat = q.includes('m.float IS NOT NULL')
        const filtersSymbols = q.includes('t.symbol IN')
        return {
          run: (...args: unknown[]) => {
            const allow = new Set(args as string[])
            let changes = 0
            for (const t of trades) {
              if (guardsNull && t.float_shares !== null) continue
              if (filtersSymbols && !allow.has(t.symbol)) continue
              const m = marketData.get(t.symbol)
              if (requiresMarketFloat && (!m || m.float === null)) continue
              if (!m || m.float === null) continue
              t.float_shares = Math.floor(m.float)
              changes++
            }
            return { changes, lastInsertRowid: 0 }
          },
        }
      }

      // backfillSharesOutstanding — mirror, for shares_outstanding.
      if (q.includes('UPDATE trades') && q.includes('SET shares_outstanding')) {
        const guardsNull = q.includes('shares_outstanding IS NULL')
        const requiresMarket = q.includes('m.shares_outstanding IS NOT NULL')
        const filtersSymbols = q.includes('t.symbol IN')
        return {
          run: (...args: unknown[]) => {
            const allow = new Set(args as string[])
            let changes = 0
            for (const t of trades) {
              if (guardsNull && t.shares_outstanding !== null) continue
              if (filtersSymbols && !allow.has(t.symbol)) continue
              const m = marketData.get(t.symbol)
              if (requiresMarket && (!m || m.shares_outstanding === null)) continue
              if (!m || m.shares_outstanding === null) continue
              t.shares_outstanding = Math.floor(m.shares_outstanding)
              changes++
            }
            return { changes, lastInsertRowid: 0 }
          },
        }
      }

      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
  }),
}))

import { fetchSharesFloat } from '@/services/fmp'
import { backfillAllFloat } from '../backfill-float'

const fmpMock = fetchSharesFloat as unknown as ReturnType<typeof vi.fn>

function fmpReturns(map: Record<string, { floatShares: number | null; outstandingShares: number | null }>) {
  fmpMock.mockImplementation(async (_key: string, symbol: string) => {
    const r = map[symbol]
    return r
      ? { floatShares: r.floatShares, outstandingShares: r.outstandingShares, freeFloatPercent: null }
      : { floatShares: null, outstandingShares: null, freeFloatPercent: null }
  })
}

beforeEach(() => {
  marketData.clear()
  fmpMock.mockReset()
  fmpKey = 'test-key'
  // CLIK: one NULL trade (to fill) + one manual-override trade on the SAME
  // symbol (must be protected). LABT: NULL trade, FMP has no float.
  trades = [
    { id: 1, symbol: 'CLIK', float_shares: null, shares_outstanding: null },
    { id: 2, symbol: 'CLIK', float_shares: 5_000_000, shares_outstanding: null },
    { id: 3, symbol: 'LABT', float_shares: null, shares_outstanding: null },
  ]
})

// ── Tests ───────────────────────────────────────────────────────────────────

describe('backfillAllFloat — standalone float backfill over existing trades', () => {
  it('(a) fills a NULL float_shares from FMP floatShares', async () => {
    fmpReturns({
      CLIK: { floatShares: 132507, outstandingShares: 632201 },
      LABT: { floatShares: null, outstandingShares: 4689177 },
    })

    const result = await backfillAllFloat()

    expect(trades.find((t) => t.id === 1)!.float_shares).toBe(132507)
    expect(result.attempted).toBe(2) // CLIK + LABT (distinct null-float symbols)
    expect(result.filled).toBe(1) // CLIK
  })

  it('(b) does NOT overwrite an existing non-null float_shares (manual override protection)', async () => {
    fmpReturns({
      CLIK: { floatShares: 132507, outstandingShares: 632201 },
      LABT: { floatShares: null, outstandingShares: 4689177 },
    })

    await backfillAllFloat()

    // Trade 2 carries a manual 5,000,000 override on the SAME symbol that got
    // fetched. The NULL-guard in backfillFloatShares' SQL must leave it intact.
    expect(trades.find((t) => t.id === 2)!.float_shares).toBe(5_000_000)
  })

  it('(c) names FMP-has-no-float symbols as unavailable (stay NULL)', async () => {
    fmpReturns({
      CLIK: { floatShares: 132507, outstandingShares: 632201 },
      LABT: { floatShares: null, outstandingShares: 4689177 },
    })

    const result = await backfillAllFloat()

    expect(trades.find((t) => t.id === 3)!.float_shares).toBeNull()
    expect(result.unavailable).toBe(1)
    expect(result.unavailableSymbols).toEqual(['LABT'])
  })

  it('returns apiKeyMissing without fetching when no FMP key is set', async () => {
    fmpKey = ''
    fmpReturns({})

    const result = await backfillAllFloat()

    expect(result.apiKeyMissing).toBe(true)
    expect(result.attempted).toBe(0)
    expect(fetchSharesFloat).not.toHaveBeenCalled()
  })
})
