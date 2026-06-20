// Ocean One Beat 3b — EDIT 1 proof. commit()'s insertTrip must PERSIST the
// round trip's authoritative total_fees, not hardcode 0. An OO trip carries the
// parser's 11-fee sum on total_fees and the correct net (gross - fees); if the
// INSERT drops total_fees, the recompute later clobbers net to gross (beat 3a
// Mode 1). SQL-contract test — better-sqlite3's native binary won't load under
// vitest (Electron ABI), so we drive the REAL commit() against a capturing shim
// and assert the INSERT binds @total_fees with the trip's value. The behavioral
// stored-bytes proof on real data lives in the beat-3a electron-as-node harness.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

let runLog: { sql: string; args: unknown[] }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        // INSERT OR IGNORE inserts a fresh row — no hash collision in this test.
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          return { changes: 1, lastInsertRowid: 1 }
        }
        return { changes: 1, lastInsertRowid: 0 }
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
// Isolate the INSERT binding: stub the downstream recompute/summary so this
// test asserts ONLY what insertTrip writes. The recompute bypass (EDIT 2) is
// proven separately in oo-fee-recompute-bypass.test.ts.
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: vi.fn() }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: vi.fn() }))

import { commit } from '../repo'

function ooTrip(over: Partial<RoundTrip> = {}): RoundTrip {
  return {
    date: '2026-05-01',
    symbol: 'XXII',
    side: 'long',
    open_time: '2026-05-01T13:30:00.000Z',
    close_time: '2026-05-01T13:35:00.000Z',
    is_open: false,
    shares_bought: 1,
    avg_buy_price: 2.89,
    shares_sold: 1,
    avg_sell_price: 2.92,
    gross_pnl: 0.03,
    total_fees: 0.15,
    net_pnl: -0.12,
    exec_hash: 'EH-OO-XXII',
    content_hash: 'CH-OO-XXII',
    executions: [],
    status: 'new',
    source_broker: 'OceanOne',
    fees_reported: true,
    commission: 0.1,
    ...over,
  }
}

const insertCall = () =>
  runLog.find((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))

beforeEach(() => {
  runLog = []
})

describe('commit() insertTrip persists the trip total_fees (EDIT 1)', () => {
  it('binds the trip total_fees into the INSERT (not hardcoded 0)', () => {
    commit([ooTrip({ total_fees: 0.15 })], [], 'test')
    const ins = insertCall()
    expect(ins).toBeTruthy()
    const args = ins!.args[0] as Record<string, unknown>
    expect(args.total_fees).toBe(0.15)
  })

  it('the INSERT VALUES bind @total_fees rather than a literal 0 in that slot', () => {
    commit([ooTrip()], [], 'test')
    expect(insertCall()!.sql).toMatch(/@total_fees/)
  })

  it('preserves the parser net (gross - fees) AND the fee total together', () => {
    commit([ooTrip({ gross_pnl: 0.03, total_fees: 0.15, net_pnl: -0.12 })], [], 'test')
    const args = insertCall()!.args[0] as Record<string, unknown>
    expect(args.net_pnl).toBe(-0.12)
    expect(args.total_fees).toBe(0.15)
  })
})
