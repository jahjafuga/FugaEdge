// SQL-contract test — the repo has no real-DB harness (better-sqlite3's native
// binary won't load under vitest), so we mirror the mock-shim pattern from
// lifecycle.test.ts: mock openDatabase to a shim that records the prepared SQL
// text and the all() bind args, and serves a configurable row set. The
// re-ordering / missing-id / dedupe logic is covered purely in
// src/lib/__tests__/orderByIds.test.ts; here we pin the SQL contract and that
// getTradesByIdsForTechnicals actually delegates ordering (doesn't trust SQL
// row order).

import { describe, expect, it, beforeEach, vi } from 'vitest'

let prepareSqls: string[] = []
let allCallArgs: unknown[][] = []
let rowsToReturn: Array<{
  id: number
  symbol: string
  date: string
  side: 'long' | 'short'
  executions_json: string | null
}> = []

const mockDb = {
  prepare(sql: string) {
    prepareSqls.push(sql)
    return {
      all: (...args: unknown[]) => {
        allCallArgs.push(args)
        return rowsToReturn
      },
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { getTradesByIdsForTechnicals } from '../list'

beforeEach(() => {
  prepareSqls = []
  allCallArgs = []
  rowsToReturn = []
})

describe('getTradesByIdsForTechnicals', () => {
  // (a)
  it('early-returns for empty ids without preparing any SQL', () => {
    const result = getTradesByIdsForTechnicals([])
    expect(result).toEqual([])
    expect(prepareSqls).toHaveLength(0)
  })

  // (b)
  it('constructs WHERE id IN with the correct number of placeholders', () => {
    getTradesByIdsForTechnicals([1, 2, 3])
    expect(prepareSqls).toHaveLength(1)
    expect(prepareSqls[0]).toContain('WHERE id IN (?,?,?)')
  })

  // (c)
  it('selects only the 5 fields needed for technicals compute', () => {
    getTradesByIdsForTechnicals([1])
    const sql = prepareSqls[0]
    expect(sql).toContain('SELECT id, symbol, date, side, executions_json')
    // No LEFT JOIN-heavy getTrade(id) shape — lean projection only.
    expect(sql).not.toMatch(/JOIN/i)
  })

  // (d)
  it('applies the deleted_at IS NULL filter', () => {
    getTradesByIdsForTechnicals([1, 2])
    expect(prepareSqls[0]).toContain('deleted_at IS NULL')
  })

  // (e)
  it('passes the ids as bind args to all()', () => {
    getTradesByIdsForTechnicals([10, 20, 30])
    expect(allCallArgs).toHaveLength(1)
    expect(allCallArgs[0]).toEqual([10, 20, 30])
  })

  // (f)
  it('delegates row ordering to orderByIds', () => {
    // SQL returns natural (scrambled vs input) order; the function must re-order.
    rowsToReturn = [
      { id: 2, symbol: 'B', date: '2026-06-01', side: 'short', executions_json: '[]' },
      { id: 1, symbol: 'A', date: '2026-06-01', side: 'long', executions_json: '[]' },
    ]
    const result = getTradesByIdsForTechnicals([1, 2])
    expect(result[0].id).toBe(1)
    expect(result[1].id).toBe(2)
  })
})
