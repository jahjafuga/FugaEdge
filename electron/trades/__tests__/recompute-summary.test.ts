// v0.2.3 Phase 2a — recomputeSummaryForDates, the daily_summary helper shared
// by the import commit path and the trade-lifecycle ops. Two behaviors under
// test (SQL-contract, since better-sqlite3's native binary won't load here):
//   • upsert branch: a date with >= 1 live trade runs the INSERT…ON CONFLICT
//     upsert, and that SQL filters deleted_at IS NULL;
//   • empty-date branch (reinforcement #2): a date that has dropped to ZERO
//     live trades DELETEs its stale daily_summary row instead of upserting —
//     so the dashboard (which reads daily_summary directly) stops showing P&L
//     for a day with no live trades.
// The per-date live count is sourced from a configurable map on the shim.

import { describe, expect, it, beforeEach, vi } from 'vitest'

let runLog: { sql: string; args: unknown[] }[] = []
let liveCountByDate: Record<string, number> = {}

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        return { changes: 1, lastInsertRowid: 0 }
      },
      get: (...args: unknown[]) => {
        if (/COUNT\(\*\)\s+AS\s+n\s+FROM\s+trades/i.test(sql)) {
          const d = String(args[0])
          return { n: liveCountByDate[d] ?? 0 }
        }
        return undefined
      },
      all: () => [],
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { recomputeSummaryForDates } from '../recompute-summary'

const upsertsIn = () =>
  runLog.filter((r) => /INSERT\s+INTO\s+daily_summary/i.test(r.sql))
const deletesIn = () =>
  runLog.filter((r) => /DELETE\s+FROM\s+daily_summary/i.test(r.sql))

beforeEach(() => {
  runLog = []
  liveCountByDate = {}
})

describe('recomputeSummaryForDates', () => {
  it('upserts daily_summary for a date that still has live trades', () => {
    liveCountByDate = { '2026-01-05': 3 }
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const ups = upsertsIn()
    expect(ups).toHaveLength(1)
    expect(ups[0].args).toEqual(['2026-01-05'])
    expect(deletesIn()).toHaveLength(0)
  })

  it('the upsert aggregate filters soft-deleted rows (deleted_at IS NULL)', () => {
    liveCountByDate = { '2026-01-05': 1 }
    recomputeSummaryForDates(new Set(['2026-01-05']))
    expect(upsertsIn()[0].sql).toMatch(/FROM\s+trades\s+WHERE\s+date\s*=\s*\?\s+AND\s+deleted_at\s+IS\s+NULL/i)
  })

  it('empty-date branch: DELETEs the stale summary row when zero live trades remain', () => {
    liveCountByDate = { '2026-01-05': 0 }
    recomputeSummaryForDates(new Set(['2026-01-05']))
    const dels = deletesIn()
    expect(dels).toHaveLength(1)
    expect(dels[0].args).toEqual(['2026-01-05'])
    // Must NOT upsert an empty aggregate (that would no-op and leave the row).
    expect(upsertsIn()).toHaveLength(0)
  })

  it('routes each date independently in a mixed batch (upsert one, delete the other)', () => {
    liveCountByDate = { '2026-01-05': 2, '2026-01-06': 0 }
    recomputeSummaryForDates(new Set(['2026-01-05', '2026-01-06']))
    expect(upsertsIn().map((r) => r.args[0])).toEqual(['2026-01-05'])
    expect(deletesIn().map((r) => r.args[0])).toEqual(['2026-01-06'])
  })
})
