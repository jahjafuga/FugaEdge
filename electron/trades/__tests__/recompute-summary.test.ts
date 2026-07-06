// v0.2.3 Phase 2a — recomputeSummaryForDates, the daily_summary helper shared
// by the import commit path and the trade-lifecycle ops. SQL-contract tests
// (better-sqlite3's native binary won't load here).
//
// Multi-account Beat 4 REWRITE (flagged): daily_summary is re-keyed to
// PRIMARY KEY (date, account_id), so the old single-row ON CONFLICT(date)
// upsert is invalid. The writer's new contract — SAME caller signature:
//   • per affected date: DELETE that date's rows, then INSERT … SELECT
//     grouped BY account_id (one row per account that traded that day);
//   • an emptied date's INSERT matches nothing, so the delete-first order IS
//     the empty-date cleanup (semantics preserved from the v0.2.3 branch);
//   • the aggregate still filters deleted_at IS NULL and still classifies
//     winners/losers via the SCRATCH_EPSILON predicates (never bare-sign).

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SCRATCH_EPSILON } from '@shared/trade-classification'

let runLog: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        return { changes: 1, lastInsertRowid: 0 }
      },
      get: () => undefined,
      all: () => [],
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { recomputeSummaryForDates } from '../recompute-summary'

const insertsIn = () =>
  runLog.filter((r) => /INSERT\s+INTO\s+daily_summary/i.test(r.sql))
const deletesIn = () =>
  runLog.filter((r) => /DELETE\s+FROM\s+daily_summary/i.test(r.sql))

beforeEach(() => {
  runLog = []
})

describe('recomputeSummaryForDates (per-account rewrite)', () => {
  it('rewrites a date as DELETE-then-INSERT, grouped per account', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const dels = deletesIn()
    const ins = insertsIn()
    expect(dels).toHaveLength(1)
    expect(dels[0].args).toEqual(['2026-01-05'])
    expect(ins).toHaveLength(1)
    // The win/loss CASE binds +/-SCRATCH_EPSILON ahead of the date.
    expect(ins[0].args).toEqual([SCRATCH_EPSILON, -SCRATCH_EPSILON, '2026-01-05'])
    // DELETE must precede the INSERT (delete-first IS the empty-date cleanup).
    const delIdx = runLog.findIndex((r) => /DELETE\s+FROM\s+daily_summary/i.test(r.sql))
    const insIdx = runLog.findIndex((r) => /INSERT\s+INTO\s+daily_summary/i.test(r.sql))
    expect(delIdx).toBeLessThan(insIdx)
  })

  it('the INSERT carries account_id and groups by it — one row per account per date', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const { sql } = insertsIn()[0]
    expect(sql).toMatch(/INSERT\s+INTO\s+daily_summary\s*\(\s*date,\s*account_id,/i)
    expect(sql).toMatch(/SELECT\s+date,\s*account_id,/i)
    expect(sql).toMatch(/GROUP BY account_id/i)
    // The single-row upsert is gone with the single-column PK.
    expect(sql).not.toMatch(/ON CONFLICT/i)
  })

  it('classifies winners/losers via SCRATCH_EPSILON predicates, not bare-sign', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const { sql, args } = insertsIn()[0]
    expect(sql).toMatch(/CASE WHEN net_pnl > \? THEN 1 ELSE 0 END/)
    expect(sql).toMatch(/CASE WHEN net_pnl < \? THEN 1 ELSE 0 END/)
    expect(sql).not.toMatch(/net_pnl [<>] 0/)
    expect(args).toEqual([SCRATCH_EPSILON, -SCRATCH_EPSILON, '2026-01-05'])
  })

  it('the aggregate filters soft-deleted rows (deleted_at IS NULL)', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    expect(insertsIn()[0].sql).toMatch(
      /FROM\s+trades\s+WHERE\s+date\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i,
    )
  })

  it('routes each date independently in a batch (every date deleted + re-inserted)', () => {
    recomputeSummaryForDates(new Set(['2026-01-05', '2026-01-06']))
    expect(deletesIn().map((r) => r.args[0]).sort()).toEqual(['2026-01-05', '2026-01-06'])
    expect(insertsIn().map((r) => r.args[2]).sort()).toEqual(['2026-01-05', '2026-01-06'])
  })
})

// Precision pass Beat F3 — the writer stores a PRECISE daily net alongside the
// existing 2dp total_pnl. total_pnl (SUM(net_pnl)) is KEPT verbatim so the
// green-days badges keep evaluating on 2dp (carve-out); total_pnl_precise is a
// NEW derived column = SUM(gross_pnl_precise) - SUM(total_fees_precise) (derived,
// NOT SUM(net_pnl_precise) — an Ocean One import can leave that 0), and the two
// aggregate money columns move to their precise sources.
describe('recomputeSummaryForDates — F3 precise cache (total_pnl_precise, schema 44)', () => {
  const sqlOf = () => insertsIn()[0].sql

  it('adds total_pnl_precise derived as SUM(gross_pnl_precise) - SUM(total_fees_precise)', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const sql = sqlOf()
    expect(sql).toMatch(/total_pnl_precise/)
    expect(sql).toMatch(
      /COALESCE\(SUM\(gross_pnl_precise\),\s*0\)\s*-\s*COALESCE\(SUM\(total_fees_precise\),\s*0\)/i,
    )
  })

  it('repoints total_fees + gross_pnl to their precise columns (the 2dp SUMs are gone)', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const sql = sqlOf()
    expect(sql).toMatch(/COALESCE\(SUM\(total_fees_precise\),\s*0\)/i)
    expect(sql).toMatch(/COALESCE\(SUM\(gross_pnl_precise\),\s*0\)/i)
    expect(sql).not.toMatch(/SUM\(total_fees\)/)
    expect(sql).not.toMatch(/SUM\(gross_pnl\)/)
  })

  it('KEEPS total_pnl on the 2dp SUM(net_pnl) — the green-days carve-out source', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    expect(sqlOf()).toMatch(/SUM\(net_pnl\)/)
  })

  it('adds NO new bind parameter (derived expr is columns): args stay [eps, -eps, date]', () => {
    recomputeSummaryForDates(new Set(['2026-01-05']))
    expect(insertsIn()[0].args).toEqual([SCRATCH_EPSILON, -SCRATCH_EPSILON, '2026-01-05'])
  })
})
