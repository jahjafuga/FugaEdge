// Multi-account Beat 2 — the duplicate GATE and the resurrect lookup become
// account-scoped (scoping, NOT re-hashing: hash computation is untouched).
//   - annotateTripStatus(trips, accountId?): hash-match AND account_id = ?
//     AND deleted_at IS NULL; absent accountId resolves the default; a null
//     default (virgin DB) marks everything 'new' without querying.
//   - resurrectTrip revives ONLY the chosen account's soft-deleted twin.
// SQL-routing shim (the supersede-guard precedent); accounts repo mocked at
// the module boundary.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy, defaultSpy, ensureSpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
  defaultSpy: vi.fn<[], string | null>(() => 'ACCT-DEFAULT'),
  ensureSpy: vi.fn(() => 'ACCT-DEFAULT'),
}))

// Rows the gate query sees: hash pair + owning account.
let dbRows: { exec_hash: string; content_hash: string; account_id: string; deleted: boolean }[] = []
let runLog: { sql: string; args: unknown[] }[] = []
let gateArgsLog: unknown[][] = []

const GATE_RE = /SELECT 1 FROM trades WHERE \(exec_hash = \? OR content_hash = \?\) AND account_id = \? AND deleted_at IS NULL/i

const mockDb = {
  prepare(sql: string) {
    return {
      get: (...args: unknown[]) => {
        if (GATE_RE.test(sql)) {
          gateArgsLog.push(args)
          const [eh, ch, acct] = args as [string, string, string]
          const hit = dbRows.find(
            (r) =>
              !r.deleted &&
              r.account_id === acct &&
              (r.exec_hash === eh || r.content_hash === ch),
          )
          return hit ? { 1: 1 } : undefined
        }
        return undefined
      },
      all: () => [],
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          // Composite-unique semantics: blocked only by a SAME-ACCOUNT row.
          const p = args[0] as { exec_hash: string; content_hash: string; account_id: string }
          const blocked = dbRows.some(
            (r) =>
              r.account_id === p.account_id &&
              (r.exec_hash === p.exec_hash || r.content_hash === p.content_hash),
          )
          return { changes: blocked ? 0 : 1, lastInsertRowid: 1 }
        }
        if (/UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL/i.test(sql)) {
          const p = args[0] as { exec_hash: string; content_hash: string; account_id: string }
          const twin = dbRows.find(
            (r) =>
              r.deleted &&
              r.account_id === p.account_id &&
              (r.exec_hash === p.exec_hash || r.content_hash === p.content_hash),
          )
          if (twin) twin.deleted = false
          return { changes: twin ? 1 : 0, lastInsertRowid: 0 }
        }
        return { changes: 0, lastInsertRowid: 0 }
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
vi.mock('../../accounts/repo', () => ({
  getDefaultAccountId: defaultSpy,
  ensureDefaultAccountId: ensureSpy,
}))

import { annotateTripStatus, commit } from '../repo'

function trip(over: Partial<RoundTrip> = {}): RoundTrip {
  return {
    date: '2026-06-15',
    symbol: 'ACME',
    side: 'long',
    open_time: '2026-06-15T14:30:00.000Z',
    close_time: '2026-06-15T15:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 100,
    exec_hash: 'EH-1',
    content_hash: 'CH-1',
    executions: [],
    status: 'new',
    source_format: 'execution',
    ...over,
  }
}

beforeEach(() => {
  dbRows = []
  runLog = []
  gateArgsLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
  defaultSpy.mockClear()
  defaultSpy.mockReturnValue('ACCT-DEFAULT')
  ensureSpy.mockClear()
})

describe('annotateTripStatus — per-account duplicate gate', () => {
  it('same hashes + DIFFERENT account -> NOT duplicate', () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-A', deleted: false }]
    const [t] = annotateTripStatus([trip()], 'ACCT-B')
    expect(t.status).toBe('new')
    expect(gateArgsLog[0]).toEqual(['EH-1', 'CH-1', 'ACCT-B'])
  })

  it('same hashes + SAME account -> duplicate', () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-A', deleted: false }]
    const [t] = annotateTripStatus([trip()], 'ACCT-A')
    expect(t.status).toBe('duplicate')
  })

  it('absent accountId -> default-scoped (resolved via getDefaultAccountId)', () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-DEFAULT', deleted: false }]
    const [t] = annotateTripStatus([trip()])
    expect(t.status).toBe('duplicate')
    expect(defaultSpy).toHaveBeenCalledTimes(1)
    expect(gateArgsLog[0]).toEqual(['EH-1', 'CH-1', 'ACCT-DEFAULT'])
  })

  it('absent accountId + NO default (virgin DB) -> everything new, gate never queried', () => {
    defaultSpy.mockReturnValue(null)
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-A', deleted: false }]
    const [t] = annotateTripStatus([trip()])
    expect(t.status).toBe('new')
    expect(gateArgsLog).toHaveLength(0)
  })
})

describe('commit resurrect — account-scoped twin revival', () => {
  it('the resurrect UPDATE carries the account scope in SQL and args', () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-X', deleted: true }]
    commit([trip()], [], 'test', 'ACCT-X')
    const upd = runLog.find((r) => /UPDATE\s+trades\s+SET\s+deleted_at\s*=\s*NULL/i.test(r.sql))!
    expect(upd).toBeTruthy()
    expect(upd.sql).toMatch(/AND\s+account_id\s*=\s*@account_id/i)
    expect(upd.args[0]).toEqual({
      exec_hash: 'EH-1',
      content_hash: 'CH-1',
      account_id: 'ACCT-X',
    })
  })

  it('revives the SAME account soft-deleted twin (resurrectedTrips)', () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-X', deleted: true }]
    const out = commit([trip()], [], 'test', 'ACCT-X')
    expect(out.resurrectedTrips).toBe(1)
    expect(dbRows[0].deleted).toBe(false)
  })

  it("NEVER revives ANOTHER account's deleted twin — the fresh insert proceeds instead", () => {
    dbRows = [{ exec_hash: 'EH-1', content_hash: 'CH-1', account_id: 'ACCT-OTHER', deleted: true }]
    const out = commit([trip()], [], 'test', 'ACCT-X')
    expect(out.insertedTrips).toBe(1) // composite unique permits the cross-account insert
    expect(out.resurrectedTrips).toBe(0)
    expect(dbRows[0].deleted).toBe(true) // the other account's trash is untouched
  })
})
