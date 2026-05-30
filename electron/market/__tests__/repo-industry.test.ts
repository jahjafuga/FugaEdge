import { describe, it, expect, beforeEach, vi } from 'vitest'

// v0.2.3 Stage 2 — proves market_data.industry round-trips through the repo:
// it's bound on the way IN (upsertMarketRow) and SELECTed on the way OUT
// (getMarketRow → rowToMarket). The read path is the easy one to forget —
// without `industry` in the SELECT list it would write but never read back.
//
// better-sqlite3's native binary won't load under vitest (built for Electron's
// ABI), so we mock '../db/database' with a shim that captures the prepared SQL
// and bound params, and feeds a canned row back. Same approach as
// intraday-needing-fetch.test.ts.

interface Prepared {
  sql: string
  runArgs: unknown[]
  getArgs: unknown[]
}

let prepared: Prepared[] = []
let cannedGetRow: Record<string, unknown> | undefined

const mockDb = {
  prepare(sql: string) {
    const rec: Prepared = { sql, runArgs: [], getArgs: [] }
    prepared.push(rec)
    return {
      run: (...args: unknown[]) => {
        rec.runArgs = args
        return { changes: 1 }
      },
      get: (...args: unknown[]) => {
        rec.getArgs = args
        return cannedGetRow
      },
      all: () => (cannedGetRow ? [cannedGetRow] : []),
    }
  },
}

vi.mock('../../db/database', () => ({
  openDatabase: () => mockDb,
  getDbPath: () => ':memory:',
}))

import { getMarketRow, getAllMarketRows, upsertMarketRow, type MarketRow } from '../repo'

function fullRow(over: Partial<MarketRow> = {}): MarketRow {
  return {
    symbol: 'SPRC',
    float: null,
    shares_outstanding: null,
    market_cap: 567401,
    sector: 'Healthcare',
    industry: 'Biotechnology',
    avg_volume: null,
    daily_volumes: {},
    country: 'IL',
    country_name: 'Israel',
    region: 'Israel',
    fetched_at: '2026-05-31T00:00:00.000Z',
    error: null,
    ...over,
  }
}

beforeEach(() => {
  prepared = []
  cannedGetRow = undefined
})

describe('market repo — industry round-trip (Stage 2)', () => {
  it('upsertMarketRow includes industry in the INSERT column list and binds it', () => {
    upsertMarketRow(fullRow({ industry: 'Semiconductors' }))
    const insert = prepared.find((p) => /INSERT INTO market_data/i.test(p.sql))
    expect(insert).toBeDefined()
    expect(insert!.sql).toMatch(/\bindustry\b/)
    // ON CONFLICT keeps it (COALESCE so a refresh's null doesn't wipe it).
    expect(insert!.sql).toMatch(/industry\s*=\s*COALESCE\(excluded\.industry/i)
    // Bound param carries the value.
    const params = insert!.runArgs[0] as Record<string, unknown>
    expect(params.industry).toBe('Semiconductors')
  })

  it('getMarketRow SELECTs industry and maps it through (read path works)', () => {
    cannedGetRow = {
      symbol: 'SPRC', float: null, shares_outstanding: null,
      market_cap: 567401, sector: 'Healthcare', industry: 'Biotechnology',
      avg_volume: null, daily_volumes: '{}', country: 'IL',
      country_name: 'Israel', region: 'Israel',
      fetched_at: '2026-05-31T00:00:00.000Z', error: null,
    }
    const row = getMarketRow('SPRC')
    const select = prepared.find((p) => /SELECT .* FROM market_data/is.test(p.sql))
    expect(select!.sql).toMatch(/\bindustry\b/)   // would be dropped if missing
    expect(row?.industry).toBe('Biotechnology')
  })

  it('getAllMarketRows SELECTs industry too', () => {
    cannedGetRow = {
      symbol: 'X', float: null, shares_outstanding: null,
      market_cap: null, sector: null, industry: 'Marine Shipping',
      avg_volume: null, daily_volumes: '{}', country: null,
      country_name: null, region: null,
      fetched_at: '2026-05-31T00:00:00.000Z', error: null,
    }
    const rows = getAllMarketRows()
    const select = prepared.find((p) => /SELECT .* FROM market_data/is.test(p.sql))
    expect(select!.sql).toMatch(/\bindustry\b/)
    expect(rows[0].industry).toBe('Marine Shipping')
  })

  it('a null industry round-trips as null (not dropped/undefined)', () => {
    cannedGetRow = {
      symbol: 'X', float: null, shares_outstanding: null,
      market_cap: null, sector: null, industry: null,
      avg_volume: null, daily_volumes: '{}', country: null,
      country_name: null, region: null,
      fetched_at: '2026-05-31T00:00:00.000Z', error: null,
    }
    expect(getMarketRow('X')?.industry).toBeNull()
  })
})
