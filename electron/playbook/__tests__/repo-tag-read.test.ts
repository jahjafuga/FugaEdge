// Beat 2 PART B — getPlaybookTagsForTrade reads a trade's SECONDARY confluence
// tags from the trade_playbooks junction (NOT the primary on trades.playbook_id).
// Mock SQL-contract test (better-sqlite3 won't load under vitest): assert the
// query shape + the PlaybookTag mapping. Real rows are sandbox-verified.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let prepared: Array<{ q: string; a: unknown[] }>
let allRows: unknown[]

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      all: (...a: unknown[]) => { prepared.push({ q, a }); return allRows },
      get: () => undefined,
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
    }
  },
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import { getPlaybookTagsForTrade } from '../repo'

beforeEach(() => { prepared = []; allRows = [] })

describe('getPlaybookTagsForTrade', () => {
  it('queries trade_playbooks JOIN playbooks for that trade, ordered by name', () => {
    getPlaybookTagsForTrade(42)
    const sql = prepared.find((p) => /trade_playbooks/i.test(p.q))
    expect(sql).toBeTruthy()
    expect(sql!.q).toMatch(/FROM trade_playbooks/i)
    expect(sql!.q).toMatch(/JOIN playbooks/i)
    expect(sql!.q).toMatch(/WHERE tp\.trade_id = \?/i)
    expect(sql!.q).toMatch(/ORDER BY p\.name/i)
    expect(sql!.a).toEqual([42])
  })

  it('maps rows to PlaybookTag { id, name, tier } with the tier normalized', () => {
    allRows = [
      { id: 3, name: 'Bull Flag', tier: 'A+' },
      { id: 9, name: 'VWAP Bounce', tier: 'bogus' },
    ]
    const tags = getPlaybookTagsForTrade(42)
    expect(tags).toEqual([
      { id: 3, name: 'Bull Flag', tier: 'A+' },
      { id: 9, name: 'VWAP Bounce', tier: 'B' },
    ])
  })
})
