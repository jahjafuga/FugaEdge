import { describe, it, expect } from 'vitest'
import { migrateAccountBackfill } from '../migrate-account-backfill'

// Multi-account Beat 1 — the account backfill (journal-rules mirror: shape
// detection, one transaction, logged summary). Mock-SQL-contract conn records
// prepare() + run() calls; the migration's better-sqlite3 import is type-only,
// so a structural fake satisfies it at runtime (the migrate-* test convention).
//
// The predicate and the assignment UPDATE must cover soft-deleted rows too
// (restore correctness), so BOTH SQL strings are asserted to carry NO
// deleted_at filter.

interface FakeAccount {
  id: string
  status: string
  is_default: number
  created_at: string
}

function fakeConn(opts: { nullTrades: number; accounts?: FakeAccount[] }) {
  let nullTrades = opts.nullTrades
  const accounts: FakeAccount[] = [...(opts.accounts ?? [])]
  const prepared: string[] = []
  const runs: { sql: string; args: unknown[] }[] = []
  let txnUsed = false
  return {
    get prepared() {
      return prepared
    },
    get runs() {
      return runs
    },
    get txnUsed() {
      return txnUsed
    },
    get accounts() {
      return accounts
    },
    prepare(sql: string) {
      prepared.push(sql)
      return {
        get: () => {
          if (/COUNT\(\*\) AS n FROM trades WHERE account_id IS NULL/i.test(sql)) {
            return { n: nullTrades }
          }
          if (/SELECT id FROM accounts WHERE is_default = 1/i.test(sql)) {
            const row = accounts.find((a) => a.is_default === 1)
            return row ? { id: row.id } : undefined
          }
          if (/COUNT\(\*\) AS n FROM accounts/i.test(sql)) {
            return { n: accounts.length }
          }
          if (/WHERE status = 'active' ORDER BY created_at ASC/i.test(sql)) {
            const actives = accounts
              .filter((a) => a.status === 'active')
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
            return actives[0] ? { id: actives[0].id } : undefined
          }
          return undefined
        },
        all: () => [],
        run: (...args: unknown[]) => {
          runs.push({ sql, args })
          if (/INSERT INTO accounts/i.test(sql)) {
            accounts.push({
              id: args[0] as string,
              status: args[5] as string,
              is_default: args[6] as number,
              created_at: args[7] as string,
            })
            return { changes: 1, lastInsertRowid: 0 }
          }
          if (/UPDATE trades SET account_id = \?/i.test(sql)) {
            const changes = nullTrades
            nullTrades = 0
            return { changes, lastInsertRowid: 0 }
          }
          if (/UPDATE accounts SET is_default = 1 WHERE id = \?/i.test(sql)) {
            const row = accounts.find((a) => a.id === args[0])
            if (row) row.is_default = 1
            return { changes: row ? 1 : 0, lastInsertRowid: 0 }
          }
          return { changes: 0, lastInsertRowid: 0 }
        },
      }
    },
    transaction(fn: () => void) {
      return () => {
        txnUsed = true
        return fn()
      }
    },
  }
}

describe('migrateAccountBackfill', () => {
  it("empty registry: creates 'Main account' (margin, default) and assigns every NULL trade, in one transaction", () => {
    const conn = fakeConn({ nullTrades: 98 })
    migrateAccountBackfill(conn as never)

    expect(conn.txnUsed).toBe(true)

    const inserts = conn.runs.filter((r) => /INSERT INTO accounts/i.test(r.sql))
    expect(inserts).toHaveLength(1)
    expect(inserts[0].args[1]).toBe('Main account') // name
    expect(inserts[0].args[3]).toBe('margin') // account_type
    expect(inserts[0].args[5]).toBe('active') // status
    expect(inserts[0].args[6]).toBe(1) // is_default

    const assigns = conn.runs.filter((r) => /UPDATE trades SET account_id = \?/i.test(r.sql))
    expect(assigns).toHaveLength(1)
    expect(assigns[0].args[0]).toBe(inserts[0].args[0]) // assigned to the created account's id
  })

  it('re-run is a no-op: predicate finds nothing → no INSERT, no UPDATE, no transaction', () => {
    const conn = fakeConn({
      nullTrades: 0,
      accounts: [{ id: 'A1', status: 'active', is_default: 1, created_at: '2026-01-01T00:00:00.000Z' }],
    })
    migrateAccountBackfill(conn as never)
    expect(conn.runs).toHaveLength(0)
    expect(conn.txnUsed).toBe(false)
  })

  it('existing default: assigns NULL trades to it WITHOUT creating a second account', () => {
    const conn = fakeConn({
      nullTrades: 5,
      accounts: [{ id: 'ACCT-EXISTING', status: 'active', is_default: 1, created_at: '2026-01-01T00:00:00.000Z' }],
    })
    migrateAccountBackfill(conn as never)
    expect(conn.runs.filter((r) => /INSERT INTO accounts/i.test(r.sql))).toHaveLength(0)
    const assigns = conn.runs.filter((r) => /UPDATE trades SET account_id = \?/i.test(r.sql))
    expect(assigns).toHaveLength(1)
    expect(assigns[0].args[0]).toBe('ACCT-EXISTING')
  })

  it('covers soft-deleted rows: neither the predicate nor the assignment filters on deleted_at', () => {
    const conn = fakeConn({ nullTrades: 3 })
    migrateAccountBackfill(conn as never)
    const tradesSqls = conn.prepared.filter((s) => /FROM trades|UPDATE trades/i.test(s))
    expect(tradesSqls.length).toBeGreaterThan(0)
    for (const sql of tradesSqls) {
      expect(sql).not.toMatch(/deleted_at/i)
    }
  })

  it('defensive: registry non-empty but no default → promotes the earliest active account, creates nothing', () => {
    const conn = fakeConn({
      nullTrades: 7,
      accounts: [
        { id: 'A-LATER', status: 'active', is_default: 0, created_at: '2026-02-01T00:00:00.000Z' },
        { id: 'A-EARLIEST', status: 'active', is_default: 0, created_at: '2026-01-01T00:00:00.000Z' },
        { id: 'A-ARCHIVED', status: 'archived', is_default: 0, created_at: '2025-12-01T00:00:00.000Z' },
      ],
    })
    migrateAccountBackfill(conn as never)
    expect(conn.runs.filter((r) => /INSERT INTO accounts/i.test(r.sql))).toHaveLength(0)
    const promotes = conn.runs.filter((r) => /UPDATE accounts SET is_default = 1/i.test(r.sql))
    expect(promotes).toHaveLength(1)
    expect(promotes[0].args[0]).toBe('A-EARLIEST')
    const assigns = conn.runs.filter((r) => /UPDATE trades SET account_id = \?/i.test(r.sql))
    expect(assigns[0].args[0]).toBe('A-EARLIEST')
  })
})
