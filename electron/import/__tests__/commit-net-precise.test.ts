// Precision pass Beat F3 — EDIT proof for the Ocean One net gap. commit()/insertTrip
// binds gross_pnl_precise / total_fees_precise (Beat B2a) but LEFT net_pnl_precise = 0.
// The allocator (apply-fees.ts:67) fills it for fees_reported = 0 (DAS/Webull) rows but
// SKIPS Ocean One (fees_reported = 1), so an OO trip imported after F0 carries
// net_pnl_precise = 0 while its real net is nonzero. F3 closes that at insert: the INSERT
// binds net_pnl_precise = gross_pnl_precise - total_fees_precise, mirroring the allocator.
//
// SQL-contract test — better-sqlite3's Electron ABI won't load under vitest, so commit()
// drives a capturing shim (the commit-precise.test.ts harness) and we assert the bind +
// the INSERT SQL. Row-level readback on real data is the STEP 4 rehearsal.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy, ensureSpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
  ensureSpy: vi.fn(() => 'ACCT-DEFAULT'),
}))

let runLog: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          return { changes: 1, lastInsertRowid: 1 }
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
      get: () => undefined,
      all: () => [],
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: feesSpy }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: summarySpy }))
vi.mock('../../accounts/repo', () => ({ ensureDefaultAccountId: ensureSpy }))

import { commit } from '../repo'

// An Ocean One-shaped trip: authoritative precise gross/fees whose sub-penny tail
// differs from the 2dp columns, and fees_reported = 1 (so the allocator skips it).
function ooPreciseTrip(): RoundTrip {
  return {
    date: '2026-06-15',
    symbol: 'LABT',
    side: 'long',
    open_time: '2026-06-15T14:30:00.000Z',
    close_time: '2026-06-15T15:00:00.000Z',
    is_open: false,
    shares_bought: 28,
    avg_buy_price: 3.3,
    shares_sold: 28,
    avg_sell_price: 3.53,
    gross_pnl: 6.45,
    total_fees: 0.65,
    net_pnl: 5.8,
    gross_pnl_precise: 6.445,
    total_fees_precise: 0.6465,
    exec_hash: 'EH-LABT-NP',
    content_hash: 'CH-LABT-NP',
    executions: [],
    status: 'new',
    source_broker: 'OceanOne',
    source_format: 'summary',
    fees_reported: true,
  }
}

function insertedTradePayload(): Record<string, unknown> {
  const row = runLog.find((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))!
  return row.args[0] as Record<string, unknown>
}

beforeEach(() => {
  runLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
  ensureSpy.mockClear()
})

describe('commit() — Beat F3 writes net_pnl_precise at insert (was left 0)', () => {
  it('binds net_pnl_precise = gross_pnl_precise - total_fees_precise (the precise net, not 0)', () => {
    commit([ooPreciseTrip()], [], 'test-src')
    const p = insertedTradePayload()
    // 6.445 - 0.6465 = 5.7985 — derived from the precise gross/fees, never the 2dp net.
    expect(p.net_pnl_precise).toBeCloseTo(5.7985, 4)
    expect(p.net_pnl_precise).not.toBe(0)
    expect(p.net_pnl_precise).not.toBe(p.net_pnl)
  })

  it('the INSERT SQL carries net_pnl_precise and its bind param', () => {
    commit([ooPreciseTrip()], [], 'test-src')
    const sql = runLog.find((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))!.sql
    expect(sql).toMatch(/net_pnl_precise/)
    expect(sql).toMatch(/@net_pnl_precise/)
  })
})
