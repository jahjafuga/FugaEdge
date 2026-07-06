// Beat B2b — one-shot backfill copying each pre-B2a row's 2dp value into its
// precise column (total_fees_precise = total_fees, gross_pnl_precise =
// gross_pnl) so old rows sum at 2dp precision instead of 0. schema 41 -> 42.
//
// Same constraint as migrate-content-hash.test.ts: better-sqlite3's Electron
// ABI won't load under vitest, and B2b is one set-based UPDATE (no pure helper
// to extract). So this file locks the migration's MECHANICS — the both-zero
// UPDATE SQL, the version gate, the latch, the transaction, the version bump —
// via a prepare-capture shim (the commit-account-stamp idiom). The actual ROW
// OUTCOMES (pre-B2a -> 2dp, B2a-precise -> untouched clobber-safety,
// genuine-zero no-op, idempotency) are proven in the STEP 4 full-dress
// rehearsal on a real-shaped copy — the exact split content-hash ships with.

import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateBackfillPreciseColumns } from '../migrate-backfill-precise-columns'
import { SCHEMA_VERSION } from '../schema'

interface RunEntry { sql: string; args: unknown[] }

function makeMockDb({ latched = false, changes = 3 } = {}) {
  const runLog: RunEntry[] = []
  const transactionSpy = vi.fn()
  const mock = {
    prepare(sql: string) {
      return {
        run: (...args: unknown[]) => {
          runLog.push({ sql, args })
          return { changes, lastInsertRowid: 0 }
        },
        get: (..._args: unknown[]) => {
          if (/SELECT value FROM settings WHERE key/i.test(sql)) {
            return latched ? { value: 'true' } : undefined
          }
          return undefined
        },
        all: () => [],
      }
    },
    transaction(fn: (...a: unknown[]) => unknown) {
      transactionSpy()
      return (...a: unknown[]) => fn(...a)
    },
  }
  return { db: mock as unknown as Database.Database, runLog, transactionSpy }
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const updates = (log: RunEntry[]) => log.filter((e) => /UPDATE\s+trades/i.test(e.sql))
const latchWrites = (log: RunEntry[]) => log.filter((e) => /INSERT INTO settings/i.test(e.sql))

describe('migrateBackfillPreciseColumns — one-shot 2dp -> precise backfill (schema 41 -> 42)', () => {
  it('runs the both-zero UPDATE copying the 2dp columns into the precise columns', () => {
    const { db, runLog } = makeMockDb()
    migrateBackfillPreciseColumns(db, 41)
    const u = updates(runLog)
    expect(u).toHaveLength(1)
    const sql = norm(u[0].sql)
    expect(sql).toMatch(
      /UPDATE trades SET total_fees_precise = total_fees, gross_pnl_precise = gross_pnl/i,
    )
    // The clobber guard: BOTH precise columns must be 0 (AND, not OR) — a B2a row
    // with either column nonzero is excluded by SQLite.
    expect(sql).toMatch(/WHERE total_fees_precise = 0 AND gross_pnl_precise = 0/i)
  })

  it('version gate: priorVersion >= 42 skips the UPDATE (idempotent on re-run)', () => {
    const { db, runLog } = makeMockDb()
    migrateBackfillPreciseColumns(db, 42)
    expect(updates(runLog)).toHaveLength(0)
  })

  it('version gate: a fresh install (priorVersion 0) skips the UPDATE', () => {
    const { db, runLog } = makeMockDb()
    migrateBackfillPreciseColumns(db, 0)
    expect(updates(runLog)).toHaveLength(0)
  })

  it('a set latch skips the UPDATE (belt-and-suspenders idempotency)', () => {
    const { db, runLog } = makeMockDb({ latched: true })
    migrateBackfillPreciseColumns(db, 41)
    expect(updates(runLog)).toHaveLength(0)
  })

  it('runs the UPDATE inside a transaction and sets the latch', () => {
    const { db, runLog, transactionSpy } = makeMockDb()
    migrateBackfillPreciseColumns(db, 41)
    expect(transactionSpy).toHaveBeenCalled()
    expect(latchWrites(runLog).length).toBeGreaterThanOrEqual(1)
  })

  it('aborts without running the UPDATE when the backup closure throws', () => {
    const { db, runLog } = makeMockDb()
    migrateBackfillPreciseColumns(db, 41, {
      backup: () => {
        throw new Error('disk full')
      },
    })
    expect(updates(runLog)).toHaveLength(0)
  })

  it('holds SCHEMA_VERSION at the B2b floor of 42 or later (later beats advance it)', () => {
    // B2b established schema 42; later precision-pass beats (F0 -> 43) bump it
    // further, so this is a non-regression floor, not an exact lock — the current
    // exact value is asserted by the latest migration's own test (F0's).
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(42)
  })
})
