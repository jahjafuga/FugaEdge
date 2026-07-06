// Tests for the day_fees.fee_commission + fee_other additive columns
// (Ocean One fee-merge, Beat 1 of 2 — schema 39 → 40).
//
// Option A routes Ocean One's per-row fees through the existing day_fees
// allocator. day_fees has slots for fee_ecn/sec/finra/htb/cat but NONE for
// OO's separate Comm or its "other" bucket (ORF/OCC/NSCC/Acc/Clr/Misc); this
// beat adds the two missing slots so the allocator can carry them in Beat 2.
//
// The columns MIRROR fee_ecn exactly: REAL NOT NULL DEFAULT 0 (schema.ts:281).
// Additive, non-destructive — the NOT NULL DEFAULT 0 clause backfills existing
// rows with 0 (SQLite's documented ADD COLUMN semantics), so no backup/latch/
// version-gate, same as migrateAddCommission. Row-survival + read-0 on real
// data is verified empirically in the STEP 4 full-dress rehearsal (better-
// sqlite3's Electron-ABI binary won't load under vitest, so this unit test
// locks the SQL contract + idempotency via the mock-DB shim, the
// migrate-add-commission.test.ts pattern).

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateAddDayFeesOoColumns } from '../migrate-add-day-fees-oo-columns'
import { SCHEMA_VERSION } from '../schema'

interface MockState {
  cols: string[]
  execLog: string[]
}

function makeMockDb(initialCols: string[]): Database.Database & { _state: MockState } {
  const state: MockState = { cols: [...initialCols], execLog: [] }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)
      if (q === 'PRAGMA table_info(day_fees)') {
        return { all: () => state.cols.map((name) => ({ name })) }
      }
      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
    exec(sql: string) {
      const q = norm(sql)
      state.execLog.push(q)
      // Simulate the ALTER adding the column so idempotency holds across runs.
      const m = q.match(/ALTER TABLE day_fees ADD COLUMN (\w+)/i)
      if (m && !state.cols.includes(m[1])) state.cols.push(m[1])
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

const altersFor = (log: string[], col: string) =>
  log.filter((q) => new RegExp(`ALTER TABLE day_fees ADD COLUMN ${col}\\b`, 'i').test(q))

// A schema-39 day_fees shape (post the account_id rebuild) — the two new
// columns are absent.
const BASE_39 = [
  'date', 'symbol', 'fee_ecn', 'fee_sec', 'fee_finra', 'fee_htb', 'fee_cat',
  'total_fees', 'source', 'created_at', 'account_id',
]

describe('migrateAddDayFeesOoColumns — additive fee_commission + fee_other (mirror fee_ecn)', () => {
  it('adds fee_commission AND fee_other when both are missing', () => {
    const db = makeMockDb(BASE_39)
    migrateAddDayFeesOoColumns(db)
    expect(db._state.cols).toContain('fee_commission')
    expect(db._state.cols).toContain('fee_other')
  })

  it('adds each as REAL NOT NULL DEFAULT 0 — exact mirror of fee_ecn (backfills existing rows with 0)', () => {
    const db = makeMockDb(BASE_39)
    migrateAddDayFeesOoColumns(db)
    for (const col of ['fee_commission', 'fee_other']) {
      const alter = altersFor(db._state.execLog, col)[0]
      expect(alter).toMatch(
        new RegExp(`ALTER TABLE day_fees ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`, 'i'),
      )
    }
  })

  it('skips the ALTER for a column that already exists (partial state)', () => {
    const db = makeMockDb([...BASE_39, 'fee_commission'])
    migrateAddDayFeesOoColumns(db)
    expect(altersFor(db._state.execLog, 'fee_commission')).toHaveLength(0)
    expect(altersFor(db._state.execLog, 'fee_other')).toHaveLength(1)
  })

  it('is idempotent: running twice adds each column exactly once and does not throw', () => {
    const db = makeMockDb(BASE_39)
    expect(() => {
      migrateAddDayFeesOoColumns(db)
      migrateAddDayFeesOoColumns(db)
    }).not.toThrow()
    expect(altersFor(db._state.execLog, 'fee_commission')).toHaveLength(1)
    expect(altersFor(db._state.execLog, 'fee_other')).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'fee_commission')).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'fee_other')).toHaveLength(1)
  })

  it('holds SCHEMA_VERSION at the Beat 1 floor of 40 or later (later beats advance it)', () => {
    // Beat 1 established schema 40; the precision-pass beats bump it further, so
    // this is a non-regression floor, not an exact lock (the current exact value
    // is asserted by the latest migration's own test).
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(40)
  })
})
