// EMA-discrepancy fix, beat A — the invalidation + the heal.
//
// THE FOUND MECHANISM (2026-07-04 diagnostic, sharpened in STEP 0): fills
// never mutate in place — commit() HARD-DELETES open trips (purgeOpen) and
// stale summaries (supersedeSummary) and re-inserts fresh rows. SQLite
// reuses rowids, so a purged trade's trade_technicals row can be ADOPTED
// by its successor at the same id, wearing a current schema_version — the
// stale-snapshot shape Dave hit (EMAs agree, numerators split).
//
// THE FIX: an ORPHAN SWEEP inside commit()'s transaction, AFTER the
// purges — DELETE FROM trade_technicals WHERE trade_id NOT IN (SELECT id
// FROM trades). Sieve-proof by construction (covers purgeOpen,
// supersedeSummary, and any future hard-delete in the same tx) and it
// STRUCTURALLY cannot touch a live trade's row, so the identical-re-import
// dedupe path leaves technicals untouched by the predicate itself. A swept
// row is byte-identical to a missing row — the getStaleTradeIds NULL
// branch (repo.ts:301) and the lazy-guard pick it up exactly like a new
// trade's.
//
// Harness mirrors commit-account-stamp.test.ts (the SQL-routing shim).

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy, ensureSpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
  ensureSpy: vi.fn(() => 'ACCT-DEFAULT'),
}))

let runLog: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          return { changes: 1, lastInsertRowid: 1 }
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
      get: () => undefined,
      all: () => [],
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: feesSpy }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: summarySpy }))
vi.mock('../../accounts/repo', () => ({ ensureDefaultAccountId: ensureSpy }))

import { commit } from '../repo'
import { TECHNICALS_SCHEMA_VERSION } from '@/core/technicals/computeTradeTechnicals'

function trip(symbol: string, date: string): RoundTrip {
  return {
    date,
    symbol,
    side: 'long',
    open_time: `${date}T14:30:00.000Z`,
    close_time: `${date}T15:00:00.000Z`,
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 100,
    exec_hash: `EH-${symbol}-${date}`,
    content_hash: `CH-${symbol}-${date}`,
    executions: [],
    status: 'new',
    source_format: 'execution',
  }
}

beforeEach(() => {
  runLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
  ensureSpy.mockClear()
})

describe('commit() — the technicals orphan sweep (beat A)', () => {
  it('runs the orphan sweep AFTER the purges, inside the same transaction', () => {
    commit([trip('ACME', '2026-06-15')], [], 'test-src')
    const idx = (re: RegExp) => runLog.findIndex((r) => re.test(r.sql))
    const purgeIdx = idx(/DELETE FROM trades WHERE symbol = \? AND date = \? AND is_open = 1/i)
    const sweepIdx = idx(/DELETE FROM trade_technicals/i)
    const insertIdx = idx(/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i)
    expect(purgeIdx).toBeGreaterThanOrEqual(0)
    expect(sweepIdx).toBeGreaterThanOrEqual(0)
    // The sweep must land after the open-trip purge — the orphans it kills
    // are the rows those purges just detached...
    expect(sweepIdx).toBeGreaterThan(purgeIdx)
    // ...and BEFORE any insert: rowid reuse happens AT insert, so a sweep
    // after an insert could miss a just-adopted row (the reuse-safety law).
    expect(insertIdx).toBeGreaterThan(sweepIdx)
  })

  it('the sweep predicate is STRUCTURALLY orphan-only — a live trade\'s row is untouchable (the identical-re-import guarantee)', () => {
    commit([trip('ACME', '2026-06-15')], [], 'test-src')
    const sweep = runLog.find((r) => /DELETE FROM trade_technicals/i.test(r.sql))
    expect(sweep).toBeTruthy()
    expect(sweep!.sql).toMatch(/trade_id NOT IN \(SELECT id FROM trades\)/i)
  })
})

describe('THE HEAL — the schema-version bump (beat A)', () => {
  it('TECHNICALS_SCHEMA_VERSION is bumped past 1, marking every pre-fix row stale for the launch backfill', () => {
    // Monotonic assert (>= 2), not an exact pin — future bumps stay legal.
    // getStaleTradeIds enumerates schema_version < current (repo.ts:303),
    // so the one-line bump reaches the whole book at next boot.
    expect(TECHNICALS_SCHEMA_VERSION).toBeGreaterThanOrEqual(2)
  })
})
