// Beat 2 PART E — Route A: a system PRIMARY ("No Setup", is_system=1) must emit
// a NULL playbook_tier so it stays out of Tier Performance (tiers.ts skips null)
// AND shows no grade badge anywhere — WITHOUT touching tiers.ts or any consumer.
// The tier comes from three LEFT JOIN playbooks sites: listTrades + getTrade
// (electron/trades/list.ts) and the dashboard latest-session
// (electron/stats/dashboard.ts). SQL-contract test (better-sqlite3 won't load
// under vitest) mirroring read-paths-deleted-filter.test.ts's capturing shim:
// assert each tier JOIN now selects the CASE WHEN. Real null-tier behavior is
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
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ canceled: true }) },
}))
vi.mock('node:fs/promises', () => ({ writeFile: async () => {} }))

import { listTrades, getTrade } from '../../trades/list'
import { getDashboardData } from '../../stats/dashboard'

const CASE_WHEN =
  /CASE\s+WHEN\s+p\.is_system\s*=\s*1\s+THEN\s+NULL\s+ELSE\s+p\.tier\s+END\s+AS\s+playbook_tier/i

function sqlsFrom(fn: () => unknown): string[] {
  captured = []
  try { fn() } catch { /* SQL contract only — synthetic data may throw post-capture */ }
  return captured
}

function tierJoinSql(sqls: string[]): string | undefined {
  return sqls.find((s) => /playbook_tier/i.test(s) && /JOIN playbooks/i.test(s))
}

describe('Route A — a system primary emits NULL tier (3 join sites)', () => {
  it('listTrades suppresses the tier of a system primary', () => {
    const sql = tierJoinSql(sqlsFrom(() => listTrades()))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(CASE_WHEN)
  })

  it('getTrade suppresses the tier of a system primary', () => {
    const sql = tierJoinSql(sqlsFrom(() => getTrade(1)))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(CASE_WHEN)
  })

  it('dashboard latest-session suppresses the tier of a system primary', () => {
    const sql = tierJoinSql(sqlsFrom(() => getDashboardData('all')))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(CASE_WHEN)
  })
})
