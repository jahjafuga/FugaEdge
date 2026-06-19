// Beat 2 PART D — Invariant 1 on the PRIMARY path. Promoting a playbook to the
// primary (setPlaybookOnTrade) must also drop it from the trade_playbooks
// junction, atomically, so it's never both primary AND a secondary. Setting the
// primary to null leaves the junction untouched. Mock SQL-contract test (no real
// engine under vitest); atomicity proven via the transaction() wrapper usage.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let runs: Array<{ sql: string; args: unknown[] }>
let txnUsed: boolean

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      get: () => (/SELECT 1 FROM playbooks WHERE id/i.test(q) ? { '1': 1 } : undefined),
      all: () => [],
      run: (...a: unknown[]) => { runs.push({ sql: q, args: a }); return { changes: 1, lastInsertRowid: 1 } },
    }
  },
  transaction(fn: any) { txnUsed = true; return (...a: any[]) => fn(...a) },
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import { setPlaybookOnTrade } from '../repo'

const junctionDelete = () =>
  runs.find((r) => /DELETE FROM trade_playbooks WHERE trade_id = \? AND playbook_id = \?/i.test(r.sql))
const primaryUpdate = () =>
  runs.find((r) => /UPDATE trades SET playbook_id = \? WHERE id = \?/i.test(r.sql))

beforeEach(() => { runs = []; txnUsed = false })

describe('setPlaybookOnTrade — Invariant 1 on the primary path', () => {
  it('promoting a playbook to primary ALSO removes it from the junction, atomically', () => {
    setPlaybookOnTrade(42, 7)
    expect(txnUsed).toBe(true)
    const del = junctionDelete()
    expect(del).toBeTruthy()
    expect(del!.args).toEqual([42, 7])
    const upd = primaryUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7, 42])
  })

  it('setting primary to null leaves the junction untouched (no junction DELETE)', () => {
    setPlaybookOnTrade(42, null)
    expect(junctionDelete()).toBeFalsy()
    const upd = primaryUpdate()
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([null, 42])
  })
})
