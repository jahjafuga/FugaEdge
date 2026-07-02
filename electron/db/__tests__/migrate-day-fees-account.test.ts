import { describe, it, expect } from 'vitest'
import { migrateDayFeesAccount } from '../migrate-day-fees-account'

// Multi-account Beat 2 — day_fees rebuild: PK (date, symbol) becomes
// (date, symbol, account_id) so two accounts' fee files can coexist for the
// same day and symbol. Journal-rules mirror: shape-detected (PRAGMA
// table_info), ONE transaction, logged summary; existing rows are assigned to
// the default account resolved via the conn directly (the Beat 1 backfill's
// own pattern — no repo import inside a migration).

function fakeConn(opts: {
  hasAccountColumn?: boolean
  rowCount?: number
  defaultAccountId?: string | null
  accountCount?: number
}) {
  const execLog: string[] = []
  const runLog: { sql: string; args: unknown[] }[] = []
  let txnUsed = false
  return {
    get execLog() {
      return execLog
    },
    get runLog() {
      return runLog
    },
    get txnUsed() {
      return txnUsed
    },
    pragma() {
      return []
    },
    exec(sql: string) {
      execLog.push(sql)
    },
    prepare(sql: string) {
      return {
        get: () => {
          if (/SELECT id FROM accounts WHERE is_default = 1/i.test(sql)) {
            return opts.defaultAccountId ? { id: opts.defaultAccountId } : undefined
          }
          if (/COUNT\(\*\) AS n FROM day_fees/i.test(sql)) {
            return { n: opts.rowCount ?? 0 }
          }
          if (/COUNT\(\*\) AS n FROM accounts/i.test(sql)) {
            return { n: opts.accountCount ?? (opts.defaultAccountId ? 1 : 0) }
          }
          return undefined
        },
        all: () => {
          if (/PRAGMA table_info\(day_fees\)/i.test(sql)) {
            const base = [
              { name: 'date' },
              { name: 'symbol' },
              { name: 'fee_ecn' },
              { name: 'fee_sec' },
              { name: 'fee_finra' },
              { name: 'fee_htb' },
              { name: 'fee_cat' },
              { name: 'total_fees' },
              { name: 'source' },
              { name: 'created_at' },
            ]
            return opts.hasAccountColumn ? [...base, { name: 'account_id' }] : base
          }
          return []
        },
        run: (...args: unknown[]) => {
          runLog.push({ sql, args })
          if (/INSERT INTO day_fees_new/i.test(sql)) {
            return { changes: opts.rowCount ?? 0, lastInsertRowid: 0 }
          }
          return { changes: 1, lastInsertRowid: 0 }
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

describe('migrateDayFeesAccount', () => {
  it('no-ops when day_fees already carries account_id (idempotency gate)', () => {
    const conn = fakeConn({ hasAccountColumn: true, rowCount: 42 })
    migrateDayFeesAccount(conn as never)
    expect(conn.execLog).toHaveLength(0)
    expect(conn.runLog).toHaveLength(0)
    expect(conn.txnUsed).toBe(false)
  })

  it('rebuilds to PK (date, symbol, account_id) and assigns the 42 rows to the EXISTING default, in one transaction', () => {
    const conn = fakeConn({ rowCount: 42, defaultAccountId: 'ACCT-DEF' })
    migrateDayFeesAccount(conn as never)

    expect(conn.txnUsed).toBe(true)

    const create = conn.execLog.find((s) => /CREATE TABLE day_fees_new/i.test(s))!
    expect(create).toBeTruthy()
    expect(create).toMatch(/account_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+accounts\(id\)/i)
    expect(create).toMatch(/PRIMARY KEY \(date, symbol, account_id\)/i)

    const ins = conn.runLog.find((r) => /INSERT INTO day_fees_new/i.test(r.sql))!
    expect(ins).toBeTruthy()
    expect(ins.sql).not.toMatch(/SELECT\s+\*/i)
    expect(ins.args).toEqual(['ACCT-DEF']) // every existing row assigned to the default

    expect(conn.execLog.some((s) => /DROP TABLE day_fees\b/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /ALTER TABLE day_fees_new RENAME TO day_fees/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /CREATE INDEX IF NOT EXISTS idx_day_fees_date/i.test(s))).toBe(true)
    // no second account invented
    expect(conn.runLog.some((r) => /INSERT INTO accounts/i.test(r.sql))).toBe(false)
  })

  it("defensive: rows exist but no default anywhere -> provisions 'Main account' and assigns to it", () => {
    const conn = fakeConn({ rowCount: 7, defaultAccountId: null, accountCount: 0 })
    migrateDayFeesAccount(conn as never)
    const acctInsert = conn.runLog.find((r) => /INSERT INTO accounts/i.test(r.sql))!
    expect(acctInsert).toBeTruthy()
    expect(acctInsert.args[1]).toBe('Main account')
    expect(acctInsert.args[6]).toBe(1) // is_default
    const ins = conn.runLog.find((r) => /INSERT INTO day_fees_new/i.test(r.sql))!
    expect(ins.args).toEqual([acctInsert.args[0]]) // bound to the created ULID
  })

  it('zero rows + no default: rebuild still lands the new shape without inventing an account', () => {
    const conn = fakeConn({ rowCount: 0, defaultAccountId: null, accountCount: 0 })
    migrateDayFeesAccount(conn as never)
    expect(conn.execLog.some((s) => /CREATE TABLE day_fees_new/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /ALTER TABLE day_fees_new RENAME TO day_fees/i.test(s))).toBe(true)
    expect(conn.runLog.some((r) => /INSERT INTO accounts/i.test(r.sql))).toBe(false)
  })
})
