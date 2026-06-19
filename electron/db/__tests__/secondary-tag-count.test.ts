// Beat 4c PART A — listTrades + getTrade must project secondary_tag_count via a
// correlated COUNT subquery on trade_playbooks (mirroring attachment_count).
// SQL-contract test (better-sqlite3 won't load under vitest) with the read-paths
// capturing shim: assert the reads issue the subquery + alias. Real values are
// sandbox-verified on a copy.

import { describe, expect, it, vi } from 'vitest'

let captured: string[] = []

const benign: any = new Proxy(function () {}, {
  get(_t, key) {
    if (key === Symbol.toPrimitive) return () => 0
    if (key === Symbol.iterator) return function* () {}
    if (key === 'then') return undefined
    return benign
  },
  apply() { return benign },
})

const stmt: any = {
  all: () => [benign],
  get: () => benign,
  run: () => ({ changes: 0, lastInsertRowid: 0 }),
  pluck: () => stmt,
  raw: () => stmt,
  iterate: function* () {},
}

const capturingDb: any = {
  prepare: (sql: string) => { captured.push(sql); return stmt },
  exec: (sql: string) => { captured.push(sql) },
  transaction: (fn: any) => (...a: any[]) => fn(...a),
  pragma: () => {},
}

vi.mock('../database', () => ({
  openDatabase: () => capturingDb,
  closeDatabase: () => {},
  getDbPath: () => '',
  listTables: () => [],
}))

import { listTrades, getTrade } from '../../trades/list'

const SUBQUERY = /FROM trade_playbooks GROUP BY trade_id/i
const ALIAS = /AS secondary_tag_count/i

function sqlsFrom(fn: () => unknown): string[] {
  captured = []
  try { fn() } catch { /* SQL contract only — synthetic data may throw post-capture */ }
  return captured
}

// The main trades projection (FROM trades t … LEFT JOIN playbooks).
function tradesSelect(sqls: string[]): string | undefined {
  return sqls.find((s) => /FROM trades t/i.test(s) && /LEFT JOIN playbooks/i.test(s))
}

describe('secondary_tag_count — listTrades / getTrade project the trade_playbooks count', () => {
  it('listTrades counts trade_playbooks via a correlated subquery aliased secondary_tag_count', () => {
    const sql = tradesSelect(sqlsFrom(() => listTrades()))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(SUBQUERY)
    expect(sql!).toMatch(ALIAS)
  })

  it('getTrade counts trade_playbooks via a correlated subquery aliased secondary_tag_count', () => {
    const sql = tradesSelect(sqlsFrom(() => getTrade(1)))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(SUBQUERY)
    expect(sql!).toMatch(ALIAS)
  })
})
