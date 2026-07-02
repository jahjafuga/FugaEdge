import { describe, it, expect } from 'vitest'
import { migrateTradesRebuildDedup } from '../migrate-trades-rebuild-dedup'

// Beat 2 (Option A ratified) — the trades-table rebuild that retires the
// inline exec_hash UNIQUE (an undroppable sqlite_autoindex) in favor of the
// two per-account composite uniques. Mock-SQL-contract conn (the
// migrate-account-backfill mirror): better-sqlite3 is a type-only import in
// the migration, so a structural fake satisfies it, and an ordered event log
// pins the parts that MUST happen in order — PRAGMA foreign_keys OFF/ON
// OUTSIDE the transaction (a no-op inside one), foreign_key_check BEFORE
// COMMIT, backup before any DDL.

interface FakeIndex {
  name: string
  sql: string
}

function fakeConn(opts: {
  gateIndexPresent?: boolean
  tableSql: string
  nullAccountCount?: number
  masterIndexes?: FakeIndex[]
  fkViolations?: unknown[]
  insertChanges?: number
}) {
  const events: string[] = []
  const execLog: string[] = []
  const runLog: { sql: string; args: unknown[] }[] = []
  return {
    get events() {
      return events
    },
    get execLog() {
      return execLog
    },
    get runLog() {
      return runLog
    },
    pragma(s: string) {
      events.push(`pragma:${s}`)
      if (/^foreign_key_check/.test(s)) return opts.fkViolations ?? []
      return []
    },
    exec(sql: string) {
      events.push('exec')
      execLog.push(sql)
    },
    prepare(sql: string) {
      return {
        get: () => {
          if (/FROM sqlite_master WHERE type = 'index' AND name = 'idx_trades_exec_hash_account'/i.test(sql)) {
            return opts.gateIndexPresent ? { name: 'idx_trades_exec_hash_account' } : undefined
          }
          if (/SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trades'/i.test(sql)) {
            return { sql: opts.tableSql }
          }
          if (/COUNT\(\*\) AS n FROM trades WHERE account_id IS NULL/i.test(sql)) {
            return { n: opts.nullAccountCount ?? 0 }
          }
          return undefined
        },
        all: () => {
          if (/FROM sqlite_master WHERE type = 'index' AND tbl_name = 'trades' AND sql IS NOT NULL/i.test(sql)) {
            return opts.masterIndexes ?? []
          }
          return []
        },
        run: (...args: unknown[]) => {
          runLog.push({ sql, args })
          if (/INSERT INTO trades_new/i.test(sql)) {
            return { changes: opts.insertChanges ?? 0, lastInsertRowid: 0 }
          }
          return { changes: 0, lastInsertRowid: 0 }
        },
      }
    },
    transaction(fn: () => void) {
      return () => {
        events.push('txn:begin')
        try {
          fn()
          events.push('txn:commit')
        } catch (e) {
          events.push('txn:rollback')
          throw e
        }
      }
    },
  }
}

const LEGACY_DDL = `CREATE TABLE trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  exec_hash       TEXT    NOT NULL UNIQUE,
  account_id TEXT REFERENCES accounts(id))`

const FRESH_DDL = `CREATE TABLE trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  exec_hash       TEXT    NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id))`

const PRIOR_INDEXES: FakeIndex[] = [
  { name: 'idx_trades_date', sql: 'CREATE INDEX idx_trades_date        ON trades(date)' },
  { name: 'idx_trades_deleted_at', sql: 'CREATE INDEX idx_trades_deleted_at\n   ON trades(deleted_at) WHERE deleted_at IS NULL' },
  {
    name: 'idx_trades_content_hash',
    sql: 'CREATE UNIQUE INDEX idx_trades_content_hash\n     ON trades(content_hash) WHERE content_hash IS NOT NULL',
  },
]

function noopBackup(track?: string[]) {
  return () => {
    track?.push('backup')
  }
}

describe('migrateTradesRebuildDedup', () => {
  it('no-ops when idx_trades_exec_hash_account already exists (gate)', () => {
    const conn = fakeConn({ gateIndexPresent: true, tableSql: LEGACY_DDL })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup() })
    expect(res.status).toBe('noop-already-composite')
    expect(conn.execLog).toHaveLength(0)
    expect(conn.events.filter((e) => /^pragma:foreign_keys/.test(e))).toHaveLength(0)
  })

  it('fresh new-shape table (no inline UNIQUE): fast path creates ONLY the composites (+ drops the stale partial), no copy, no backup', () => {
    const backups: string[] = []
    const conn = fakeConn({ tableSql: FRESH_DDL })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup(backups) })
    expect(res.status).toBe('fastpath-fresh-shape')
    expect(backups).toHaveLength(0)
    expect(conn.execLog.some((s) => /DROP INDEX IF EXISTS idx_trades_content_hash/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /CREATE UNIQUE INDEX idx_trades_exec_hash_account ON trades\(account_id, exec_hash\)/i.test(s))).toBe(true)
    expect(
      conn.execLog.some((s) =>
        /CREATE UNIQUE INDEX idx_trades_content_hash_account ON trades\(account_id, content_hash\) WHERE content_hash IS NOT NULL/i.test(s),
      ),
    ).toBe(true)
    expect(conn.execLog.some((s) => /trades_new/i.test(s))).toBe(false)
  })

  it('aborts (boot survives) when any trade still has a NULL account_id — no backup, no pragma, no DDL', () => {
    const backups: string[] = []
    const conn = fakeConn({ tableSql: LEGACY_DDL, nullAccountCount: 3 })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup(backups) })
    expect(res.status).toBe('aborted')
    expect(res.reason).toMatch(/NULL account_id/i)
    expect(backups).toHaveLength(0)
    expect(conn.execLog).toHaveLength(0)
    expect(conn.events.filter((e) => /^pragma:foreign_keys/.test(e))).toHaveLength(0)
  })

  it('legacy rebuild: backup first, pragmas OUTSIDE the transaction, foreign_key_check BEFORE commit', () => {
    const conn = fakeConn({ tableSql: LEGACY_DDL, masterIndexes: PRIOR_INDEXES, insertChanges: 98 })
    const order: string[] = []
    const res = migrateTradesRebuildDedup(conn as never, {
      backup: () => order.push('backup'),
    })
    expect(res.status).toBe('rebuilt')

    const ev = conn.events
    const iOff = ev.indexOf('pragma:foreign_keys = OFF')
    const iBegin = ev.indexOf('txn:begin')
    const iCheck = ev.findIndex((e) => /^pragma:foreign_key_check/.test(e))
    const iCommit = ev.indexOf('txn:commit')
    const iOn = ev.indexOf('pragma:foreign_keys = ON')
    expect(order).toEqual(['backup']) // exactly once
    expect(iOff).toBeGreaterThanOrEqual(0)
    expect(iBegin).toBeGreaterThan(iOff) // OFF strictly before BEGIN
    expect(iCheck).toBeGreaterThan(iBegin) // check inside the transaction…
    expect(iCommit).toBeGreaterThan(iCheck) // …and BEFORE commit
    expect(iOn).toBeGreaterThan(iCommit) // ON strictly after commit
  })

  it('legacy rebuild: new DDL drops the inline UNIQUE, carries account_id NOT NULL, and the copy is an explicit 51-column INSERT…SELECT', () => {
    const conn = fakeConn({ tableSql: LEGACY_DDL, masterIndexes: PRIOR_INDEXES, insertChanges: 98 })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup() })
    expect(res.status).toBe('rebuilt')
    expect(res.rowsMoved).toBe(98)

    const create = conn.execLog.find((s) => /CREATE TABLE trades_new/i.test(s))!
    expect(create).toBeTruthy()
    expect(create).toMatch(/exec_hash\s+TEXT\s+NOT\s+NULL(?!\s+UNIQUE)/)
    expect(create).not.toMatch(/exec_hash\s+TEXT\s+NOT\s+NULL\s+UNIQUE/)
    expect(create).toMatch(/account_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+accounts\(id\)/)

    const insert = conn.runLog.find((r) => /INSERT INTO trades_new/i.test(r.sql))!
    expect(insert).toBeTruthy()
    expect(insert.sql).not.toMatch(/SELECT\s+\*/i)
    const m = insert.sql.match(/INSERT INTO trades_new \(([\s\S]+?)\)\s*SELECT\s+([\s\S]+?)\s+FROM trades/i)!
    expect(m).toBeTruthy()
    const insertCols = m[1].split(',').map((s) => s.trim())
    const selectCols = m[2].split(',').map((s) => s.trim())
    expect(insertCols).toHaveLength(51)
    expect(selectCols).toEqual(insertCols) // ids and every column preserved 1:1
    expect(insertCols).toContain('id')
    expect(insertCols).toContain('exec_hash')
    expect(insertCols).toContain('account_id')

    expect(conn.execLog.some((s) => /DROP TABLE trades\b/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /ALTER TABLE trades_new RENAME TO trades/i.test(s))).toBe(true)
  })

  it('legacy rebuild: prior named indexes are replayed at parity EXCEPT idx_trades_content_hash, plus the two composites', () => {
    const conn = fakeConn({ tableSql: LEGACY_DDL, masterIndexes: PRIOR_INDEXES, insertChanges: 98 })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup() })

    // the two survivors replayed verbatim
    expect(conn.execLog).toContain(PRIOR_INDEXES[0].sql)
    expect(conn.execLog).toContain(PRIOR_INDEXES[1].sql)
    // the superseded single-column partial MUST NOT return
    expect(conn.execLog.some((s) => /ON trades\(content_hash\)/i.test(s))).toBe(false)
    // both composites created
    expect(conn.execLog.some((s) => /idx_trades_exec_hash_account/.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /idx_trades_content_hash_account/.test(s))).toBe(true)
    // parity count: 2 replayed + 2 composites
    expect(res.indexesRecreated).toBe(4)
  })

  it('foreign_key_check violations roll the transaction back and abort — foreign_keys = ON is still restored', () => {
    const conn = fakeConn({
      tableSql: LEGACY_DDL,
      masterIndexes: PRIOR_INDEXES,
      insertChanges: 98,
      fkViolations: [{ table: 'executions', rowid: 9, parent: 'trades', fkid: 0 }],
    })
    const res = migrateTradesRebuildDedup(conn as never, { backup: noopBackup() })
    expect(res.status).toBe('aborted')
    expect(res.reason).toMatch(/foreign_key_check/i)
    expect(conn.events).toContain('txn:rollback')
    const iRollback = conn.events.indexOf('txn:rollback')
    const iOn = conn.events.indexOf('pragma:foreign_keys = ON')
    expect(iOn).toBeGreaterThan(iRollback) // finally-restored even on abort
  })
})
