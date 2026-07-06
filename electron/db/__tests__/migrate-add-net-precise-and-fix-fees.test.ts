// Beat F0 (merged F0+F1) — the schema 42 -> 43 migration: (1) add net_pnl_precise,
// (2) corrective-fix the stale total_fees_precise the allocator left at 0 on post-B2a
// allocated rows, (3) backfill net_pnl_precise from the CORRECTED fee + precise gross.
//
// Same constraint as migrate-backfill-precise-columns.test.ts / migrate-add-trades-
// precise-columns.test.ts: better-sqlite3's Electron ABI won't load under vitest, so
// this file locks the migration MECHANICS — the ALTER shape, the two ordered UPDATE
// SQLs, the clobber-safe WHERE, the version gate, the latch, the transaction, the
// version bump — via a prepare/exec-capture shim. The actual ROW OUTCOMES
// (stale -> 2dp, net = gross_precise - fee, clobber-safety, genuine-zero no-op,
// idempotency) are proven in the STEP 4 full-dress rehearsal on a real-shaped copy.

import { describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateAddNetPreciseAndFixFees } from '../migrate-add-net-precise-and-fix-fees'
import { SCHEMA_VERSION } from '../schema'

interface RunEntry {
  sql: string
  args: unknown[]
}

// The schema-42 trades shape: the frozen 51-col rebuild list
// (migrate-trades-rebuild-dedup.ts:40-92) plus B1's two precise columns.
// net_pnl_precise is ABSENT — this migration adds it.
const BASE_42 = [
  'id', 'date', 'symbol', 'side', 'open_time', 'close_time', 'is_open',
  'shares_bought', 'avg_buy_price', 'shares_sold', 'avg_sell_price', 'pnl',
  'gross_pnl', 'fee_ecn', 'fee_sec', 'fee_finra', 'fee_htb', 'fee_cat',
  'total_fees', 'net_pnl', 'executions_json', 'exec_hash', 'created_at',
  'entry_timeframe', 'entry_ema9_distance_pct', 'playbook_id', 'confidence',
  'mistakes_json', 'planned_risk', 'float_shares', 'catalyst_type',
  'days_since_catalyst', 'mae', 'mfe', 'planned_stop_loss_price', 'country',
  'country_name', 'region', 'country_source', 'source_broker', 'source_format',
  'source_file', 'account_name', 'fees_reported', 'content_hash',
  'shares_outstanding', 'deleted_at', 'daily_change_pct', 'rvol', 'commission',
  'account_id', 'total_fees_precise', 'gross_pnl_precise',
]

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

function makeMockDb({ cols = BASE_42, latched = false, changes = 2 } = {}) {
  const state = { cols: [...cols] }
  const runLog: RunEntry[] = []
  const execLog: string[] = []
  const transactionSpy = vi.fn()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)
      return {
        all: () =>
          q === 'PRAGMA table_info(trades)'
            ? state.cols.map((name) => ({ name }))
            : [],
        get: (..._a: unknown[]) =>
          /SELECT value FROM settings WHERE key/i.test(q)
            ? latched
              ? { value: 'true' }
              : undefined
            : undefined,
        run: (...args: unknown[]) => {
          runLog.push({ sql: q, args })
          return { changes, lastInsertRowid: 0 }
        },
      }
    },
    exec(sql: string) {
      const q = norm(sql)
      execLog.push(q)
      // Simulate the ALTER adding the column so idempotency holds across runs.
      const m = q.match(/ALTER TABLE trades ADD COLUMN (\w+)/i)
      if (m && !state.cols.includes(m[1])) state.cols.push(m[1])
    },
    transaction(fn: (...a: unknown[]) => unknown) {
      transactionSpy()
      return (...a: unknown[]) => fn(...a)
    },
  }

  return {
    db: mock as unknown as Database.Database,
    runLog,
    execLog,
    transactionSpy,
    state,
  }
}

const updates = (log: RunEntry[]) => log.filter((e) => /UPDATE\s+trades/i.test(e.sql))
const altersFor = (log: string[], col: string) =>
  log.filter((q) => new RegExp(`ALTER TABLE trades ADD COLUMN ${col}\\b`, 'i').test(q))
const latchWrites = (log: RunEntry[]) =>
  log.filter((e) => /INSERT INTO settings/i.test(e.sql))

describe('migrateAddNetPreciseAndFixFees — add net_pnl_precise + corrective fee fix (schema 42 -> 43)', () => {
  it('adds net_pnl_precise as REAL NOT NULL DEFAULT 0 (mirrors the B1 precise columns)', () => {
    const { db, execLog, state } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42)
    expect(altersFor(execLog, 'net_pnl_precise')[0]).toMatch(
      /ALTER TABLE trades ADD COLUMN net_pnl_precise REAL NOT NULL DEFAULT 0/i,
    )
    expect(state.cols).toContain('net_pnl_precise')
  })

  it('corrective UPDATE copies the 2dp fee into precise with the clobber-safe WHERE', () => {
    const { db, runLog } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42)
    const corrective = updates(runLog)
      .map((e) => e.sql)
      .find((s) => /total_fees_precise = total_fees\b/i.test(s))
    expect(corrective).toBeDefined()
    // total_fees != 0 excludes genuine-zero rows; total_fees_precise = 0 excludes
    // already-correct rows (the clobber guard) — the F0-recon safe clause.
    expect(corrective).toMatch(
      /UPDATE trades SET total_fees_precise = total_fees WHERE total_fees != 0 AND total_fees_precise = 0/i,
    )
  })

  it('net backfill derives net_pnl_precise from the corrected fee + precise gross', () => {
    const { db, runLog } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42)
    const u = updates(runLog).map((e) => e.sql)
    expect(u).toContainEqual(
      expect.stringMatching(
        /UPDATE trades SET net_pnl_precise = gross_pnl_precise - total_fees_precise/i,
      ),
    )
  })

  it('runs the corrective fee fix BEFORE the net backfill (net must see the corrected fee)', () => {
    const { db, runLog } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42)
    const u = updates(runLog)
    const iCorrective = u.findIndex((e) => /total_fees_precise = total_fees\b/i.test(e.sql))
    const iNet = u.findIndex((e) => /net_pnl_precise = gross_pnl_precise/i.test(e.sql))
    expect(iCorrective).toBeGreaterThanOrEqual(0)
    expect(iNet).toBeGreaterThan(iCorrective)
  })

  it('version gate: priorVersion >= 43 skips both data UPDATEs (idempotent on re-run)', () => {
    const { db, runLog } = makeMockDb({ cols: [...BASE_42, 'net_pnl_precise'] })
    migrateAddNetPreciseAndFixFees(db, 43)
    expect(updates(runLog)).toHaveLength(0)
  })

  it('fresh install (priorVersion 0): adds the migration-only column but skips the data UPDATEs', () => {
    const { db, runLog, execLog } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 0)
    // net_pnl_precise is NOT in SCHEMA_SQL, so a fresh DB still needs the ALTER...
    expect(altersFor(execLog, 'net_pnl_precise')).toHaveLength(1)
    // ...but there are no rows to correct or backfill.
    expect(updates(runLog)).toHaveLength(0)
  })

  it('a set latch skips the data UPDATEs (belt-and-suspenders idempotency)', () => {
    const { db, runLog } = makeMockDb({ latched: true })
    migrateAddNetPreciseAndFixFees(db, 42)
    expect(updates(runLog)).toHaveLength(0)
  })

  it('runs the UPDATEs inside a transaction and sets the latch', () => {
    const { db, runLog, transactionSpy } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42)
    expect(transactionSpy).toHaveBeenCalled()
    expect(latchWrites(runLog).length).toBeGreaterThanOrEqual(1)
  })

  it('aborts the data UPDATEs when the backup closure throws (data left untouched)', () => {
    const { db, runLog } = makeMockDb()
    migrateAddNetPreciseAndFixFees(db, 42, {
      backup: () => {
        throw new Error('disk full')
      },
    })
    expect(updates(runLog)).toHaveLength(0)
  })

  it('holds SCHEMA_VERSION at the F0 floor of 43 or later (later beats advance it)', () => {
    // F0 established schema 43; later precision-pass beats (F3 -> 44) bump it further, so
    // this is a non-regression floor, not an exact lock — the current exact value is
    // asserted by the latest migration's own test (F3's).
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(43)
  })
})
