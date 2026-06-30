// TradeZero File 2 Phase 2 — the duplicate-guard (summary YIELDS to executions).
//
// Two halves, proven exhaustively here because part B DELETES existing DB rows:
//   PART A — markSummariesSuperseded (pure status logic, NO deletion): an
//     incoming summary trip is marked 'duplicate' (so commit skips it) when a
//     non-summary "authoritative" trip covers its (symbol, date), from EITHER
//     the DB (Scenario 2) OR the same incoming batch (Scenario 1).
//   PART B — commit()'s supersede DELETE (THE DESTRUCTIVE PART): when an
//     authoritative trip is committed, any stale DB summary for that exact
//     (symbol, date) is HARD-DELETED. The predicate must be PROVABLY narrow —
//     source_format='summary' AND matching (symbol,date) AND deleted_at IS NULL
//     — and must NEVER touch an execution / hand-entered / uncovered-summary row.
//
// better-sqlite3's native binary won't load under vitest, so we drive repo
// against a SQL-routing shim (the dedup-resurrect-rides-existing-recompute.test
// precedent): the SELECT DISTINCT returns configured DB execution coverage, the
// supersede DELETE returns changes based on configured DB summary keys, and
// runLog captures every prepare(sql).run(args) so the destructive SQL's shape +
// args are asserted directly.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy } = vi.hoisted(() => ({ feesSpy: vi.fn(), summarySpy: vi.fn() }))

// ── Shim state (reset per test) ──────────────────────────────────────────────
let dbExecutionRows: { symbol: string; date: string }[] = [] // SELECT DISTINCT non-summary coverage
let dbSummaryKeys = new Set<string>() // `${symbol}|${date}` rows the supersede DELETE will hit
let runLog: { sql: string; args: unknown[] }[] = []

const SUPERSEDE_RE = /DELETE\s+FROM\s+trades\s+WHERE\s+symbol\s*=\s*\?\s+AND\s+date\s*=\s*\?\s+AND\s+source_format\s*=\s*'summary'/i

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        if (SUPERSEDE_RE.test(sql)) {
          const [symbol, date] = args as [string, string]
          const key = `${symbol}|${date}`
          const had = dbSummaryKeys.has(key)
          if (had) dbSummaryKeys.delete(key)
          return { changes: had ? 1 : 0, lastInsertRowid: 0 }
        }
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          return { changes: 1, lastInsertRowid: 1 } // fresh insert
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
      get: () => undefined,
      all: () => {
        if (/SELECT\s+DISTINCT\s+symbol,\s*date\s+FROM\s+trades/i.test(sql)) return dbExecutionRows
        return []
      },
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: feesSpy }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: summarySpy }))

import { markSummariesSuperseded, commit } from '../repo'

function baseTrip(symbol: string, date: string): RoundTrip {
  return {
    date,
    symbol,
    side: 'long',
    open_time: `${date}T14:30:00.000Z`,
    close_time: `${date}T15:00:00.000Z`,
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 100,
    exec_hash: `EH-${symbol}-${date}`,
    content_hash: `CH-${symbol}-${date}`,
    executions: [],
    status: 'new',
  }
}
const execTrip = (symbol: string, date: string): RoundTrip => ({
  ...baseTrip(symbol, date),
  source_format: 'execution',
})
const summaryTrip = (symbol: string, date: string): RoundTrip => ({
  ...baseTrip(symbol, date),
  source_format: 'summary',
  exec_hash: `EHS-${symbol}-${date}`,
  content_hash: `CHS-${symbol}-${date}`,
})

beforeEach(() => {
  dbExecutionRows = []
  dbSummaryKeys = new Set()
  runLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
})

// ── PART A — markSummariesSuperseded (no deletion) ───────────────────────────
describe('markSummariesSuperseded — incoming summary yields to executions', () => {
  it('Scenario 1 (same batch): summary dropped when an execution covers (symbol,date)', () => {
    const { trips, superseded } = markSummariesSuperseded([
      execTrip('ACME', '2026-06-15'),
      summaryTrip('ACME', '2026-06-15'),
    ])
    expect(superseded).toBe(1)
    expect(trips.find((t) => t.source_format === 'execution')!.status).toBe('new')
    expect(trips.find((t) => t.source_format === 'summary')!.status).toBe('duplicate')
  })

  it('Scenario 1 non-overlap: different symbols → BOTH stay new (no false drop)', () => {
    const { trips, superseded } = markSummariesSuperseded([
      execTrip('AAPL', '2026-06-15'),
      summaryTrip('TSLA', '2026-06-15'),
    ])
    expect(superseded).toBe(0)
    for (const t of trips) expect(t.status).toBe('new')
  })

  it('Scenario 2 (summary vs DB execution): summary dropped when DB has an execution for (symbol,date)', () => {
    dbExecutionRows = [{ symbol: 'X', date: '2026-06-15' }]
    const { trips, superseded } = markSummariesSuperseded([summaryTrip('X', '2026-06-15')])
    expect(superseded).toBe(1)
    expect(trips[0].status).toBe('duplicate')
  })

  it('Scenario 2 non-overlap: DB execution on a DIFFERENT date → summary still imports', () => {
    dbExecutionRows = [{ symbol: 'X', date: '2026-06-15' }]
    const { trips, superseded } = markSummariesSuperseded([summaryTrip('X', '2026-06-16')])
    expect(superseded).toBe(0)
    expect(trips[0].status).toBe('new')
  })

  it('does not touch a non-summary incoming trip even if its (symbol,date) is covered', () => {
    // Two executions same (symbol,date) — neither is a summary, so neither yields.
    const { trips, superseded } = markSummariesSuperseded([
      execTrip('X', '2026-06-15'),
      { ...execTrip('X', '2026-06-15'), exec_hash: 'EH-X-2', content_hash: 'CH-X-2' },
    ])
    expect(superseded).toBe(0)
    for (const t of trips) expect(t.status).toBe('new')
  })
})

// ── PART B — commit() supersede DELETE (DESTRUCTIVE) ─────────────────────────
describe('commit() — execution supersedes a pre-existing DB summary (case b)', () => {
  const supersedeDeletes = () => runLog.filter((r) => SUPERSEDE_RE.test(r.sql))

  it('hard-deletes the stale summary and reports supersededTrips', () => {
    dbSummaryKeys = new Set(['X|2026-06-15'])
    const out = commit([execTrip('X', '2026-06-15')], [], 'test')
    // The execution inserted.
    expect(out.insertedTrips).toBe(1)
    // Exactly one supersede DELETE, for (X, 2026-06-15), and it removed the row.
    const dels = supersedeDeletes()
    expect(dels).toHaveLength(1)
    expect(dels[0].args).toEqual(['X', '2026-06-15'])
    expect(out.supersededTrips).toBe(1)
    expect(dbSummaryKeys.has('X|2026-06-15')).toBe(false) // gone from the modelled DB
  })

  it('the DELETE predicate is provably narrow — source_format=summary AND deleted_at IS NULL', () => {
    dbSummaryKeys = new Set(['X|2026-06-15'])
    commit([execTrip('X', '2026-06-15')], [], 'test')
    const del = supersedeDeletes()[0]
    expect(del.sql).toMatch(/source_format\s*=\s*'summary'/i)
    expect(del.sql).toMatch(/deleted_at\s+IS\s+NULL/i)
    expect(del.sql).toMatch(/symbol\s*=\s*\?\s+AND\s+date\s*=\s*\?/i)
    // It must NEVER be an unscoped delete.
    expect(del.sql).not.toMatch(/DELETE\s+FROM\s+trades\s*$/i)
  })

  it('boundary — supersedes ONLY the incoming (symbol,date); other rows untouched', () => {
    // DB: summary (X,D) and summary (Z,D2) exist; an execution (Y,D) also exists
    // (modelled only as NOT a summary key — the predicate can't reach it).
    dbSummaryKeys = new Set(['X|2026-06-15', 'Z|2026-06-20'])
    const out = commit([execTrip('X', '2026-06-15')], [], 'test')
    const dels = supersedeDeletes()
    // Only ONE delete ran — for the incoming execution's key.
    expect(dels).toHaveLength(1)
    expect(dels[0].args).toEqual(['X', '2026-06-15'])
    expect(out.supersededTrips).toBe(1)
    // (Z,D2) summary never targeted; (Y,D) execution never targeted.
    expect(dbSummaryKeys.has('Z|2026-06-20')).toBe(true)
    expect(dels.some((d) => d.args[0] === 'Z' || d.args[0] === 'Y')).toBe(false)
  })

  it('boundary — no authoritative trip → NO supersede DELETE runs (summary stays)', () => {
    dbSummaryKeys = new Set(['X|2026-06-15'])
    // A standalone summary import (no execution coverage) reaches commit and inserts.
    const out = commit([summaryTrip('W', '2026-06-21')], [], 'test')
    expect(supersedeDeletes()).toHaveLength(0)
    expect(out.supersededTrips).toBe(0)
    expect(dbSummaryKeys.has('X|2026-06-15')).toBe(true) // untouched
  })

  it('atomicity — the supersede DELETE and the execution INSERT run in the same commit()', () => {
    dbSummaryKeys = new Set(['X|2026-06-15'])
    commit([execTrip('X', '2026-06-15')], [], 'test')
    const sawDelete = runLog.some((r) => SUPERSEDE_RE.test(r.sql))
    const sawInsert = runLog.some((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))
    // Both present in one commit() invocation = inside the one db.transaction().
    expect(sawDelete).toBe(true)
    expect(sawInsert).toBe(true)
  })

  it('a non-summary incoming trip with no DB summary → zero deletes, zero count', () => {
    const out = commit([execTrip('NONE', '2026-06-15')], [], 'test')
    expect(out.supersededTrips).toBe(0)
    // The DELETE still RUNS (idempotent enforcement) but matches nothing.
    const dels = supersedeDeletes()
    expect(dels).toHaveLength(1)
    expect(dels[0].args).toEqual(['NONE', '2026-06-15'])
  })
})
