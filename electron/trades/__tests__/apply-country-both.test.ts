import { beforeEach, describe, expect, it, vi } from 'vitest'

// v0.2.3 Stage 1.5 — applyCountryToBoth writes trades + market_data in one
// transaction. better-sqlite3's native binary won't load under vitest, so we
// capture every prepare/run against a shim and assert the SQL *contract*:
//   - trades UPDATE keeps the manual guard,
//   - market_data UPDATE fires ONLY when trades changed, keyed by symbol, with
//     no country_source clause, writing country/country_name/region,
//   - the function returns the trades changes count.
// Real end-to-end behavior is smoke-verified on the sandbox DB (Phase 2).

interface Prepared {
  sql: string
  runArgs: unknown[]
}

let prepared: Prepared[] = []
let tradesChanges = 1 // configurable per test — what the trades UPDATE "changes"

const mockDb = {
  prepare(sql: string) {
    const rec: Prepared = { sql, runArgs: [] }
    prepared.push(rec)
    return {
      run: (...args: unknown[]) => {
        rec.runArgs = args
        // The trades UPDATE reports tradesChanges; market_data reports 0 (its
        // change count is irrelevant — applyCountryToBoth returns trades').
        return { changes: /UPDATE\s+trades/i.test(sql) ? tradesChanges : 0 }
      },
    }
  },
  // db.transaction(fn) returns a function that runs fn — mirror better-sqlite3.
  transaction(fn: () => unknown) {
    return () => fn()
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { applyCountryToBoth } from '../country'

const ARGS = {
  country: 'IL',
  country_name: 'Israel',
  region: 'Israel',
  source: 'fmp' as const,
}

beforeEach(() => {
  prepared = []
  tradesChanges = 1
})

describe('applyCountryToBoth — atomic trades + market_data write (Stage 1.5)', () => {
  it('(a) when trades changes > 0, fires BOTH updates in order: trades then market_data', () => {
    tradesChanges = 1
    applyCountryToBoth('SPRC', ARGS)
    expect(prepared).toHaveLength(2)
    expect(prepared[0].sql).toMatch(/UPDATE\s+trades/i)
    expect(prepared[1].sql).toMatch(/UPDATE\s+market_data/i)
  })

  it('(b) skips the market_data update when trades changes === 0', () => {
    tradesChanges = 0
    applyCountryToBoth('SPRC', ARGS)
    expect(prepared).toHaveLength(1)
    expect(prepared[0].sql).toMatch(/UPDATE\s+trades/i)
    expect(prepared.some((p) => /market_data/i.test(p.sql))).toBe(false)
  })

  it('(c) trades UPDATE preserves the manual guard', () => {
    applyCountryToBoth('SPRC', ARGS)
    expect(prepared[0].sql).toMatch(/country_source\s*!=\s*'manual'/i)
  })

  it('(d) market_data UPDATE is keyed WHERE symbol = ? with NO country_source clause', () => {
    applyCountryToBoth('SPRC', ARGS)
    const md = prepared[1]
    expect(md.sql).toMatch(/WHERE\s+symbol\s*=\s*\?/i)
    expect(md.sql).not.toMatch(/country_source/i) // market_data has no such column
  })

  it('(e) writes country, country_name, region to market_data (symbol last)', () => {
    applyCountryToBoth('SPRC', ARGS)
    const md = prepared[1]
    expect(md.sql).toMatch(/SET\s+country\s*=\s*\?,\s*country_name\s*=\s*\?,\s*region\s*=\s*\?/i)
    expect(md.runArgs).toEqual(['IL', 'Israel', 'Israel', 'SPRC'])
  })

  it('(f) returns the number of trades rows changed', () => {
    tradesChanges = 3
    expect(applyCountryToBoth('SPRC', ARGS)).toBe(3)
  })
})
