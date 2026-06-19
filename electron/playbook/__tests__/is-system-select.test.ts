// Beat 3 PART A — is_system must be exposed to the renderer so the picker can
// pin/identify "No Setup" and the available-secondaries filter can exclude
// system rows. SQL-contract test (better-sqlite3 won't load under vitest):
// assert the listPlaybooks AND getPlaybook SELECTs now project is_system. Real
// values are sandbox-verified on a copy.

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

vi.mock('../../db/database', () => ({ openDatabase: () => capturingDb }))

import { listPlaybooks, getPlaybook } from '../repo'

// The playbooks projection (FROM playbooks, not the per-playbook stats query
// over trades, and not the trade_playbooks junction).
function playbookSelect(fn: () => unknown): string | undefined {
  captured = []
  try { fn() } catch { /* SQL contract only */ }
  return captured.find(
    (s) => /SELECT/i.test(s) && /FROM playbooks\b/i.test(s) && !/trade_playbooks/i.test(s),
  )
}

describe('PART A — listPlaybooks / getPlaybook project is_system', () => {
  it('listPlaybooks SELECT includes is_system', () => {
    const sql = playbookSelect(() => listPlaybooks())
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/\bis_system\b/i)
  })

  it('getPlaybook SELECT includes is_system', () => {
    const sql = playbookSelect(() => getPlaybook(1))
    expect(sql).toBeTruthy()
    expect(sql!).toMatch(/\bis_system\b/i)
  })
})
