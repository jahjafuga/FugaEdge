// v0.2.3 Phase 2a — THE GUARD (Lao's resurrect-rides-existing-recompute proof).
//
// When a CLOSED, soft-deleted trade is re-imported, the preview dedup filter
// (deleted_at IS NULL) marks it 'new', so it reaches insertTrip; INSERT OR
// IGNORE then no-ops because the soft-deleted row still occupies the unique
// hash slot, dropping into the else branch. That branch must:
//   1. clear deleted_at on the trashed row (resurrect),
//   2. count it as resurrectedTrips, NOT skippedTrips,
//   3. add its date to the `dates` set,
//   4. add its `date|symbol` to the `pairs` set,
//   5. let the EXISTING fee loop call recomputeFeesForDateSymbol once for the pair,
//   6. let the EXISTING summary call recomputeSummaryForDates once with the date,
// and CRUCIALLY add NO new recompute call of its own — the mechanism RIDES the
// loops already in commit(). If recomputeSummaryForDates were called more than
// once, someone added a resurrect-path recompute and the design regressed.
//
// better-sqlite3's native binary won't load under vitest, so we drive commit()
// against a SQL-routing shim: INSERT OR IGNORE reports changes:0 (slot held by
// the trashed row), the resurrect UPDATE reports changes:1 (a trashed row was
// revived). recomputeFeesForDateSymbol and recomputeSummaryForDates are mocked
// as spies so we can assert exact invocation counts and arguments.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
}))

let runLog: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        // INSERT OR IGNORE no-ops: a row with this hash already exists
        // (here, the soft-deleted one we're about to resurrect).
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          return { changes: 0, lastInsertRowid: 0 }
        }
        // The resurrect UPDATE matched a trashed row → one row revived.
        if (/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL/i.test(sql)) {
          return { changes: 1, lastInsertRowid: 0 }
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

import { commit } from '../repo'

function tripFixture(over: Partial<RoundTrip> = {}): RoundTrip {
  return {
    date: '2026-01-05',
    symbol: 'AAPL',
    side: 'long',
    open_time: '2026-01-05T14:30:00.000Z',
    close_time: '2026-01-05T15:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 100,
    exec_hash: 'EH-RESURRECT',
    content_hash: 'CH-RESURRECT',
    executions: [],
    status: 'new',
    ...over,
  }
}

beforeEach(() => {
  runLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
})

describe('dedup resurrect rides the existing recompute loops', () => {
  it('clears deleted_at via a guarded UPDATE (parenthesized OR + deleted_at IS NOT NULL)', () => {
    commit([tripFixture()], [], 'test')
    const upd = runLog.find((r) =>
      /UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL/i.test(r.sql),
    )
    expect(upd).toBeTruthy()
    // The OR must be parenthesized so the AND guard applies to the whole match.
    expect(upd!.sql).toMatch(
      /\(\s*exec_hash\s*=\s*@exec_hash\s+OR\s+content_hash\s*=\s*@content_hash\s*\)/i,
    )
    // The load-bearing guard: distinguishes a true resurrect from a live dup.
    expect(upd!.sql).toMatch(/AND\s+deleted_at\s+IS\s+NOT\s+NULL/i)
    expect(upd!.args[0]).toEqual({
      exec_hash: 'EH-RESURRECT',
      content_hash: 'CH-RESURRECT',
    })
  })

  it('counts the revived trip as resurrectedTrips, NOT skippedTrips or insertedTrips', () => {
    const out = commit([tripFixture()], [], 'test')
    expect(out.resurrectedTrips).toBe(1)
    expect(out.skippedTrips).toBe(0)
    expect(out.insertedTrips).toBe(0)
  })

  it('adds the resurrected date to the dates set (affectedDates)', () => {
    const out = commit([tripFixture()], [], 'test')
    expect(out.affectedDates).toContain('2026-01-05')
  })

  it('adds the resurrected date|symbol to the pairs set (affectedPairs)', () => {
    const out = commit([tripFixture()], [], 'test')
    expect(out.affectedPairs).toBe(1)
  })

  it('invokes recomputeFeesForDateSymbol EXACTLY ONCE for the resurrected pair', () => {
    commit([tripFixture()], [], 'test')
    expect(feesSpy).toHaveBeenCalledTimes(1)
    expect(feesSpy).toHaveBeenCalledWith('2026-01-05', 'AAPL')
  })

  it('invokes recomputeSummaryForDates EXACTLY ONCE with a Set containing the date', () => {
    commit([tripFixture()], [], 'test')
    expect(summarySpy).toHaveBeenCalledTimes(1)
    const arg = summarySpy.mock.calls[0][0] as Set<string>
    expect(arg).toBeInstanceOf(Set)
    expect(arg.has('2026-01-05')).toBe(true)
  })

  it('adds NO new recompute call on the resurrect path — it rides the existing loops', () => {
    // The negative half of the guard: a second summary/fees call would mean a
    // resurrect-specific recompute was bolted on. Exactly-once on both proves
    // the resurrect only seeds the sets the existing single loops consume.
    commit([tripFixture()], [], 'test')
    expect(summarySpy).toHaveBeenCalledTimes(1)
    expect(feesSpy).toHaveBeenCalledTimes(1)
  })
})
