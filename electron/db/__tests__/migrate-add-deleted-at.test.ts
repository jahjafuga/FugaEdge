// Tests for the v0.2.3 deleted_at migration helper (schema 22 → 23).
//
// Unlike migrate-float-rename, this migration moves NO data: it adds a single
// nullable column (trades.deleted_at) and a partial index. It therefore needs
// NO backup closure, NO settings latch, NO version gate — just the same
// idempotent PRAGMA-gated ALTER idiom used inline for industry/country/etc.,
// extracted into its own type-only module so it's importable under vitest
// (database.ts value-imports better-sqlite3, whose native binary won't load
// here — same constraint the other migrate-*.test.ts files work around).
//
// Mock-DB shim mirrors migrate-float-rename.test.ts: it tracks the trades
// column list and a log of exec()'d statements, and simulates the ALTER
// adding the column so idempotency can be proven across two runs.

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateAddDeletedAt } from '../migrate-add-deleted-at'

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
      // Simulate the ALTER actually adding the column, so a second run's
      // PRAGMA reflects it and the guard skips re-adding.
      if (/ALTER TABLE trades ADD COLUMN deleted_at/i.test(q)) {
        if (!state.cols.includes('deleted_at')) state.cols.push('deleted_at')
      }
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

const altersIn = (log: string[]) =>
  log.filter((q) => /ALTER TABLE trades ADD COLUMN deleted_at/i.test(q))
const indexesIn = (log: string[]) =>
  log.filter((q) => /idx_trades_deleted_at/i.test(q))

describe('migrateAddDeletedAt — schema 22 → 23 additive column', () => {
  it('adds the deleted_at column when it is missing', () => {
    const db = makeMockDb(['id', 'symbol', 'date'])
    migrateAddDeletedAt(db)
    expect(altersIn(db._state.execLog)).toHaveLength(1)
    expect(db._state.cols).toContain('deleted_at')
  })

  it('skips the ALTER when the column already exists', () => {
    const db = makeMockDb(['id', 'symbol', 'deleted_at'])
    migrateAddDeletedAt(db)
    expect(altersIn(db._state.execLog)).toHaveLength(0)
  })

  // Test #5 — idempotency.
  it('is idempotent: running twice does not error and adds the column exactly once', () => {
    const db = makeMockDb(['id', 'symbol', 'date'])
    expect(() => {
      migrateAddDeletedAt(db)
      migrateAddDeletedAt(db)
    }).not.toThrow()
    expect(altersIn(db._state.execLog)).toHaveLength(1)
    expect(db._state.cols.filter((c) => c === 'deleted_at')).toHaveLength(1)
  })

  // Test #6 — the partial index, created idempotently every launch.
  it('creates idx_trades_deleted_at as a partial index WHERE deleted_at IS NULL', () => {
    const db = makeMockDb(['id', 'symbol', 'date'])
    migrateAddDeletedAt(db)
    const idx = indexesIn(db._state.execLog)
    expect(idx).toHaveLength(1)
    expect(idx[0]).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_trades_deleted_at ON trades\(deleted_at\) WHERE deleted_at IS NULL/i,
    )
  })

  it('re-issues the partial index every run with IF NOT EXISTS (safe on fresh installs)', () => {
    const db = makeMockDb(['id', 'symbol', 'deleted_at'])
    migrateAddDeletedAt(db)
    migrateAddDeletedAt(db)
    const idx = indexesIn(db._state.execLog)
    expect(idx).toHaveLength(2)
    for (const q of idx) expect(q).toMatch(/IF NOT EXISTS/i)
  })
})
