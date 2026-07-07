// Multi-account (sim-unlock audit, fix beat 1 — the Journal mini-slice) —
// getJournalDay's per-day trade summary was the audit's ONE UNWALLED leak:
// it gains the seam clause + binds (math and column shape unchanged).
// Routing-shim style (the c50155c/d1e2703 mirror): the fake db routes the
// summary read BY THE SQL THE SEAM GENERATES, and the legacy-unfiltered
// route returns a POISONED aggregate (a +999 sim winner folded in) so a
// missing clause inflates trade_count, net_pnl, AND winners. The module's
// day METADATA reads (journal entry, settings rules, session_meta
// sentiment) stay GLOBAL — pinned.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let alls: { sql: string; args: unknown[] }[] = []
let gets: { sql: string; args: unknown[] }[] = []

const SUMMARY_A = { trade_count: 2, net_pnl: 150, gross_pnl: 160, total_fees: 10, winners: 2, losers: 0 }
const SUMMARY_B = { trade_count: 1, net_pnl: -30, gross_pnl: -28, total_fees: 2, winners: 0, losers: 1 }
const SUMMARY_WALL = { trade_count: 3, net_pnl: 120, gross_pnl: 132, total_fees: 12, winners: 2, losers: 1 }
// The poison: the sim account's +999 winner folded into every figure.
const SUMMARY_LEGACY_POISONED = { trade_count: 4, net_pnl: 1119, gross_pnl: 1131, total_fees: 12, winners: 3, losers: 1 }

function routeSummary(sql: string, args: unknown[]) {
  if (/account_id = \?/.test(sql)) {
    const acct = args[args.length - 1] as string
    if (acct === 'ACCT-A') return SUMMARY_A
    if (acct === 'ACCT-B') return SUMMARY_B
    return { trade_count: 0, net_pnl: 0, gross_pnl: 0, total_fees: 0, winners: 0, losers: 0 }
  }
  if (sql.includes(SIM_WALL)) return SUMMARY_WALL
  return SUMMARY_LEGACY_POISONED
}

const mockDb = {
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        gets.push({ sql, args })
        if (/FROM trades/i.test(sql)) return routeSummary(sql, args)
        return undefined // journal entry / settings rules / session_meta
      },
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        return []
      },
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getJournalDay } from '../get'

beforeEach(() => {
  alls = []
  gets = []
})

const DATE = '2026-06-09'
const summaryReads = () => gets.filter((c) => /FROM trades/i.test(c.sql))
const metadataReads = () =>
  gets.filter((c) => /FROM journal|FROM session_meta|FROM settings/i.test(c.sql))

describe('getJournalDay — the day summary through the seam', () => {
  it("single scope: that account's figures only; SQL carries account_id = ? with the bind (epsilons first, then date, then the id)", () => {
    const a = getJournalDay(DATE, { accountId: 'ACCT-A' })
    const r = summaryReads()[0]
    expect(r.sql).toMatch(/account_id = \?/)
    expect(r.sql).toMatch(/deleted_at IS NULL/i)
    expect(r.args).toEqual([expect.any(Number), expect.any(Number), DATE, 'ACCT-A'])
    expect(a.summary).toEqual(SUMMARY_A)

    gets = []
    const b = getJournalDay(DATE, { accountId: 'ACCT-B' })
    expect(b.summary).toEqual(SUMMARY_B)
  })

  it("'all': the wall in the SQL; the poisoned sim winner never enters any figure", () => {
    const d = getJournalDay(DATE, 'all')
    const r = summaryReads()[0]
    expect(r.sql).toContain(SIM_WALL)
    expect(r.args).toEqual([expect.any(Number), expect.any(Number), DATE])
    expect(d.summary).toEqual(SUMMARY_WALL)
  })

  it("absent scope: output byte-equal to explicit 'all', wall in the SQL", () => {
    const absent = getJournalDay(DATE)
    expect(summaryReads()[0].sql).toContain(SIM_WALL)
    gets = []
    alls = []
    const explicit = getJournalDay(DATE, 'all')
    expect(absent).toEqual(explicit)
  })

  it('day metadata GLOBAL: the entry, rules, and sentiment reads carry NO account dimension under every scope', () => {
    getJournalDay(DATE, { accountId: 'ACCT-A' })
    getJournalDay(DATE, 'all')
    const meta = metadataReads()
    expect(meta.length).toBeGreaterThanOrEqual(6)
    for (const m of meta) {
      expect(m.sql).not.toMatch(/account_id/i)
    }
  })
})

// Precision pass Beat F4 — the journal day summary's money totals read the
// precise columns; the win/loss counts stay 2dp (carve-out).
describe('getJournalDay — F4 precise day-summary money totals', () => {
  it('sums net_pnl_precise / gross_pnl_precise / total_fees_precise; win/loss CASE stays 2dp', () => {
    getJournalDay(DATE, 'all')
    const r = summaryReads()[0]
    expect(r.sql).toMatch(/COALESCE\(SUM\(net_pnl_precise\), 0\)\s+AS net_pnl/i)
    expect(r.sql).toMatch(/COALESCE\(SUM\(gross_pnl_precise\), 0\)\s+AS gross_pnl/i)
    expect(r.sql).toMatch(/COALESCE\(SUM\(total_fees_precise\), 0\)\s+AS total_fees/i)
    // Carve-out: winners/losers classify on the 2dp net_pnl.
    expect(r.sql).toMatch(/CASE WHEN net_pnl > \?/)
  })
})
