// Multi-account Beat 1 — commit() stamps an account onto every inserted trip
// (LOCKED law: every new trade carries an account from this beat onward).
//   - no account passed  → ensureDefaultAccountId() resolves the default
//   - explicit account_id → wins; the default is never consulted
//
// NEW file on purpose (the beat's ZERO-existing-tests-changed gate). Harness
// mirrors summary-supersede-guard.test.ts: better-sqlite3 won't load under
// vitest, so commit() drives a SQL-routing shim whose runLog captures every
// prepare(sql).run(args); the accounts repo is mocked at the module boundary.

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
          return { changes: 1, lastInsertRowid: 1 } // fresh insert
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

function trip(symbol: string, date: string): RoundTrip {
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
    source_format: 'execution',
  }
}

function insertedTradePayloads(): Record<string, unknown>[] {
  return runLog
    .filter((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))
    .map((r) => r.args[0] as Record<string, unknown>)
}

beforeEach(() => {
  runLog = []
  feesSpy.mockClear()
  summarySpy.mockClear()
  ensureSpy.mockClear()
})

describe('commit() — account stamp (Beat 1 insertTrip fallback)', () => {
  it('stamps the DEFAULT account when no account_id is passed', () => {
    commit([trip('ACME', '2026-06-15'), trip('BETA', '2026-06-15')], [], 'test-src')
    const payloads = insertedTradePayloads()
    expect(payloads).toHaveLength(2)
    for (const p of payloads) {
      expect(p.account_id).toBe('ACCT-DEFAULT')
    }
    expect(ensureSpy).toHaveBeenCalledTimes(1) // resolved once per commit, not per trip
  })

  it('an EXPLICIT account_id wins and the default is never consulted', () => {
    commit([trip('ACME', '2026-06-15')], [], 'test-src', 'ACCT-EXPLICIT')
    const payloads = insertedTradePayloads()
    expect(payloads).toHaveLength(1)
    expect(payloads[0].account_id).toBe('ACCT-EXPLICIT')
    expect(ensureSpy).not.toHaveBeenCalled()
  })

  it('the INSERT SQL itself carries the account_id column', () => {
    commit([trip('ACME', '2026-06-15')], [], 'test-src')
    const insertSql = runLog.find((r) => /INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(r.sql))!.sql
    expect(insertSql).toMatch(/account_id/)
    expect(insertSql).toMatch(/@account_id/)
  })
})
