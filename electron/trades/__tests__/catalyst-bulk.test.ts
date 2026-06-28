// Phase 2 beat 2 — setCatalystOnTradesBulk: the bulk catalyst write. UNLIKE the
// single saveCatalyst (which sets catalyst_type AND days_since_catalyst together),
// the bulk sets catalyst_type ONLY, so each trade keeps its own days-since. Mock
// SQL-contract test (no real engine under vitest); atomicity via the transaction()
// wrapper. Mirrors electron/playbook/__tests__/repo-bulk-set-playbook.test.ts.

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

import { setCatalystOnTradesBulk } from '../catalyst'

const bulkUpdate = () =>
  runs.find((r) => /UPDATE trades SET catalyst_type = \? WHERE id IN/i.test(r.sql))

beforeEach(() => {
  runs = []
  txnUsed = false
})

describe('setCatalystOnTradesBulk — bulk catalyst (catalyst_type ONLY, days_since untouched)', () => {
  it('empty tradeIds is a no-op (no SQL, no transaction)', () => {
    setCatalystOnTradesBulk([], 'News / PR')
    expect(runs).toEqual([])
    expect(txnUsed).toBe(false)
  })

  it('sets catalyst_type by WHERE id IN — and the SQL does NOT touch days_since_catalyst', () => {
    setCatalystOnTradesBulk([42, 43], 'News / PR')
    expect(txnUsed).toBe(true)
    const upd = bulkUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual(['News / PR', 42, 43]) // catalyst_type, ...trade_ids
    // THE DIVERGENCE GUARD: the bulk sets catalyst_type ONLY (unlike saveCatalyst,
    // which also sets days_since). A days_since in this SQL would clobber every
    // selected trade's own value.
    expect(upd!.sql).not.toMatch(/days_since/i)
  })

  it('null clears the catalyst (bulk-clear), still no days_since', () => {
    setCatalystOnTradesBulk([42, 43], null)
    const upd = bulkUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([null, 42, 43])
    expect(upd!.sql).not.toMatch(/days_since/i)
  })

  it('a whitespace-only value collapses to null (cleanType applied, matching the single-save)', () => {
    setCatalystOnTradesBulk([42], '   ')
    const upd = bulkUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([null, 42])
  })
})
