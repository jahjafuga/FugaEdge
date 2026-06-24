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
  // Beat 2b — db.transaction(fn) returns fn; calling it runs the body inline
  // (the reorder writes land in `runs` like any other statement).
  transaction: (fn: (...args: unknown[]) => unknown) => fn,
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import {
  listMistakeDefs,
  getMistakeTagsForTrade,
  addMistakeTag,
  removeMistakeTag,
  createMistakeDef,
  renameMistakeDef,
  reorderMistakeDefs,
  archiveMistakeDef,
  unarchiveMistakeDef,
  deleteMistakeDef,
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

// ── Beat 2c — dual-write: the trade_mistake junction is the SOURCE OF TRUTH and
//    trades.mistakes_json is kept in sync after every junction write (so the existing
//    mistakes_json readers stay correct until the 2c-display cutover). Cleaning mirrors
//    saveMistakes (trim, dedupe, drop blanks). ─────────────────────────────────────
describe('addMistakeTag — dual-write mistakes_json (2c)', () => {
  it('after the junction INSERT, rewrites trades.mistakes_json from the junction names', () => {
    respond = program({ defExists: true, tradeExists: true })
    // The junction state AFTER the add (what getMistakeTagsForTrade returns via .all()).
    allRows = [{ id: 5, axis: 'psychological', name: 'FOMO - chased a runner' }]
    addMistakeTag(42, 5)
    // (i) the junction write still happens
    const ins = runs.find((r) => /INSERT OR IGNORE INTO trade_mistake/i.test(r.sql))
    expect(ins).toBeTruthy()
    expect(ins!.args).toEqual([42, 5])
    // (ii) the dual-write rewrites mistakes_json from the junction's current names
    const upd = runs.find((r) => /UPDATE trades SET mistakes_json = \?/i.test(r.sql))
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([JSON.stringify(['FOMO - chased a runner']), 42])
  })
})

describe('removeMistakeTag — dual-write mistakes_json (2c)', () => {
  it('after the junction DELETE, rewrites trades.mistakes_json from the (now-empty) junction', () => {
    // The trade has no junction rows left after the remove.
    allRows = []
    removeMistakeTag(42, 5)
    // (i) the junction delete still happens
    const del = runs.find((r) =>
      /DELETE FROM trade_mistake WHERE trade_id = \? AND mistake_def_id = \?/i.test(r.sql),
    )
    expect(del).toBeTruthy()
    expect(del!.args).toEqual([42, 5])
    // (ii) the dual-write rewrites mistakes_json to an empty array
    const upd = runs.find((r) => /UPDATE trades SET mistakes_json = \?/i.test(r.sql))
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([JSON.stringify([]), 42])
  })
})

// ── Beat 2b — vocabulary write methods ──────────────────────────────────────

// A full mapped row the getById re-SELECT returns (matches the
// id, axis, name, sort_position, is_custom, is_archived projection).
const DEF_ROW = { id: 7, axis: 'technical', name: 'Custom one', sort_position: 10, is_custom: 1, is_archived: 0 }
const ranSql = (re: RegExp) => runs.find((r) => re.test(r.sql))

describe('createMistakeDef', () => {
  it('rejects a case-insensitive active duplicate in the same axis; no INSERT', () => {
    respond = (q) =>
      /AND lower\(name\) = lower\(\?\) AND is_archived = 0/i.test(q) ? { id: 9 } : undefined
    expect(() => createMistakeDef({ axis: 'technical', name: 'macd negative at entry' })).toThrow(/already exists/i)
    expect(runs.some((r) => /INSERT INTO mistake_def/i.test(r.sql))).toBe(false)
  })

  it('INSERTs is_custom=1, is_archived=0, sort_position = MAX(sort_position)+1 for the axis', () => {
    respond = (q) => {
      if (/AND lower\(name\) = lower\(\?\) AND is_archived = 0/i.test(q)) return undefined
      if (/SELECT MAX\(sort_position\) AS m FROM mistake_def WHERE axis = \?/i.test(q)) return { m: 9 }
      if (/SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE id = \?/i.test(q)) return DEF_ROW
      return undefined
    }
    const out = createMistakeDef({ axis: 'technical', name: '  New One  ' })
    const ins = ranSql(/INSERT INTO mistake_def/i)
    expect(ins).toBeTruthy()
    expect(ins!.sql).toMatch(/\(axis, name, sort_position, is_custom, is_archived\) VALUES \(\?, \?, \?, 1, 0\)/i)
    expect(ins!.args).toEqual(['technical', 'New One', 10]) // name trimmed, sort = 9 + 1
    expect(out).toEqual({ id: 7, axis: 'technical', name: 'Custom one', sort_position: 10, is_custom: true, is_archived: false })
  })

  it('rejects an empty / whitespace-only name; no INSERT', () => {
    expect(() => createMistakeDef({ axis: 'technical', name: '   ' })).toThrow(/empty/i)
    expect(runs.some((r) => /INSERT INTO mistake_def/i.test(r.sql))).toBe(false)
  })
})

describe('renameMistakeDef', () => {
  it('rejects a case-insensitive duplicate in the same axis (excluding self); no UPDATE', () => {
    respond = (q) => {
      if (/SELECT axis FROM mistake_def WHERE id = \?/i.test(q)) return { axis: 'technical' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return { id: 9 }
      return undefined
    }
    expect(() => renameMistakeDef({ id: 7, name: 'entered below vwap' })).toThrow(/already exists/i)
    expect(runs.some((r) => /UPDATE mistake_def SET name/i.test(r.sql))).toBe(false)
  })

  it('UPDATEs the trimmed name + updated_at where id', () => {
    respond = (q) => {
      if (/SELECT axis FROM mistake_def WHERE id = \?/i.test(q)) return { axis: 'technical' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return undefined
      if (/SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE id = \?/i.test(q)) return { ...DEF_ROW, name: 'Renamed' }
      return undefined
    }
    renameMistakeDef({ id: 7, name: '  Renamed  ' })
    const upd = ranSql(/UPDATE mistake_def SET name = \?, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual(['Renamed', 7])
  })
})

describe('reorderMistakeDefs', () => {
  it('throws (no UPDATE) when ordered_ids do not cover exactly the axis active rows', () => {
    allRows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(() => reorderMistakeDefs({ axis: 'technical', ordered_ids: [1, 2] })).toThrow(/exactly/i)
    expect(runs.some((r) => /UPDATE mistake_def SET sort_position/i.test(r.sql))).toBe(false)
  })

  it('rewrites sort_position = array index for each id, in one pass', () => {
    allRows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    reorderMistakeDefs({ axis: 'technical', ordered_ids: [3, 1, 2] })
    const upds = runs.filter((r) =>
      /UPDATE mistake_def SET sort_position = \?, updated_at = datetime\('now'\) WHERE id = \? AND axis = \?/i.test(r.sql),
    )
    expect(upds.map((u) => u.args)).toEqual([
      [0, 3, 'technical'],
      [1, 1, 'technical'],
      [2, 2, 'technical'],
    ])
  })
})

describe('archiveMistakeDef', () => {
  it('UPDATEs is_archived = 1 where id', () => {
    respond = (q) =>
      /SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE id = \?/i.test(q)
        ? { ...DEF_ROW, is_archived: 1 }
        : undefined
    archiveMistakeDef({ id: 7 })
    const upd = ranSql(/UPDATE mistake_def SET is_archived = 1, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7])
  })
})

describe('unarchiveMistakeDef', () => {
  it('rejects when an active same-axis case-insensitive name already exists; no UPDATE', () => {
    respond = (q) => {
      if (/SELECT axis, name FROM mistake_def WHERE id = \?/i.test(q)) return { axis: 'technical', name: 'Entered below VWAP' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return { id: 2 }
      return undefined
    }
    expect(() => unarchiveMistakeDef({ id: 7 })).toThrow(/un-archive/i)
    expect(runs.some((r) => /UPDATE mistake_def SET is_archived = 0/i.test(r.sql))).toBe(false)
  })

  it('UPDATEs is_archived = 0 where id when no active collision', () => {
    respond = (q) => {
      if (/SELECT axis, name FROM mistake_def WHERE id = \?/i.test(q)) return { axis: 'technical', name: 'Freed Name' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return undefined
      if (/SELECT id, axis, name, sort_position, is_custom, is_archived FROM mistake_def WHERE id = \?/i.test(q)) return DEF_ROW
      return undefined
    }
    unarchiveMistakeDef({ id: 7 })
    const upd = ranSql(/UPDATE mistake_def SET is_archived = 0, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7])
  })
})

describe('deleteMistakeDef — THE GUARD', () => {
  function programDelete(opts: { is_custom: number; count: number }) {
    return (q: string): unknown => {
      if (/SELECT is_custom FROM mistake_def WHERE id = \?/i.test(q)) return { is_custom: opts.is_custom }
      if (/SELECT COUNT\(\*\) AS n FROM trade_mistake WHERE mistake_def_id = \?/i.test(q)) return { n: opts.count }
      return undefined
    }
  }
  const deletedRow = () => runs.some((r) => /DELETE FROM mistake_def WHERE id = \?/i.test(r.sql))
  const archivedRow = () => runs.some((r) => /UPDATE mistake_def SET is_archived = 1/i.test(r.sql))

  it('(i) custom + zero links -> DELETE, { deleted:true, archivedInstead:false }', () => {
    respond = programDelete({ is_custom: 1, count: 0 })
    const r = deleteMistakeDef({ id: 7 })
    expect(deletedRow()).toBe(true)
    expect(archivedRow()).toBe(false)
    expect(r).toEqual({ deleted: true, archivedInstead: false })
  })

  it('(ii) seeded (is_custom=0) -> ARCHIVE not delete, { deleted:false, archivedInstead:true }', () => {
    respond = programDelete({ is_custom: 0, count: 0 })
    const r = deleteMistakeDef({ id: 3 })
    expect(deletedRow()).toBe(false)
    expect(archivedRow()).toBe(true)
    expect(r).toEqual({ deleted: false, archivedInstead: true })
  })

  it('(iii) custom but referenced (count>0) -> ARCHIVE not delete (FK RESTRICT never reached)', () => {
    respond = programDelete({ is_custom: 1, count: 3 })
    const r = deleteMistakeDef({ id: 7 })
    expect(deletedRow()).toBe(false)
    expect(archivedRow()).toBe(true)
    expect(r).toEqual({ deleted: false, archivedInstead: true })
  })
})
