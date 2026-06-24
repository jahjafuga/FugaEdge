// Tests for the mistakes-taxonomy migration (schema 33 → 34).
//
// This is an ADDITIVE, idempotent migration (two new tables + indexes + a
// guarded seed-if-empty of 20 vocabulary rows). Like migrate-confluence-junction,
// it needs NO backup closure, NO settings latch, and NO version gate: it runs
// unconditionally every launch from migrateAfterSchema and self-guards via
// CREATE … IF NOT EXISTS + a COUNT(*) seed-if-empty check. Same harness
// constraint as the other migrate-*.test.ts: the real better-sqlite3 native
// binary won't load under vitest, so we drive a mock Database shim that logs
// exec()'d DDL and keys prepare().get/all/run off the SQL text. The mock proves
// the migration ISSUES the right SQL and is idempotent; real constraint
// enforcement (the axis CHECK reject, the partial-unique-index reject, the FK +
// ON DELETE CASCADE/RESTRICT, the 20 seeded rows) is verified against a migrated
// COPY in the sandbox step (beat 1b).

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateMistakesTaxonomy } from '../migrate-mistakes-taxonomy'

interface MockState {
  defCount: number
  execLog: string[]
  inserts: Array<{ sql: string; args: unknown[] }>
}

// Minimal better-sqlite3 stand-in: exec() logs normalized DDL; prepare().get()
// serves the seed-if-empty COUNT; prepare().run() records each seed INSERT.
function makeMockDb(opts: {
  defCount: number
}): Database.Database & { _state: MockState } {
  const state: MockState = {
    defCount: opts.defCount,
    execLog: [],
    inserts: [],
  }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)
      return {
        all: () => {
          throw new Error(`unexpected prepare().all() SQL in test: ${q}`)
        },
        get: (..._args: unknown[]) => {
          if (/SELECT COUNT\(\*\) AS n FROM mistake_def/i.test(q)) {
            return { n: state.defCount }
          }
          throw new Error(`unexpected prepare().get() SQL in test: ${q}`)
        },
        run: (...args: unknown[]) => {
          if (/INSERT INTO mistake_def/i.test(q)) {
            state.inserts.push({ sql: q, args })
            return { changes: 1, lastInsertRowid: state.inserts.length }
          }
          throw new Error(`unexpected prepare().run() SQL in test: ${q}`)
        },
      }
    },
    exec(sql: string) {
      state.execLog.push(norm(sql))
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

const createDefIn = (log: string[]) =>
  log.filter((q) => /CREATE TABLE IF NOT EXISTS mistake_def/i.test(q))
const uxIndexIn = (log: string[]) =>
  log.filter((q) => /ux_mistake_def_axis_name_active/i.test(q))
const ixSortIn = (log: string[]) =>
  log.filter((q) => /ix_mistake_def_axis_sort/i.test(q))
const createTradeMistakeIn = (log: string[]) =>
  log.filter((q) => /CREATE TABLE IF NOT EXISTS trade_mistake/i.test(q))
const ixTradeMistakeIn = (log: string[]) =>
  log.filter((q) => /ix_trade_mistake_def/i.test(q))

// The seed vocabulary the migration must issue, in order, per axis.
const TECHNICAL = [
  'MACD negative at entry',
  'Entered below VWAP',
  'Chased extension (too far from 9 EMA)',
  'Bought into resistance / HOD overhead',
  'No clear setup / forced trade',
  'High-volume pullback (wanted low volume)',
  'Back side of the move',
  'Stop too wide / risk undefined',
  'Added to a loser / averaged down',
  'Float or RVOL criteria not met',
]
const PSYCHOLOGICAL = [
  'FOMO - chased a runner',
  'Greed - held too long / moved target',
  'Revenge trade (after a loss)',
  'Jumped in because it was moving',
  'Cut winner too early (fear)',
  'Hold-and-hope (held a loser too long)',
  'Overconfidence after a win',
  'Gave back profits / overtraded',
  'Broke my own rules',
  "Traded on tilt - didn't walk away",
]

describe('migrateMistakesTaxonomy — schema 33 → 34', () => {
  it('creates mistake_def with the axis CHECK and all eight columns', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const created = createDefIn(db._state.execLog)
    expect(created).toHaveLength(1)
    const sql = created[0]
    expect(sql).toMatch(/id INTEGER PRIMARY KEY/i)
    expect(sql).toMatch(
      /axis TEXT NOT NULL CHECK \(axis IN \('technical','psychological'\)\)/i,
    )
    expect(sql).toMatch(/name TEXT NOT NULL/i)
    expect(sql).toMatch(/sort_position INTEGER NOT NULL DEFAULT 0/i)
    expect(sql).toMatch(/is_custom INTEGER NOT NULL DEFAULT 0/i)
    expect(sql).toMatch(/is_archived INTEGER NOT NULL DEFAULT 0/i)
    expect(sql).toMatch(/created_at TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/i)
    expect(sql).toMatch(/updated_at TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/i)
  })

  it('creates the partial-unique index ux_mistake_def_axis_name_active (WHERE is_archived = 0)', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const idx = uxIndexIn(db._state.execLog)
    expect(idx).toHaveLength(1)
    expect(idx[0]).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS ux_mistake_def_axis_name_active ON mistake_def \(axis, lower\(name\)\) WHERE is_archived = 0/i,
    )
  })

  it('creates the ix_mistake_def_axis_sort index', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const idx = ixSortIn(db._state.execLog)
    expect(idx).toHaveLength(1)
    expect(idx[0]).toMatch(
      /CREATE INDEX IF NOT EXISTS ix_mistake_def_axis_sort ON mistake_def \(axis, sort_position\)/i,
    )
  })

  it('creates trade_mistake with both FKs (CASCADE / RESTRICT) and a composite PK', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const created = createTradeMistakeIn(db._state.execLog)
    expect(created).toHaveLength(1)
    const sql = created[0]
    expect(sql).toMatch(
      /trade_id INTEGER NOT NULL REFERENCES trades\(id\) ON DELETE CASCADE/i,
    )
    expect(sql).toMatch(
      /mistake_def_id INTEGER NOT NULL REFERENCES mistake_def\(id\) ON DELETE RESTRICT/i,
    )
    expect(sql).toMatch(/created_at TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/i)
    expect(sql).toMatch(/PRIMARY KEY \(trade_id, mistake_def_id\)/i)
  })

  it('creates the ix_trade_mistake_def index', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const idx = ixTradeMistakeIn(db._state.execLog)
    expect(idx).toHaveLength(1)
    expect(idx[0]).toMatch(
      /CREATE INDEX IF NOT EXISTS ix_trade_mistake_def ON trade_mistake \(mistake_def_id, trade_id\)/i,
    )
  })

  it('seeds exactly 20 rows (10 technical + 10 psychological) when mistake_def is empty', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    const inserts = db._state.inserts
    expect(inserts).toHaveLength(20)

    const technical = inserts.filter((i) => i.args[0] === 'technical')
    const psychological = inserts.filter((i) => i.args[0] === 'psychological')
    expect(technical).toHaveLength(10)
    expect(psychological).toHaveLength(10)

    // Names + sort_positions match the seed list, in order.
    technical.forEach((ins, i) => {
      expect(ins.args[1]).toBe(TECHNICAL[i])
      expect(ins.args[2]).toBe(i)
    })
    psychological.forEach((ins, i) => {
      expect(ins.args[1]).toBe(PSYCHOLOGICAL[i])
      expect(ins.args[2]).toBe(i)
    })
  })

  it('uses ASCII labels (plain hyphen, no em/en-dash) in the seed', () => {
    const db = makeMockDb({ defCount: 0 })
    migrateMistakesTaxonomy(db)
    expect(db._state.inserts).toHaveLength(20)
    for (const ins of db._state.inserts) {
      const name = String(ins.args[1])
      const allAscii = [...name].every((ch) => ch.charCodeAt(0) <= 0x7f)
      expect(allAscii).toBe(true)
      expect(name).not.toMatch(/[—–]/) // no em-dash / en-dash
    }
  })

  it('seed-if-empty: issues ZERO inserts when mistake_def is already populated', () => {
    const db = makeMockDb({ defCount: 20 })
    migrateMistakesTaxonomy(db)
    expect(db._state.inserts).toHaveLength(0)
  })

  it('is idempotent on a populated DB: re-issues CREATE/INDEX DDL (IF NOT EXISTS no-ops) but seeds nothing', () => {
    const db = makeMockDb({ defCount: 20 })
    migrateMistakesTaxonomy(db)
    migrateMistakesTaxonomy(db)
    // The CREATE TABLE DDL re-issues every run (IF NOT EXISTS keeps it a no-op).
    expect(createDefIn(db._state.execLog)).toHaveLength(2)
    expect(createTradeMistakeIn(db._state.execLog)).toHaveLength(2)
    // Seed stays empty because the count-check is non-zero.
    expect(db._state.inserts).toHaveLength(0)
  })
})
