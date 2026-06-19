// Tests for the v0.2.5 confluence-junction migration (schema 32 → 33).
//
// This is an ADDITIVE, idempotent migration (new table + new column + a guarded
// one-time seed) so — like migrate-add-deleted-at — it needs NO backup closure,
// NO settings latch, and NO version gate: it runs unconditionally every launch
// from migrateAfterSchema and self-guards via PRAGMA inspection + an
// existence-check. Same harness constraint as the other migrate-*.test.ts: the
// real better-sqlite3 native binary won't load under vitest, so we drive a mock
// Database shim that logs exec()'d DDL and keys prepare().get/all/run off the
// SQL text. The mock proves the migration ISSUES the right SQL and is
// idempotent; real constraint enforcement (the composite-PK reject, the FK +
// ON DELETE CASCADE, the one seeded row) is verified against a migrated COPY in
// the sandbox step.

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { migrateConfluenceJunction } from '../migrate-confluence-junction'

interface MockState {
  playbookCols: string[]
  execLog: string[]
  inserts: Array<{ sql: string; args: unknown[] }>
  systemCount: number
}

function makeMockDb(opts: {
  playbookCols: string[]
  systemCount: number
}): Database.Database & { _state: MockState } {
  const state: MockState = {
    playbookCols: [...opts.playbookCols],
    execLog: [],
    inserts: [],
    systemCount: opts.systemCount,
  }
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)
      return {
        all: () => {
          if (q === 'PRAGMA table_info(playbooks)') {
            return state.playbookCols.map((name) => ({ name }))
          }
          throw new Error(`unexpected prepare().all() SQL in test: ${q}`)
        },
        get: (..._args: unknown[]) => {
          if (/SELECT COUNT\(\*\) AS n FROM playbooks WHERE is_system = 1/i.test(q)) {
            return { n: state.systemCount }
          }
          throw new Error(`unexpected prepare().get() SQL in test: ${q}`)
        },
        run: (...args: unknown[]) => {
          if (/INSERT INTO playbooks/i.test(q)) {
            state.inserts.push({ sql: q, args })
            // Simulate the seed taking effect so a 2nd run's count guard skips.
            state.systemCount = 1
            return { changes: 1, lastInsertRowid: 99 }
          }
          throw new Error(`unexpected prepare().run() SQL in test: ${q}`)
        },
      }
    },
    exec(sql: string) {
      const q = norm(sql)
      state.execLog.push(q)
      // Simulate the ALTER actually adding the column so a 2nd run's PRAGMA
      // reflects it and the guard skips re-adding.
      if (/ALTER TABLE playbooks ADD COLUMN is_system/i.test(q)) {
        if (!state.playbookCols.includes('is_system')) {
          state.playbookCols.push('is_system')
        }
      }
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

// Playbook columns of a real v32 DB (the seedable starter set), WITHOUT is_system.
const V32_PLAYBOOK_COLS = [
  'id', 'name', 'description', 'rules', 'ideal_conditions', 'archived', 'tier', 'created_at',
]

const altersIn = (log: string[]) =>
  log.filter((q) => /ALTER TABLE playbooks ADD COLUMN is_system/i.test(q))
const createJunctionIn = (log: string[]) =>
  log.filter((q) => /CREATE TABLE IF NOT EXISTS trade_playbooks/i.test(q))
const indexIn = (log: string[]) =>
  log.filter((q) => /idx_trade_playbooks_playbook/i.test(q))

describe('migrateConfluenceJunction — schema 32 → 33', () => {
  it('creates trade_playbooks with (trade_id, playbook_id, created_at) and a composite PK', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    const created = createJunctionIn(db._state.execLog)
    expect(created).toHaveLength(1)
    expect(created[0]).toMatch(/trade_id INTEGER NOT NULL REFERENCES trades\(id\) ON DELETE CASCADE/i)
    expect(created[0]).toMatch(/playbook_id INTEGER NOT NULL REFERENCES playbooks\(id\) ON DELETE CASCADE/i)
    expect(created[0]).toMatch(/created_at TEXT NOT NULL DEFAULT \(datetime\('now'\)\)/i)
    expect(created[0]).toMatch(/PRIMARY KEY \(trade_id, playbook_id\)/i)
  })

  it('creates idx_trade_playbooks_playbook idempotently (IF NOT EXISTS)', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    const idx = indexIn(db._state.execLog)
    expect(idx).toHaveLength(1)
    expect(idx[0]).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_trade_playbooks_playbook ON trade_playbooks\(playbook_id\)/i,
    )
  })

  it('adds is_system (INTEGER NOT NULL DEFAULT 0) to playbooks when missing', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    const alters = altersIn(db._state.execLog)
    expect(alters).toHaveLength(1)
    expect(alters[0]).toMatch(
      /ALTER TABLE playbooks ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0/i,
    )
  })

  it('skips the is_system ALTER when the column already exists', () => {
    const db = makeMockDb({
      playbookCols: [...V32_PLAYBOOK_COLS, 'is_system'],
      systemCount: 1,
    })
    migrateConfluenceJunction(db)
    expect(altersIn(db._state.execLog)).toHaveLength(0)
  })

  it('seeds exactly one protected "No Setup" (is_system=1, placeholder tier C) when none exists', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    expect(db._state.inserts).toHaveLength(1)
    const { sql, args } = db._state.inserts[0]
    expect(sql).toMatch(/INSERT INTO playbooks/i)
    expect(args).toContain('No Setup')
    expect(args).toContain('C')
    expect(args).toContain(1)
  })

  it('does NOT seed when an is_system row already exists', () => {
    const db = makeMockDb({
      playbookCols: [...V32_PLAYBOOK_COLS, 'is_system'],
      systemCount: 1,
    })
    migrateConfluenceJunction(db)
    expect(db._state.inserts).toHaveLength(0)
  })

  it('SURFACES a name collision — uses a plain INSERT, never INSERT OR IGNORE', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    expect(db._state.inserts).toHaveLength(1)
    expect(db._state.inserts[0].sql).not.toMatch(/OR IGNORE/i)
  })

  it('is idempotent: a second run adds the column once, seeds once, and does not throw', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    expect(() => {
      migrateConfluenceJunction(db)
      migrateConfluenceJunction(db)
    }).not.toThrow()
    expect(altersIn(db._state.execLog)).toHaveLength(1)
    expect(db._state.inserts).toHaveLength(1)
    // The junction CREATE/INDEX re-issue every run (IF NOT EXISTS keeps them no-ops).
    expect(createJunctionIn(db._state.execLog)).toHaveLength(2)
    expect(indexIn(db._state.execLog)).toHaveLength(2)
  })

  it('declares PRIMARY KEY (trade_id, playbook_id) — the guarantee SQLite enforces against duplicate pairs (real reject verified in sandbox)', () => {
    const db = makeMockDb({ playbookCols: V32_PLAYBOOK_COLS, systemCount: 0 })
    migrateConfluenceJunction(db)
    expect(createJunctionIn(db._state.execLog)[0]).toMatch(
      /PRIMARY KEY \(trade_id, playbook_id\)/i,
    )
  })
})
