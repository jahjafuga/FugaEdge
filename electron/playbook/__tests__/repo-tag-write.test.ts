// Beat 2 PART C — addPlaybookTag / removePlaybookTag write the trade_playbooks
// junction (the EXTRA confluence tags). Two invariants on add:
//   Inv 2 — a system "No Setup" (is_system=1) can NEVER be a secondary.
//   Inv 1 — a playbook that is the trade's PRIMARY can't also be a secondary.
// Mock SQL-contract + pure-logic test (no real engine under vitest): assert the
// rejections throw and emit no INSERT, the happy path emits INSERT OR IGNORE,
// and remove emits the DELETE. Real PK/FK behavior is sandbox-verified.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let prepared: string[]
let runs: Array<{ sql: string; args: unknown[] }>
let respond: (sql: string, args: unknown[]) => unknown

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      get: (...a: unknown[]) => { prepared.push(q); return respond(q, a) },
      all: () => { prepared.push(q); return [] },
      run: (...a: unknown[]) => { prepared.push(q); runs.push({ sql: q, args: a }); return { changes: 1, lastInsertRowid: 1 } },
    }
  },
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import { addPlaybookTag, removePlaybookTag } from '../repo'

// Program the two reads add does: the playbook's is_system, and the trade's
// current primary playbook_id.
function program(opts: { pbSystem: number | null; primary: number | null | 'no-trade' }) {
  return (q: string): unknown => {
    if (/SELECT is_system FROM playbooks WHERE id/i.test(q)) {
      return opts.pbSystem === null ? undefined : { is_system: opts.pbSystem }
    }
    if (/SELECT playbook_id FROM trades WHERE id/i.test(q)) {
      return opts.primary === 'no-trade' ? undefined : { playbook_id: opts.primary }
    }
    return undefined
  }
}

const insertedTag = () => runs.some((r) => /INSERT (OR IGNORE )?INTO trade_playbooks/i.test(r.sql))

beforeEach(() => { prepared = []; runs = []; respond = () => undefined })

describe('addPlaybookTag — validation', () => {
  it('rejects a playbook that does not exist; no INSERT', () => {
    respond = program({ pbSystem: null, primary: 5 })
    expect(() => addPlaybookTag(42, 99)).toThrow(/not found/i)
    expect(insertedTag()).toBe(false)
  })

  it('Invariant 2 — rejects a system playbook (is_system=1); no INSERT', () => {
    respond = program({ pbSystem: 1, primary: 5 })
    expect(() => addPlaybookTag(42, 108)).toThrow(/system/i)
    expect(insertedTag()).toBe(false)
  })

  it('Invariant 1 — rejects the trade\'s current primary; no INSERT', () => {
    respond = program({ pbSystem: 0, primary: 7 })
    expect(() => addPlaybookTag(42, 7)).toThrow(/primary/i)
    expect(insertedTag()).toBe(false)
  })

  it('happy path — inserts via INSERT OR IGNORE (re-add is a benign no-op)', () => {
    respond = program({ pbSystem: 0, primary: 5 })
    addPlaybookTag(42, 7)
    const ins = runs.find((r) => /INSERT OR IGNORE INTO trade_playbooks/i.test(r.sql))
    expect(ins).toBeTruthy()
    expect(ins!.sql).toMatch(/\(trade_id, playbook_id\) VALUES \(\?, \?\)/i)
    expect(ins!.args).toEqual([42, 7])
  })
})

describe('removePlaybookTag', () => {
  it('issues DELETE on (trade_id, playbook_id)', () => {
    respond = program({ pbSystem: 0, primary: 5 })
    removePlaybookTag(42, 7)
    const del = runs.find((r) => /DELETE FROM trade_playbooks WHERE trade_id = \? AND playbook_id = \?/i.test(r.sql))
    expect(del).toBeTruthy()
    expect(del!.args).toEqual([42, 7])
  })

  it('removing an absent pair is a clean no-op (no throw)', () => {
    respond = program({ pbSystem: 0, primary: 5 })
    expect(() => removePlaybookTag(42, 999)).not.toThrow()
  })
})
