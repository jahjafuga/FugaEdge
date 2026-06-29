import { describe, it, expect, beforeEach, vi } from 'vitest'

// v0.2.4 §K.1.3 — characterization for reclearStrandedWarmupMarkers + its pure
// predicate isStrandedLockedWarmupRow. The behavior was proven on real data by the
// sandbox dry-run (11 keys -> 25 stubs, zero collateral); this locks it permanently.
//
// better-sqlite3's native binary won't load under vitest, so '../../db/database' is
// mocked with the canned-result shim used across the repo tests (repo-warmup.test.ts).
// Because the locked-shape predicate lives in JS (the repo SELECT is a dumb fetch),
// the filter is genuinely behavior-testable: feed candidate rows, assert which get
// the per-key UPDATE. The shim accumulates run() calls so we can assert the exact
// (symbol,date) keys nulled — and that NO non-locked key is.

interface Prepared { sql: string }
let prepared: Prepared[] = []
let runCalls: { sql: string; args: unknown[] }[] = []
let cannedAllRows: Record<string, unknown>[] = []

const mockDb = {
  prepare(sql: string) {
    prepared.push({ sql })
    return {
      all: () => cannedAllRows,
      run: (...args: unknown[]) => { runCalls.push({ sql, args }); return { changes: 1 } },
      get: () => undefined,
    }
  },
}
vi.mock('../../db/database', () => ({ openDatabase: () => mockDb, getDbPath: () => ':memory:' }))

import * as repo from '../repo'

// Default = the LOCKED legit-empty shape (attempted, empty warmup, no recorded
// error, active bars present, no active-fetch error). Each test perturbs one field.
const cand = (over: Record<string, unknown> = {}) => ({
  symbol: 'AAA',
  date: '2026-05-01',
  warmup_attempted_at: '2026-06-10T00:00:00.000Z',
  warmup_error: null,
  error: null,
  has_bars: 1,
  warmup_empty: 1,
  ...over,
})

beforeEach(() => {
  prepared = []
  runCalls = []
  cannedAllRows = []
})

describe('isStrandedLockedWarmupRow — matches ONLY the locked legit-empty shape', () => {
  it('LOCKED shape → true (the recoverable target)', () => {
    expect(repo.isStrandedLockedWarmupRow(cand())).toBe(true)
  })
  it('warmup_error SET → false (a recorded throw is §K.1-retryable, not stranded)', () => {
    expect(repo.isStrandedLockedWarmupRow(cand({ warmup_error: '429: rate limited' }))).toBe(false)
  })
  it('no active bars (has_bars 0) → false (stuck-stub protection: bars guard)', () => {
    expect(repo.isStrandedLockedWarmupRow(cand({ has_bars: 0 }))).toBe(false)
  })
  it('errored active fetch (error SET) → false (error guard)', () => {
    expect(repo.isStrandedLockedWarmupRow(cand({ error: 'fetch failed' }))).toBe(false)
  })
  it('already healthy (warmup_empty 0) → false', () => {
    expect(repo.isStrandedLockedWarmupRow(cand({ warmup_empty: 0 }))).toBe(false)
  })
  it('never attempted (warmup_attempted_at null) → false (nothing to clear)', () => {
    expect(repo.isStrandedLockedWarmupRow(cand({ warmup_attempted_at: null }))).toBe(false)
  })
})

describe('reclearStrandedWarmupMarkers — wiring', () => {
  it('SELECT derives has_bars / warmup_empty as the six-condition SQL booleans', () => {
    repo.reclearStrandedWarmupMarkers()
    const sel = prepared.find((p) => /SELECT/i.test(p.sql) && /FROM intraday_bars/i.test(p.sql))
    expect(sel).toBeDefined()
    expect(sel!.sql).toMatch(/\(bars IS NOT NULL AND bars != '\[\]'\)\s+AS has_bars/i)
    expect(sel!.sql).toMatch(/\(warmup_bars IS NULL OR warmup_bars = '\[\]'\)\s+AS warmup_empty/i)
  })

  it('UPDATE nulls ONLY warmup_attempted_at, keyed by (symbol, date)', () => {
    cannedAllRows = [cand()]
    repo.reclearStrandedWarmupMarkers()
    const upd = prepared.find((p) => /UPDATE intraday_bars/i.test(p.sql))
    expect(upd).toBeDefined()
    expect(upd!.sql).toMatch(/SET\s+warmup_attempted_at\s*=\s*NULL\s+WHERE/i)
    expect(upd!.sql).toMatch(/WHERE\s+symbol\s*=\s*\?\s+AND\s+date\s*=\s*\?/i)
  })

  it('mixed rows → returns exactly the LOCKED count and UPDATEs only locked keys', () => {
    cannedAllRows = [
      cand({ symbol: 'LOCK1', date: '2026-05-29' }), // locked
      cand({ symbol: 'LOCK2', date: '2026-05-11' }), // locked
      cand({ symbol: 'ERRSET', date: '2026-05-20', warmup_error: '429' }), // not (error guard)
      cand({ symbol: 'NOBARS', date: '2026-05-19', has_bars: 0 }), // not (bars guard)
      cand({ symbol: 'ERRORED', date: '2026-05-18', error: 'x' }), // not (error guard)
      cand({ symbol: 'HEALTHY', date: '2026-05-17', warmup_empty: 0 }), // not (has warmup)
      cand({ symbol: 'NEVER', date: '2026-05-16', warmup_attempted_at: null }), // not (never attempted)
    ]
    const n = repo.reclearStrandedWarmupMarkers()
    expect(n).toBe(2)
    const updatedKeys = runCalls
      .filter((c) => /UPDATE intraday_bars/i.test(c.sql))
      .map((c) => c.args.join('|'))
    expect(updatedKeys.sort()).toEqual(['LOCK1|2026-05-29', 'LOCK2|2026-05-11'].sort())
    for (const bad of ['ERRSET', 'NOBARS', 'ERRORED', 'HEALTHY', 'NEVER']) {
      expect(updatedKeys.some((k) => k.startsWith(bad))).toBe(false)
    }
  })

  it('no locked rows → returns 0 and runs no UPDATE', () => {
    cannedAllRows = [cand({ warmup_error: '429' }), cand({ has_bars: 0 })]
    const n = repo.reclearStrandedWarmupMarkers()
    expect(n).toBe(0)
    expect(runCalls.filter((c) => /UPDATE intraday_bars/i.test(c.sql))).toEqual([])
  })
})
