// Tests for trades.total_fees_precise + gross_pnl_precise additive columns
// (precision pass, Beat B1 of 3 — schema 40 -> 41).
//
// The complete precision pass fixes the round-then-sum aggregate drift on FEES
// and GROSS (net is deferred). This beat ONLY lands the two storage columns; the
// write-precision (B2) and aggregate-repointing (B3) are separate beats.
//
// The columns MIRROR total_fees exactly: REAL NOT NULL DEFAULT 0 (schema.ts:181)
// -- so existing rows backfill to 0 (SQLite's documented ADD COLUMN semantics)
// and every current fee/pnl reader keeps working unchanged. Additive,
// non-destructive: NO backup, NO settings latch, NO version gate (the
// migrateAddDayFeesOoColumns / migrateAddCommission idiom). Row-survival +
// read-0 on real data is verified empirically in the STEP 4 full-dress rehearsal
// (better-sqlite3's Electron-ABI binary won't load under vitest, so this unit
// test locks the SQL contract + idempotency via the mock-DB shim, the
// migrate-add-day-fees-oo-columns.test.ts pattern).

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateAddTradesPreciseColumns } from '../migrate-add-trades-precise-columns'
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
      if (q === 'PRAGMA table_info(trades)') {
        return { all: () => state.cols.map((name) => ({ name })) }
      }
      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
    exec(sql: string) {
      const q = norm(sql)
      state.execLog.push(q)
      // Simulate the ALTER adding the column so idempotency holds across runs.
      const m = q.match(/ALTER TABLE trades ADD COLUMN (\w+)/i)
      if (m && !state.cols.includes(m[1])) state.cols.push(m[1])
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

const altersFor = (log: string[], col: string) =>
  log.filter((q) => new RegExp(`ALTER TABLE trades ADD COLUMN ${col}\\b`, 'i').test(q))

// The schema-40 trades shape (the frozen 51-col post-rebuild list from
// migrate-trades-rebuild-dedup.ts:40-92) — the two precise columns are absent.
const BASE_40 = [
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
  'account_id',
]

describe('migrateAddTradesPreciseColumns — additive total_fees_precise + gross_pnl_precise (mirror total_fees)', () => {
  it('adds total_fees_precise AND gross_pnl_precise when both are missing', () => {
    const db = makeMockDb(BASE_40)
    migrateAddTradesPreciseColumns(db)
    expect(db._state.cols).toContain('total_fees_precise')
    expect(db._state.cols).toContain('gross_pnl_precise')
  })

  it('adds each as REAL NOT NULL DEFAULT 0 — exact mirror of total_fees (backfills existing rows with 0)', () => {
    const db = makeMockDb(BASE_40)
    migrateAddTradesPreciseColumns(db)
    for (const col of ['total_fees_precise', 'gross_pnl_precise']) {
      const alter = altersFor(db._state.execLog, col)[0]
      expect(alter).toMatch(
        new RegExp(`ALTER TABLE trades ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`, 'i'),
      )
    }
  })

  it('does NOT add a net_pnl_precise column (net is deferred, B-trimmed)', () => {
    const db = makeMockDb(BASE_40)
    migrateAddTradesPreciseColumns(db)
    expect(db._state.cols).not.toContain('net_pnl_precise')
    expect(altersFor(db._state.execLog, 'net_pnl_precise')).toHaveLength(0)
  })

  it('skips the ALTER for a column that already exists (partial state)', () => {
    const db = makeMockDb([...BASE_40, 'total_fees_precise'])
    migrateAddTradesPreciseColumns(db)
    expect(altersFor(db._state.execLog, 'total_fees_precise')).toHaveLength(0)
    expect(altersFor(db._state.execLog, 'gross_pnl_precise')).toHaveLength(1)
  })

  it('is idempotent: running twice adds each column exactly once and does not throw', () => {
    const db = makeMockDb(BASE_40)
    expect(() => {
      migrateAddTradesPreciseColumns(db)
      migrateAddTradesPreciseColumns(db)
    }).not.toThrow()
    expect(altersFor(db._state.execLog, 'total_fees_precise')).toHaveLength(1)
    expect(altersFor(db._state.execLog, 'gross_pnl_precise')).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'total_fees_precise')).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'gross_pnl_precise')).toHaveLength(1)
  })

  it('bumps SCHEMA_VERSION to 41', () => {
    expect(SCHEMA_VERSION).toBe('41')
  })
})
