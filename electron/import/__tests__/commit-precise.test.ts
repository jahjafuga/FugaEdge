// Beat B2a — commit()/insertTrip persists the precise columns. The parser and
// builder set gross_pnl_precise / total_fees_precise on the RoundTrip; the repo
// INSERT must carry them into trades.gross_pnl_precise / total_fees_precise so
// Beat B3 can sum them. This locks the WRITE binding; the real persist+readback
// on live-shaped data is the beat's sandbox live-look.
//
// NEW file (the beat's zero-existing-tests-changed gate). Harness mirrors
// commit-account-stamp.test.ts: better-sqlite3 won't load under vitest, so
// commit() drives a SQL-routing shim whose runLog captures every
// prepare(sql).run(args); the fee/summary/accounts deps are mocked.

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

// An Ocean One-shaped trip: 2dp display columns AND their full-precision
// companions, which differ in the sub-penny tail.
function preciseTrip(): RoundTrip {
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
    exec_hash: 'EH-LABT',
    content_hash: 'CH-LABT',
    executions: [],
    status: 'new',
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

describe('commit() — Beat B2a persists the precise columns', () => {
  it('binds gross_pnl_precise / total_fees_precise from the trip (the raw value, not 0 or the 2dp value)', () => {
    commit([preciseTrip()], [], 'test-src')
    const p = insertedTradePayload()
    expect(p.gross_pnl_precise).toBeCloseTo(6.445, 3)
    expect(p.total_fees_precise).toBeCloseTo(0.6465, 4)
    expect(p.gross_pnl_precise).not.toBe(0)
    expect(p.total_fees_precise).not.toBe(0)
    expect(p.gross_pnl_precise).not.toBe(p.gross_pnl)
    expect(p.total_fees_precise).not.toBe(p.total_fees)
  })

  it('the INSERT SQL itself carries the two precise columns and their bind params', () => {
    commit([preciseTrip()], [], 'test-src')
    const sql = runLog.find((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))!.sql
    expect(sql).toMatch(/gross_pnl_precise/)
    expect(sql).toMatch(/@gross_pnl_precise/)
    expect(sql).toMatch(/total_fees_precise/)
    expect(sql).toMatch(/@total_fees_precise/)
  })
})
