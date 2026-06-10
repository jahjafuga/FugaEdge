import { describe, it, expect, beforeEach, vi } from 'vitest'

// Beat 2.2a — repo extension for the warmup backfill (v0.2.4 §K). TDD.
//
// Two surfaces under test:
//   1. IntradayRow.warmup_attempted_at round-trips through upsertIntradayRow
//      (bound on INSERT + carried in ON CONFLICT) and getIntradayRow (SELECTed +
//      mapped) — the exact mirror of repo-industry.test.ts's market_data.industry
//      round-trip (write path is easy to remember; the read path is the one that
//      silently drops a column if it's missing from the SELECT list).
//   2. warmupKeysNeedingFetch — the §K eligibility worklist. Per the locked
//      "Option C" design it computes bar-emptiness as SQL booleans (has_bars /
//      warmup_empty) and filters in JS, so the selection logic is unit-testable
//      with canned rows (mirrors intraday-needing-fetch.test.ts's JS-filter).
//
// better-sqlite3's native binary won't load under vitest (built for Electron's
// ABI), so '../../db/database' is mocked with a shim that BOTH captures the
// prepared SQL + bound params (round-trip assertions) AND feeds canned rows to
// .all() (worklist assertions). Same approach as repo-industry.test.ts /
// intraday-needing-fetch.test.ts.
//
// repo is imported as a namespace so warmupKeysNeedingFetch — not yet exported
// during the RED phase — surfaces as `undefined` and fails each worklist test
// with "is not a function", instead of a missing-named-export collection crash.

interface Prepared {
  sql: string
  runArgs: unknown[]
  getArgs: unknown[]
}

let prepared: Prepared[] = []
let cannedGetRow: Record<string, unknown> | undefined
let cannedAllRows: Record<string, unknown>[] = []

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
      all: () => cannedAllRows,
    }
  },
}

vi.mock('../../db/database', () => ({
  openDatabase: () => mockDb,
  getDbPath: () => ':memory:',
}))

import * as repo from '../repo'
import type { IntradayRow } from '../repo'

const bar = (t: number) => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 })

function fullIntradayRow(over: Partial<IntradayRow> = {}): IntradayRow {
  return {
    symbol: 'AAA',
    date: '2026-05-01',
    bars: [bar(1)],
    warmup_bars: [],
    fetched_at: '2026-05-01T00:00:00.000Z',
    error: null,
    ...over,
  }
}

beforeEach(() => {
  prepared = []
  cannedGetRow = undefined
  cannedAllRows = []
})

describe('IntradayRow.warmup_attempted_at round-trip via upsert/get', () => {
  it('upsertIntradayRow binds warmup_attempted_at into the INSERT when set', () => {
    repo.upsertIntradayRow(fullIntradayRow({ warmup_attempted_at: '2026-06-09T00:00:00.000Z' }))
    const insert = prepared.find((p) => /INSERT INTO intraday_bars/i.test(p.sql))
    expect(insert).toBeDefined()
    expect(insert!.sql).toMatch(/\bwarmup_attempted_at\b/)
    // ON CONFLICT must carry it too, else a re-upsert wouldn't refresh the marker.
    expect(insert!.sql).toMatch(/warmup_attempted_at\s*=\s*excluded\.warmup_attempted_at/i)
    const params = insert!.runArgs[0] as Record<string, unknown>
    expect(params.warmup_attempted_at).toBe('2026-06-09T00:00:00.000Z')
  })

  it('upsertIntradayRow binds null when warmup_attempted_at is absent (existing callers)', () => {
    repo.upsertIntradayRow(fullIntradayRow())
    const insert = prepared.find((p) => /INSERT INTO intraday_bars/i.test(p.sql))
    expect(insert).toBeDefined()
    const params = insert!.runArgs[0] as Record<string, unknown>
    expect(params.warmup_attempted_at).toBeNull()
  })

  it('getIntradayRow SELECTs warmup_attempted_at and maps a NULL through as null', () => {
    cannedGetRow = {
      symbol: 'AAA', date: '2026-05-01', bars: '[]', warmup_bars: null,
      fetched_at: '2026-05-01T00:00:00.000Z', error: null, warmup_attempted_at: null,
    }
    const row = repo.getIntradayRow('AAA', '2026-05-01')
    const select = prepared.find((p) => /SELECT .* FROM intraday_bars WHERE symbol/is.test(p.sql))
    expect(select).toBeDefined()
    expect(select!.sql).toMatch(/\bwarmup_attempted_at\b/)
    expect(row!.warmup_attempted_at).toBeNull()
  })

  it('getIntradayRow returns warmup_attempted_at as the ISO string when set', () => {
    cannedGetRow = {
      symbol: 'AAA', date: '2026-05-01', bars: '[]', warmup_bars: null,
      fetched_at: '2026-05-01T00:00:00.000Z', error: null,
      warmup_attempted_at: '2026-06-09T12:00:00.000Z',
    }
    const row = repo.getIntradayRow('AAA', '2026-05-01')
    expect(row!.warmup_attempted_at).toBe('2026-06-09T12:00:00.000Z')
  })
})

describe('warmupKeysNeedingFetch', () => {
  // A row that passes every eligibility clause; each test perturbs one field.
  const eligible = (over: Record<string, unknown> = {}) => ({
    symbol: 'AAA', date: '2026-05-01',
    warmup_attempted_at: null, error: null, has_bars: 1, warmup_empty: 1,
    ...over,
  })

  it('empty intraday_bars → returns []', () => {
    cannedAllRows = []
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('eligible row (never attempted, no error, has bars, warmup empty) → returned', () => {
    cannedAllRows = [eligible()]
    expect(repo.warmupKeysNeedingFetch()).toEqual([{ symbol: 'AAA', date: '2026-05-01' }])
  })

  it('warmup_attempted_at set (an ISO string) → NOT returned', () => {
    cannedAllRows = [eligible({ warmup_attempted_at: '2026-06-09T00:00:00.000Z' })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('error set → NOT returned', () => {
    cannedAllRows = [eligible({ error: '429: 429 Too Many Requests' })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('has_bars = 0 (bars = "[]") → NOT returned', () => {
    cannedAllRows = [eligible({ has_bars: 0 })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('warmup_empty = 0 (warmup already populated) → NOT returned', () => {
    cannedAllRows = [eligible({ warmup_empty: 0 })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('mixed rows → only the eligible one is returned', () => {
    cannedAllRows = [
      eligible({ symbol: 'ELIG', date: '2026-05-03' }),
      eligible({ symbol: 'DONE', date: '2026-05-02', warmup_attempted_at: '2026-06-09T00:00:00.000Z' }),
      eligible({ symbol: 'NOBARS', date: '2026-05-01', has_bars: 0 }),
      eligible({ symbol: 'HASWARM', date: '2026-05-04', warmup_empty: 0 }),
    ]
    expect(repo.warmupKeysNeedingFetch()).toEqual([{ symbol: 'ELIG', date: '2026-05-03' }])
  })

  it('orders by date DESC (SQL clause pinned; JS preserves row order)', () => {
    cannedAllRows = [
      eligible({ symbol: 'A', date: '2026-05-03' }),
      eligible({ symbol: 'B', date: '2026-05-02' }),
      eligible({ symbol: 'C', date: '2026-05-01' }),
    ]
    expect(repo.warmupKeysNeedingFetch()).toEqual([
      { symbol: 'A', date: '2026-05-03' },
      { symbol: 'B', date: '2026-05-02' },
      { symbol: 'C', date: '2026-05-01' },
    ])
    // The mock .all() can't sort, so pin the ORDER BY directive in the SQL itself.
    const select = prepared.find((p) => /FROM intraday_bars/i.test(p.sql) && /ORDER BY/i.test(p.sql))
    expect(select).toBeDefined()
    expect(select!.sql).toMatch(/ORDER BY\s+date DESC,\s*symbol ASC/i)
  })
})

describe('tradeCountsByKey', () => {
  it('empty keys → {} (no query)', () => {
    expect(repo.tradeCountsByKey([])).toEqual({})
    expect(prepared.find((p) => /FROM trades/i.test(p.sql))).toBeUndefined()
  })

  it('SQL filters deleted_at IS NULL and groups by symbol, date', () => {
    cannedAllRows = []
    repo.tradeCountsByKey([{ symbol: 'AAA', date: '2026-06-01' }])
    const sel = prepared.find((p) => /FROM trades/i.test(p.sql))
    expect(sel).toBeDefined()
    expect(sel!.sql).toMatch(/deleted_at IS NULL/i)
    expect(sel!.sql).toMatch(/GROUP BY\s+symbol,\s*date/i)
  })

  it('returns a key→count map for worklist keys present in the grouped rows', () => {
    cannedAllRows = [
      { symbol: 'AAA', date: '2026-06-01', n: 3 },
      { symbol: 'BBB', date: '2026-06-02', n: 1 },
    ]
    expect(
      repo.tradeCountsByKey([
        { symbol: 'AAA', date: '2026-06-01' },
        { symbol: 'BBB', date: '2026-06-02' },
      ]),
    ).toEqual({ 'AAA|2026-06-01': 3, 'BBB|2026-06-02': 1 })
  })

  it('excludes grouped rows whose (symbol, date) is not in the worklist', () => {
    cannedAllRows = [
      { symbol: 'AAA', date: '2026-06-01', n: 3 },
      { symbol: 'OTHER', date: '2026-06-09', n: 5 },
    ]
    expect(repo.tradeCountsByKey([{ symbol: 'AAA', date: '2026-06-01' }])).toEqual({
      'AAA|2026-06-01': 3,
    })
  })

  it('a worklist key with no matching trade group is absent from the result', () => {
    cannedAllRows = [{ symbol: 'AAA', date: '2026-06-01', n: 2 }]
    const out = repo.tradeCountsByKey([
      { symbol: 'AAA', date: '2026-06-01' },
      { symbol: 'GHOST', date: '2026-06-03' },
    ])
    expect(out).toEqual({ 'AAA|2026-06-01': 2 })
    expect(out['GHOST|2026-06-03']).toBeUndefined()
  })
})

describe('IntradayRow.warmup_error round-trip via upsert/get', () => {
  it('upsertIntradayRow binds warmup_error into the INSERT when set', () => {
    repo.upsertIntradayRow(fullIntradayRow({ warmup_error: '429: 429 Too Many Requests' }))
    const insert = prepared.find((p) => /INSERT INTO intraday_bars/i.test(p.sql))
    expect(insert).toBeDefined()
    expect(insert!.sql).toMatch(/\bwarmup_error\b/)
    // ON CONFLICT must carry it too, else a re-upsert wouldn't refresh the error.
    expect(insert!.sql).toMatch(/warmup_error\s*=\s*excluded\.warmup_error/i)
    const params = insert!.runArgs[0] as Record<string, unknown>
    expect(params.warmup_error).toBe('429: 429 Too Many Requests')
  })

  it('upsertIntradayRow binds null when warmup_error is absent (existing callers)', () => {
    repo.upsertIntradayRow(fullIntradayRow())
    const insert = prepared.find((p) => /INSERT INTO intraday_bars/i.test(p.sql))
    expect(insert).toBeDefined()
    const params = insert!.runArgs[0] as Record<string, unknown>
    expect(params.warmup_error).toBeNull()
  })

  it('getIntradayRow SELECTs warmup_error and maps a NULL through as null', () => {
    cannedGetRow = {
      symbol: 'AAA', date: '2026-05-01', bars: '[]', warmup_bars: null,
      fetched_at: '2026-05-01T00:00:00.000Z', error: null,
      warmup_attempted_at: null, warmup_error: null,
    }
    const row = repo.getIntradayRow('AAA', '2026-05-01')
    const select = prepared.find((p) => /SELECT .* FROM intraday_bars WHERE symbol/is.test(p.sql))
    expect(select).toBeDefined()
    expect(select!.sql).toMatch(/\bwarmup_error\b/)
    expect(row!.warmup_error).toBeNull()
  })

  it('getIntradayRow returns warmup_error as the message string when set', () => {
    cannedGetRow = {
      symbol: 'AAA', date: '2026-05-01', bars: '[]', warmup_bars: null,
      fetched_at: '2026-05-01T00:00:00.000Z', error: null,
      warmup_attempted_at: '2026-06-10T00:00:00.000Z', warmup_error: 'network: timeout',
    }
    const row = repo.getIntradayRow('AAA', '2026-05-01')
    expect(row!.warmup_error).toBe('network: timeout')
  })
})

describe('warmupKeysNeedingFetch — error retry predicate (§K.1)', () => {
  // Mirrors the §K `eligible` helper but carries the warmup_error column the
  // §K.1 SELECT now fetches. Defaults to a legit-empty key (attempted, no error).
  const row = (over: Record<string, unknown> = {}) => ({
    symbol: 'AAA', date: '2026-05-01',
    warmup_attempted_at: '2026-06-10T00:00:00.000Z', warmup_error: null,
    error: null, has_bars: 1, warmup_empty: 1,
    ...over,
  })

  it('attempted + warmup_error SET → returned (errored key re-enters the worklist)', () => {
    cannedAllRows = [row({ warmup_error: '429: rate limited' })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([{ symbol: 'AAA', date: '2026-05-01' }])
  })

  it('attempted + warmup_error NULL → NOT returned (legit-empty stays locked)', () => {
    cannedAllRows = [row({ warmup_error: null })]
    expect(repo.warmupKeysNeedingFetch()).toEqual([])
  })

  it('mixed: errored-retry + legit-empty-locked + never-attempted → only the two eligible', () => {
    cannedAllRows = [
      row({ symbol: 'ERRORED', date: '2026-05-03', warmup_error: 'network: timeout' }),
      row({ symbol: 'LEGITEMPTY', date: '2026-05-02', warmup_error: null }),
      row({ symbol: 'NEVER', date: '2026-05-01', warmup_attempted_at: null, warmup_error: null }),
    ]
    expect(repo.warmupKeysNeedingFetch()).toEqual([
      { symbol: 'ERRORED', date: '2026-05-03' },
      { symbol: 'NEVER', date: '2026-05-01' },
    ])
  })
})
