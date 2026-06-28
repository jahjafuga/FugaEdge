// Phase 2 beat 1 — setPlaybookOnTradesBulk: the bulk primary-playbook write.
// FAITHFULLY REPLICATES setPlaybookOnTrade (validate-once + Invariant-1 junction
// delete + update), batched into one transaction with WHERE id IN (...). Mock
// SQL-contract test (no real engine under vitest); atomicity proven via the
// transaction() wrapper usage. Mirrors repo-primary-switch.test.ts.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let runs: Array<{ sql: string; args: unknown[] }>
let txnUsed: boolean
let playbookExists: boolean

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      get: () =>
        /SELECT 1 FROM playbooks WHERE id/i.test(q)
          ? playbookExists
            ? { '1': 1 }
            : undefined
          : undefined,
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

import { setPlaybookOnTradesBulk } from '../repo'

const junctionDelete = () =>
  runs.find((r) =>
    /DELETE FROM trade_playbooks WHERE playbook_id = \? AND trade_id IN/i.test(r.sql),
  )
const bulkUpdate = () =>
  runs.find((r) => /UPDATE trades SET playbook_id = \? WHERE id IN/i.test(r.sql))

beforeEach(() => {
  runs = []
  txnUsed = false
  playbookExists = true
})

describe('setPlaybookOnTradesBulk — bulk primary playbook (batched setPlaybookOnTrade)', () => {
  it('empty tradeIds is a no-op (no SQL run, no transaction)', () => {
    setPlaybookOnTradesBulk([], 7)
    expect(runs).toEqual([])
    expect(txnUsed).toBe(false)
  })

  it('a non-null playbook runs BOTH the junction delete AND the bulk update, atomically (Invariant 1)', () => {
    setPlaybookOnTradesBulk([42, 43], 7)
    expect(txnUsed).toBe(true)
    const del = junctionDelete()
    expect(del).toBeTruthy()
    expect(del!.args).toEqual([7, 42, 43]) // playbook_id, ...trade_ids
    const upd = bulkUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7, 42, 43]) // playbook_id, ...trade_ids
  })

  it('clearing to null runs ONLY the bulk update (no junction delete)', () => {
    setPlaybookOnTradesBulk([42, 43], null)
    expect(junctionDelete()).toBeFalsy()
    const upd = bulkUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([null, 42, 43])
  })

  it('throws when the playbook does not exist; no UPDATE, no junction delete', () => {
    playbookExists = false
    expect(() => setPlaybookOnTradesBulk([42, 43], 999)).toThrow(/not found/i)
    expect(bulkUpdate()).toBeFalsy()
    expect(junctionDelete()).toBeFalsy()
  })
})
