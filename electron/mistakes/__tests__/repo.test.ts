// Beat 2a — mistakes repo: listMistakeDefs (vocabulary read), getMistakeTagsForTrade
// (junction JOIN read), addMistakeTag / removeMistakeTag (junction writes).
// Mock SQL-contract test (better-sqlite3 won't load under vitest): assert the
// query shapes + args + the MistakeDef / MistakeTag mapping. Real PK/FK behavior
// is sandbox-verified (beat 1b). Mirrors playbook/__tests__/repo-tag-*.test.ts.

import { describe, expect, it, vi, beforeEach } from 'vitest'

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

let prepared: Array<{ q: string; a: unknown[] }>
let runs: Array<{ sql: string; args: unknown[] }>
let respond: (q: string, a: unknown[]) => unknown
let allRows: unknown[]

const db: any = {
  prepare(sql: string) {
    const q = norm(sql)
    return {
      all: (...a: unknown[]) => {
        prepared.push({ q, a })
        return allRows
      },
      get: (...a: unknown[]) => {
        prepared.push({ q, a })
        return respond(q, a)
      },
      run: (...a: unknown[]) => {
        prepared.push({ q, a })
        runs.push({ sql: q, args: a })
        return { changes: 1, lastInsertRowid: 1 }
      },
    }
  },
  pragma: () => {},
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import {
  listMistakeDefs,
  getMistakeTagsForTrade,
  addMistakeTag,
  removeMistakeTag,
} from '../repo'

beforeEach(() => {
  prepared = []
  runs = []
  allRows = []
  respond = () => undefined
})

describe('listMistakeDefs', () => {
  it('default-excludes archived and orders by axis, sort_position', () => {
    listMistakeDefs()
    const sql = prepared.find((p) => /FROM mistake_def/i.test(p.q))
    expect(sql).toBeTruthy()
    expect(sql!.q).toMatch(/WHERE is_archived = 0/i)
    expect(sql!.q).toMatch(/ORDER BY axis, sort_position/i)
  })

  it('includeArchived drops the is_archived filter', () => {
    listMistakeDefs({ includeArchived: true })
    const sql = prepared.find((p) => /FROM mistake_def/i.test(p.q))
    expect(sql!.q).not.toMatch(/WHERE is_archived/i)
    expect(sql!.q).toMatch(/ORDER BY axis, sort_position/i)
  })

  it('maps rows to MistakeDef with is_custom / is_archived as booleans', () => {
    allRows = [
      { id: 3, axis: 'technical', name: 'MACD negative at entry', sort_position: 0, is_custom: 0, is_archived: 0 },
      { id: 12, axis: 'psychological', name: 'FOMO - chased a runner', sort_position: 5, is_custom: 1, is_archived: 1 },
    ]
    expect(listMistakeDefs({ includeArchived: true })).toEqual([
      { id: 3, axis: 'technical', name: 'MACD negative at entry', sort_position: 0, is_custom: false, is_archived: false },
      { id: 12, axis: 'psychological', name: 'FOMO - chased a runner', sort_position: 5, is_custom: true, is_archived: true },
    ])
  })
})

describe('getMistakeTagsForTrade', () => {
  it('JOINs trade_mistake -> mistake_def for that trade, ordered by axis, sort_position', () => {
    getMistakeTagsForTrade(42)
    const sql = prepared.find((p) => /FROM trade_mistake/i.test(p.q))
    expect(sql).toBeTruthy()
    expect(sql!.q).toMatch(/FROM trade_mistake tm/i)
    expect(sql!.q).toMatch(/JOIN mistake_def md ON md\.id = tm\.mistake_def_id/i)
    expect(sql!.q).toMatch(/WHERE tm\.trade_id = \?/i)
    expect(sql!.q).toMatch(/ORDER BY md\.axis, md\.sort_position/i)
    expect(sql!.a).toEqual([42])
  })

  it('maps rows to MistakeTag { id, axis, name }', () => {
    allRows = [
      { id: 11, axis: 'technical', name: 'Entered too early / before trigger' },
      { id: 12, axis: 'psychological', name: 'FOMO - chased a runner' },
    ]
    expect(getMistakeTagsForTrade(42)).toEqual([
      { id: 11, axis: 'technical', name: 'Entered too early / before trigger' },
      { id: 12, axis: 'psychological', name: 'FOMO - chased a runner' },
    ])
  })
})

const insertedLink = () =>
  runs.some((r) => /INSERT (OR IGNORE )?INTO trade_mistake/i.test(r.sql))

// Program the two existence reads add does: the mistake_def and the trade.
function program(opts: { defExists: boolean; tradeExists: boolean }) {
  return (q: string): unknown => {
    if (/SELECT id FROM mistake_def WHERE id/i.test(q)) return opts.defExists ? { id: 1 } : undefined
    if (/SELECT id FROM trades WHERE id/i.test(q)) return opts.tradeExists ? { id: 1 } : undefined
    return undefined
  }
}

describe('addMistakeTag — validation', () => {
  it('rejects a mistake_def that does not exist; no INSERT', () => {
    respond = program({ defExists: false, tradeExists: true })
    expect(() => addMistakeTag(42, 99)).toThrow(/not found/i)
    expect(insertedLink()).toBe(false)
  })

  it('rejects a trade that does not exist; no INSERT', () => {
    respond = program({ defExists: true, tradeExists: false })
    expect(() => addMistakeTag(99, 5)).toThrow(/not found/i)
    expect(insertedLink()).toBe(false)
  })

  it('happy path — INSERT OR IGNORE on (trade_id, mistake_def_id) (re-add is a benign no-op)', () => {
    respond = program({ defExists: true, tradeExists: true })
    addMistakeTag(42, 5)
    const ins = runs.find((r) => /INSERT OR IGNORE INTO trade_mistake/i.test(r.sql))
    expect(ins).toBeTruthy()
    expect(ins!.sql).toMatch(/\(trade_id, mistake_def_id\) VALUES \(\?, \?\)/i)
    expect(ins!.args).toEqual([42, 5])
  })
})

describe('removeMistakeTag', () => {
  it('issues DELETE on (trade_id, mistake_def_id)', () => {
    removeMistakeTag(42, 5)
    const del = runs.find((r) =>
      /DELETE FROM trade_mistake WHERE trade_id = \? AND mistake_def_id = \?/i.test(r.sql),
    )
    expect(del).toBeTruthy()
    expect(del!.args).toEqual([42, 5])
  })

  it('removing an absent pair is a clean no-op (no throw)', () => {
    expect(() => removeMistakeTag(42, 999)).not.toThrow()
  })
})
