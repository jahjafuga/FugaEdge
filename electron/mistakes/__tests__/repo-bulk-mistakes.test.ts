// Phase 2 beat 3 — bulk mistakes: addMistakesToTradesBulk (union, INSERT OR
// IGNORE over the cross-product) + removeMistakesFromTradesBulk (strip, single
// cross-product DELETE). Junction keyed by mistake_def_id; both blind-safe (no
// per-trade current-state read). Mock SQL-contract test (no real engine under
// vitest); atomicity via the transaction() wrapper. Mirrors repo-bulk-set-playbook
// / catalyst-bulk.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let runs: Array<{ sql: string; args: unknown[] }>
let txnUsed: boolean

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      get: () => undefined,
      all: () => [],
      run: (...a: unknown[]) => {
        runs.push({ sql: q, args: a })
        return { changes: 1, lastInsertRowid: 1 }
      },
    }
  },
  transaction(fn: any) {
    txnUsed = true
    return (...a: any[]) => fn(...a)
  },
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import { addMistakesToTradesBulk, removeMistakesFromTradesBulk } from '../repo'

const inserts = () => runs.filter((r) => /INSERT OR IGNORE INTO trade_mistake/i.test(r.sql))
const deletes = () => runs.filter((r) => /DELETE FROM trade_mistake/i.test(r.sql))

beforeEach(() => {
  runs = []
  txnUsed = false
})

describe('addMistakesToTradesBulk — union (INSERT OR IGNORE over the cross-product)', () => {
  it('empty trades OR empty defs is a no-op (no SQL, no transaction)', () => {
    addMistakesToTradesBulk([], [7])
    addMistakesToTradesBulk([42], [])
    expect(runs).toEqual([])
    expect(txnUsed).toBe(false)
  })

  it('runs INSERT OR IGNORE for EACH (trade, def) pair, in one transaction', () => {
    addMistakesToTradesBulk([42, 43], [7, 8])
    expect(txnUsed).toBe(true)
    const ins = inserts()
    expect(ins.length).toBe(4)
    // Idempotency guard: it is INSERT OR IGNORE (re-adding a held mistake is a
    // silent no-op via the composite PK), NOT a bare INSERT.
    expect(ins.every((r) => /INSERT OR IGNORE/i.test(r.sql))).toBe(true)
    expect(ins.map((r) => r.args)).toEqual([
      [42, 7],
      [42, 8],
      [43, 7],
      [43, 8],
    ])
  })
})

describe('removeMistakesFromTradesBulk — strip (single cross-product DELETE)', () => {
  it('empty trades OR empty defs is a no-op (no SQL, no transaction)', () => {
    removeMistakesFromTradesBulk([], [7])
    removeMistakesFromTradesBulk([42], [])
    expect(runs).toEqual([])
    expect(txnUsed).toBe(false)
  })

  it('runs a SINGLE DELETE with trade_id IN AND mistake_def_id IN, in one transaction', () => {
    removeMistakesFromTradesBulk([42, 43], [7, 8])
    expect(txnUsed).toBe(true)
    const del = deletes()
    expect(del.length).toBe(1)
    expect(del[0].sql).toMatch(
      /DELETE FROM trade_mistake WHERE trade_id IN \(\?,\?\) AND mistake_def_id IN \(\?,\?\)/i,
    )
    expect(del[0].args).toEqual([42, 43, 7, 8]) // ...tradeIds, ...defIds
  })
})
