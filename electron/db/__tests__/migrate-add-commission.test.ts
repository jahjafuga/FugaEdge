// Tests for the trades.commission additive column (Ocean One Beat 3c).
//
// Ocean One reports a separate "Comm" value Dave wants surfaced apart from the
// regulatory/clearing fees. It is a DISPLAY SLICE of total_fees (the parser
// already summed it into total_fees; net_pnl = gross - total_fees is unchanged).
// Like deleted_at it moves NO data and adds a single nullable column — NO
// backup, NO latch, NO version gate — just the idempotent PRAGMA-gated ALTER
// idiom, extracted into its own type-only module so it's importable under
// vitest (database.ts value-imports better-sqlite3, whose native binary won't
// load here). Mock-DB shim mirrors migrate-add-deleted-at.test.ts.

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateAddCommission } from '../migrate-add-commission'

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
      if (/ALTER TABLE trades ADD COLUMN commission/i.test(q)) {
        if (!state.cols.includes('commission')) state.cols.push('commission')
      }
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

const altersIn = (log: string[]) =>
  log.filter((q) => /ALTER TABLE trades ADD COLUMN commission/i.test(q))

describe('migrateAddCommission — additive nullable column (no version bump)', () => {
  it('adds the commission column when it is missing', () => {
    const db = makeMockDb(['id', 'symbol', 'total_fees'])
    migrateAddCommission(db)
    expect(altersIn(db._state.execLog)).toHaveLength(1)
    expect(db._state.cols).toContain('commission')
  })

  it('adds it as a nullable REAL with no DEFAULT (NULL = no separate commission, not $0)', () => {
    const db = makeMockDb(['id', 'symbol'])
    migrateAddCommission(db)
    const alter = altersIn(db._state.execLog)[0]
    expect(alter).toMatch(/ALTER TABLE trades ADD COLUMN commission REAL/i)
    expect(alter).not.toMatch(/DEFAULT/i)
    expect(alter).not.toMatch(/NOT NULL/i)
  })

  it('skips the ALTER when the column already exists', () => {
    const db = makeMockDb(['id', 'commission'])
    migrateAddCommission(db)
    expect(altersIn(db._state.execLog)).toHaveLength(0)
  })

  it('is idempotent: running twice adds the column exactly once', () => {
    const db = makeMockDb(['id', 'symbol'])
    expect(() => {
      migrateAddCommission(db)
      migrateAddCommission(db)
    }).not.toThrow()
    expect(altersIn(db._state.execLog)).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'commission')).toHaveLength(1)
  })
})
