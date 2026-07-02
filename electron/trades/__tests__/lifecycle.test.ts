// v0.2.3 Phase 2a — the trade-lifecycle layer (soft-delete / restore /
// hard-delete, single + bulk). SQL-contract tests against a routing shim
// (better-sqlite3's native binary won't load under vitest). recompute fns are
// mocked as spies so we can assert each op recomputes fees-per-pair and
// summary-per-date inside its transaction. Real-DB behavior is sandbox-verified
// later; here we pin the contract: correct mutation SQL, correct ordering
// (capture BEFORE delete), transaction wrapping, and the attachment-path return.

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { feesSpy, summarySpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
}))

let runLog: { sql: string; args: unknown[] }[] = []
let transactionCalls = 0
// Configurable per test: rows returned by the `WHERE id IN` capture SELECT and
// the trade_attachments SELECT.
let affectedRows: { date: string; symbol: string; account_id: string }[] = []
let attachmentRows: { trade_id: number; filename: string }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        return { changes: 1, lastInsertRowid: 0 }
      },
      all: (...args: unknown[]) => {
        // Log SELECTs too so ordering assertions (capture BEFORE delete) can see
        // them — collectAffected and the attachment lookup both use .all().
        runLog.push({ sql, args })
        if (/FROM\s+trades\s+WHERE\s+id\s+IN/i.test(sql)) return affectedRows
        if (/FROM\s+trade_attachments\s+WHERE\s+trade_id\s+IN/i.test(sql)) return attachmentRows
        return []
      },
      get: () => undefined,
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    transactionCalls++
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../../import/apply-fees', () => ({ recomputeFeesForDateSymbol: feesSpy }))
vi.mock('../recompute-summary', () => ({ recomputeSummaryForDates: summarySpy }))

import {
  softDeleteTrade,
  softDeleteTrades,
  restoreTrade,
  restoreTrades,
  hardDeleteTrade,
  hardDeleteTrades,
} from '../lifecycle'

const runsMatching = (re: RegExp) => runLog.filter((r) => re.test(r.sql))

beforeEach(() => {
  runLog = []
  transactionCalls = 0
  affectedRows = [{ date: '2026-01-05', symbol: 'AAPL', account_id: 'ACCT-1' }]
  attachmentRows = []
  feesSpy.mockClear()
  summarySpy.mockClear()
})

describe('softDelete', () => {
  it('softDeleteTrade sets deleted_at = datetime(now) for the one id', () => {
    softDeleteTrade(7)
    const ups = runsMatching(/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*datetime\('now'\)\s+WHERE\s+id\s+IN/i)
    expect(ups).toHaveLength(1)
    expect(ups[0].args).toEqual([7])
  })

  it('softDeleteTrades sets deleted_at for the whole batch in one statement', () => {
    softDeleteTrades([7, 8, 9])
    const ups = runsMatching(/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*datetime\('now'\)/i)
    expect(ups).toHaveLength(1) // one IN(...) statement, not three
    expect(ups[0].args).toEqual([7, 8, 9])
  })

  it('recomputes fees per affected pair and summary for affected dates', () => {
    affectedRows = [
      { date: '2026-01-05', symbol: 'AAPL', account_id: 'ACCT-1' },
      { date: '2026-01-06', symbol: 'TSLA', account_id: 'ACCT-2' },
    ]
    softDeleteTrades([7, 8])
    // Beat 2: the fee re-spread is (date, symbol, account)-scoped.
    expect(feesSpy.mock.calls).toEqual([
      ['2026-01-05', 'AAPL', 'ACCT-1'],
      ['2026-01-06', 'TSLA', 'ACCT-2'],
    ])
    expect(summarySpy).toHaveBeenCalledTimes(1)
    const dates = summarySpy.mock.calls[0][0] as Set<string>
    expect([...dates].sort()).toEqual(['2026-01-05', '2026-01-06'])
  })

  it('wraps the whole op in a single db.transaction', () => {
    softDeleteTrades([7, 8])
    expect(transactionCalls).toBe(1)
  })
})

describe('restore', () => {
  it('restoreTrade sets deleted_at = NULL for the one id', () => {
    restoreTrade(7)
    const ups = runsMatching(/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL\s+WHERE\s+id\s+IN/i)
    expect(ups).toHaveLength(1)
    expect(ups[0].args).toEqual([7])
  })

  it('restoreTrades clears deleted_at for the whole batch in one statement', () => {
    restoreTrades([7, 8])
    const ups = runsMatching(/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL/i)
    expect(ups).toHaveLength(1)
    expect(ups[0].args).toEqual([7, 8])
  })

  it('recomputes fees + summary and wraps in one transaction', () => {
    restoreTrades([7])
    expect(feesSpy).toHaveBeenCalledWith('2026-01-05', 'AAPL', 'ACCT-1') // Beat 2: account-scoped
    expect(summarySpy).toHaveBeenCalledTimes(1)
    expect(transactionCalls).toBe(1)
  })
})

describe('hardDelete', () => {
  it('deletes trade_attachments rows explicitly BEFORE deleting the trades', () => {
    hardDeleteTrades([7, 8])
    const attIdx = runLog.findIndex((r) => /DELETE\s+FROM\s+trade_attachments\s+WHERE\s+trade_id\s+IN/i.test(r.sql))
    const trIdx = runLog.findIndex((r) => /DELETE\s+FROM\s+trades\s+WHERE\s+id\s+IN/i.test(r.sql))
    expect(attIdx).toBeGreaterThanOrEqual(0)
    expect(trIdx).toBeGreaterThanOrEqual(0)
    expect(attIdx).toBeLessThan(trIdx)
    expect(runsMatching(/DELETE\s+FROM\s+trade_attachments/i)[0].args).toEqual([7, 8])
    expect(runsMatching(/DELETE\s+FROM\s+trades\s+WHERE\s+id\s+IN/i)[0].args).toEqual([7, 8])
  })

  it('captures attachment paths BEFORE deletion and returns them as <tradeId>/<filename>', () => {
    attachmentRows = [
      { trade_id: 7, filename: 'a1.png' },
      { trade_id: 7, filename: 'b2.jpg' },
    ]
    const res = hardDeleteTrade(7)
    expect(res.deletedAttachmentPaths).toEqual(['7/a1.png', '7/b2.jpg'])
    // The attachment SELECT must precede the attachment DELETE.
    const selIdx = runLog.findIndex((r) => /SELECT[\s\S]*FROM\s+trade_attachments\s+WHERE\s+trade_id\s+IN/i.test(r.sql))
    const delIdx = runLog.findIndex((r) => /DELETE\s+FROM\s+trade_attachments/i.test(r.sql))
    expect(selIdx).toBeGreaterThanOrEqual(0)
    expect(selIdx).toBeLessThan(delIdx)
  })

  it('returns an empty path list when the purged trades had no attachments', () => {
    attachmentRows = []
    expect(hardDeleteTrade(7).deletedAttachmentPaths).toEqual([])
  })

  it('recomputes fees + summary and wraps in one transaction', () => {
    hardDeleteTrades([7])
    expect(feesSpy).toHaveBeenCalledWith('2026-01-05', 'AAPL', 'ACCT-1') // Beat 2: account-scoped
    expect(summarySpy).toHaveBeenCalledTimes(1)
    expect(transactionCalls).toBe(1)
  })
})
