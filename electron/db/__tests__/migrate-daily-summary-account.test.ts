import { describe, it, expect } from 'vitest'
import { migrateDailySummaryAccount } from '../migrate-daily-summary-account'

// Multi-account Beat 4 — daily_summary re-key: PK (date) becomes
// (date, account_id) so the per-day cache can hold one row per account (the
// day_fees rebuild's exact mirror: shape gate via PRAGMA table_info, ONE
// transaction, rows assigned to the default account resolved via the conn,
// defensive provisioning, logged summary). daily_summary has NO inbound FKs
// and no secondary index, so this is the plain create/copy/drop/rename dance.

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
    exec(sql: string) {
      execLog.push(sql)
    },
    prepare(sql: string) {
      return {
        get: () => {
          if (/SELECT id FROM accounts WHERE is_default = 1/i.test(sql)) {
            return opts.defaultAccountId ? { id: opts.defaultAccountId } : undefined
          }
          if (/COUNT\(\*\) AS n FROM daily_summary/i.test(sql)) {
            return { n: opts.rowCount ?? 0 }
          }
          if (/COUNT\(\*\) AS n FROM accounts/i.test(sql)) {
            return { n: opts.accountCount ?? (opts.defaultAccountId ? 1 : 0) }
          }
          return undefined
        },
        all: () => {
          if (/PRAGMA table_info\(daily_summary\)/i.test(sql)) {
            const base = [
              { name: 'date' },
              { name: 'total_pnl' },
              { name: 'total_fees' },
              { name: 'trade_count' },
              { name: 'winners' },
              { name: 'losers' },
              { name: 'gross_pnl' },
              { name: 'largest_win' },
              { name: 'largest_loss' },
            ]
            return opts.hasAccountColumn ? [...base, { name: 'account_id' }] : base
          }
          return []
        },
        run: (...args: unknown[]) => {
          runLog.push({ sql, args })
          if (/INSERT INTO daily_summary_new/i.test(sql)) {
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

describe('migrateDailySummaryAccount', () => {
  it('no-ops when daily_summary already carries account_id (idempotency gate)', () => {
    const conn = fakeConn({ hasAccountColumn: true, rowCount: 16 })
    migrateDailySummaryAccount(conn as never)
    expect(conn.execLog).toHaveLength(0)
    expect(conn.runLog).toHaveLength(0)
    expect(conn.txnUsed).toBe(false)
  })

  it('rebuilds to PK (date, account_id) and assigns the 16 rows to the EXISTING default, in one transaction', () => {
    const conn = fakeConn({ rowCount: 16, defaultAccountId: 'ACCT-DEF' })
    migrateDailySummaryAccount(conn as never)

    expect(conn.txnUsed).toBe(true)

    const create = conn.execLog.find((s) => /CREATE TABLE daily_summary_new/i.test(s))!
    expect(create).toBeTruthy()
    expect(create).toMatch(/account_id\s+TEXT\s+NOT\s+NULL\s+REFERENCES\s+accounts\(id\)/i)
    expect(create).toMatch(/PRIMARY KEY \(date, account_id\)/i)

    const ins = conn.runLog.find((r) => /INSERT INTO daily_summary_new/i.test(r.sql))!
    expect(ins).toBeTruthy()
    expect(ins.sql).not.toMatch(/SELECT\s+\*/i)
    expect(ins.args).toEqual(['ACCT-DEF'])

    expect(conn.execLog.some((s) => /DROP TABLE daily_summary\b/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /ALTER TABLE daily_summary_new RENAME TO daily_summary/i.test(s))).toBe(true)
    expect(conn.runLog.some((r) => /INSERT INTO accounts/i.test(r.sql))).toBe(false)
  })

  it("defensive: rows exist but no default anywhere -> provisions 'Main account' and assigns to it", () => {
    const conn = fakeConn({ rowCount: 4, defaultAccountId: null, accountCount: 0 })
    migrateDailySummaryAccount(conn as never)
    const acctInsert = conn.runLog.find((r) => /INSERT INTO accounts/i.test(r.sql))!
    expect(acctInsert).toBeTruthy()
    expect(acctInsert.args[1]).toBe('Main account')
    expect(acctInsert.args[6]).toBe(1)
    const ins = conn.runLog.find((r) => /INSERT INTO daily_summary_new/i.test(r.sql))!
    expect(ins.args).toEqual([acctInsert.args[0]])
  })

  it('zero rows + no default: rebuild still lands the new shape without inventing an account', () => {
    const conn = fakeConn({ rowCount: 0, defaultAccountId: null, accountCount: 0 })
    migrateDailySummaryAccount(conn as never)
    expect(conn.execLog.some((s) => /CREATE TABLE daily_summary_new/i.test(s))).toBe(true)
    expect(conn.execLog.some((s) => /ALTER TABLE daily_summary_new RENAME TO daily_summary/i.test(s))).toBe(true)
    expect(conn.runLog.some((r) => /INSERT INTO accounts/i.test(r.sql))).toBe(false)
  })
})
