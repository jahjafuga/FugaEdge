// Beat 2 — catalyst repo: the catalyst_def vocabulary CRUD. Mock SQL-contract
// test (better-sqlite3 won't load under vitest): assert the query shapes + args +
// the CatalystDef mapping. Mirrors electron/mistakes/__tests__/repo.test.ts MINUS
// axis, PLUS the two catalyst deltas — rename propagates to trades atomically,
// and the delete-guard counts trades BY NAME (no junction). Real PK/FK behavior is
// sandbox-verified in beat 1.

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
  // db.transaction(fn) returns fn; calling it runs the body inline (both the
  // rename's def-UPDATE and the trades-propagation UPDATE land in `runs`).
  transaction: (fn: (...args: unknown[]) => unknown) => fn,
}

vi.mock('../../db/database', () => ({ openDatabase: () => db }))

import {
  listCatalystDefs,
  createCatalystDef,
  renameCatalystDef,
  reorderCatalystDefs,
  archiveCatalystDef,
  unarchiveCatalystDef,
  deleteCatalystDef,
} from '../repo'

beforeEach(() => {
  prepared = []
  runs = []
  allRows = []
  respond = () => undefined
})

// A full mapped row the getById re-SELECT returns (id, name, sort_position,
// is_custom, is_archived — NO axis).
const DEF_ROW = { id: 7, name: 'Custom one', sort_position: 10, is_custom: 1, is_archived: 0 }
const ranSql = (re: RegExp) => runs.find((r) => re.test(r.sql))

describe('listCatalystDefs', () => {
  it('default-excludes archived and orders by sort_position (no axis)', () => {
    listCatalystDefs()
    const sql = prepared.find((p) => /FROM catalyst_def/i.test(p.q))
    expect(sql).toBeTruthy()
    expect(sql!.q).toMatch(/WHERE is_archived = 0/i)
    expect(sql!.q).toMatch(/ORDER BY sort_position/i)
    expect(sql!.q).not.toMatch(/axis/i)
  })

  it('includeArchived drops the is_archived filter', () => {
    listCatalystDefs({ includeArchived: true })
    const sql = prepared.find((p) => /FROM catalyst_def/i.test(p.q))
    expect(sql!.q).not.toMatch(/WHERE is_archived/i)
    expect(sql!.q).toMatch(/ORDER BY sort_position/i)
  })

  it('maps rows to CatalystDef with is_custom / is_archived as booleans', () => {
    allRows = [
      { id: 1, name: 'Earnings', sort_position: 0, is_custom: 0, is_archived: 0 },
      { id: 9, name: 'My Catalyst', sort_position: 3, is_custom: 1, is_archived: 1 },
    ]
    expect(listCatalystDefs({ includeArchived: true })).toEqual([
      { id: 1, name: 'Earnings', sort_position: 0, is_custom: false, is_archived: false },
      { id: 9, name: 'My Catalyst', sort_position: 3, is_custom: true, is_archived: true },
    ])
  })
})

describe('createCatalystDef', () => {
  it('rejects a case-insensitive active duplicate; no INSERT (no axis in the dup-check)', () => {
    // Build B widened the dup check (no is_archived exclusion) — the active
    // branch keeps this exact behavior.
    respond = (q) =>
      /SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\)$/i.test(q)
        ? { id: 9, is_archived: 0 }
        : undefined
    expect(() => createCatalystDef({ name: 'earnings' })).toThrow(/already exists/i)
    expect(runs.some((r) => /INSERT INTO catalyst_def/i.test(r.sql))).toBe(false)
  })

  it('INSERTs is_custom=1, is_archived=0, sort_position = MAX+1 (no axis)', () => {
    respond = (q) => {
      if (/SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\)$/i.test(q)) return undefined
      if (/MAX\(sort_position\)/i.test(q)) return { next: 10 }
      if (/SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = \?/i.test(q)) return DEF_ROW
      return undefined
    }
    const out = createCatalystDef({ name: '  New One  ' })
    const ins = ranSql(/INSERT INTO catalyst_def/i)
    expect(ins).toBeTruthy()
    expect(ins!.sql).toMatch(/\(name, sort_position, is_custom, is_archived\) VALUES \(\?, \?, 1, 0\)/i)
    expect(ins!.sql).not.toMatch(/axis/i)
    expect(ins!.args).toEqual(['New One', 10]) // name trimmed, sort = MAX+1
    expect(out).toEqual({ id: 7, name: 'Custom one', sort_position: 10, is_custom: true, is_archived: false })
  })

  it('rejects an empty / whitespace-only name; no INSERT', () => {
    expect(() => createCatalystDef({ name: '   ' })).toThrow(/empty/i)
    expect(runs.some((r) => /INSERT INTO catalyst_def/i.test(r.sql))).toBe(false)
  })
})

describe('renameCatalystDef — DELTA 1: atomic propagation to trades', () => {
  it('rejects a case-insensitive duplicate (excluding self); no UPDATE', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Old Name' }
      if (/SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\) AND id != \?/i.test(q))
        return { id: 9, is_archived: 0 }
      return undefined
    }
    expect(() => renameCatalystDef({ id: 7, name: 'earnings' })).toThrow(/already exists/i)
    expect(runs.some((r) => /UPDATE catalyst_def SET name/i.test(r.sql))).toBe(false)
    expect(runs.some((r) => /UPDATE trades SET catalyst_type/i.test(r.sql))).toBe(false)
  })

  it('rejects an empty name; no UPDATE', () => {
    expect(() => renameCatalystDef({ id: 7, name: '  ' })).toThrow(/empty/i)
    expect(runs.length).toBe(0)
  })

  it('renames the def AND propagates the new name to every trade carrying the old name, both in one transaction', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Old Name' }
      if (/SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\) AND id != \?/i.test(q)) return undefined
      if (/SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = \?/i.test(q)) return { ...DEF_ROW, name: 'Renamed' }
      return undefined
    }
    renameCatalystDef({ id: 7, name: '  Renamed  ' })

    const updDef = ranSql(/UPDATE catalyst_def SET name = \?, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(updDef).toBeTruthy()
    expect(updDef!.args).toEqual(['Renamed', 7])

    const updTrades = ranSql(/UPDATE trades SET catalyst_type = \? WHERE catalyst_type = \?/i)
    expect(updTrades).toBeTruthy()
    expect(updTrades!.args).toEqual(['Renamed', 'Old Name']) // newName, oldName
    // DELETION-BLIND: no deleted_at filter on the propagation.
    expect(updTrades!.sql).not.toMatch(/deleted_at/i)
  })
})

describe('reorderCatalystDefs (no axis — one global list)', () => {
  it('throws (no UPDATE) when ordered_ids do not cover exactly the active rows', () => {
    allRows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    expect(() => reorderCatalystDefs({ ordered_ids: [1, 2] })).toThrow(/exactly/i)
    expect(runs.some((r) => /UPDATE catalyst_def SET sort_position/i.test(r.sql))).toBe(false)
  })

  it('rewrites sort_position = array index for each id (no axis in the WHERE)', () => {
    allRows = [{ id: 1 }, { id: 2 }, { id: 3 }]
    reorderCatalystDefs({ ordered_ids: [3, 1, 2] })
    const upds = runs.filter((r) =>
      /UPDATE catalyst_def SET sort_position = \?, updated_at = datetime\('now'\) WHERE id = \?/i.test(r.sql),
    )
    expect(upds.map((u) => u.args)).toEqual([
      [0, 3],
      [1, 1],
      [2, 2],
    ])
    expect(upds.every((u) => !/axis/i.test(u.sql))).toBe(true)
  })
})

describe('archiveCatalystDef', () => {
  it('UPDATEs is_archived = 1 where id', () => {
    respond = (q) =>
      /SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = \?/i.test(q)
        ? { ...DEF_ROW, is_archived: 1 }
        : undefined
    archiveCatalystDef({ id: 7 })
    const upd = ranSql(/UPDATE catalyst_def SET is_archived = 1, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7])
  })
})

describe('unarchiveCatalystDef', () => {
  it('rejects when an active case-insensitive name already exists; no UPDATE (no axis)', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Earnings' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return { id: 2 }
      return undefined
    }
    expect(() => unarchiveCatalystDef({ id: 7 })).toThrow(/un-archive|already active/i)
    expect(runs.some((r) => /UPDATE catalyst_def SET is_archived = 0/i.test(r.sql))).toBe(false)
  })

  it('UPDATEs is_archived = 0 where id when no active collision', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Freed Name' }
      if (/lower\(name\) = lower\(\?\) AND is_archived = 0 AND id != \?/i.test(q)) return undefined
      if (/SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = \?/i.test(q)) return DEF_ROW
      return undefined
    }
    unarchiveCatalystDef({ id: 7 })
    const upd = ranSql(/UPDATE catalyst_def SET is_archived = 0, updated_at = datetime\('now'\) WHERE id = \?/i)
    expect(upd).toBeTruthy()
    expect(upd!.args).toEqual([7])
  })
})

describe('deleteCatalystDef — DELTA 2: the guard counts trades BY NAME (no junction)', () => {
  function programDelete(opts: { is_custom: number; count: number }) {
    return (q: string): unknown => {
      if (/SELECT is_custom, name FROM catalyst_def WHERE id = \?/i.test(q)) {
        return { is_custom: opts.is_custom, name: 'Earnings' }
      }
      if (/SELECT COUNT\(\*\) AS n FROM trades WHERE catalyst_type = \?/i.test(q)) {
        return { n: opts.count }
      }
      return undefined
    }
  }
  const deletedRow = () => runs.some((r) => /DELETE FROM catalyst_def WHERE id = \?/i.test(r.sql))
  const archivedRow = () => runs.some((r) => /UPDATE catalyst_def SET is_archived = 1/i.test(r.sql))

  it('counts usage against trades by catalyst_type (not a junction table)', () => {
    respond = programDelete({ is_custom: 1, count: 0 })
    deleteCatalystDef({ id: 7 })
    const countQ = prepared.find((p) => /SELECT COUNT\(\*\) AS n FROM trades WHERE catalyst_type = \?/i.test(p.q))
    expect(countQ).toBeTruthy()
    expect(countQ!.a).toEqual(['Earnings']) // counted by the def's NAME
    expect(prepared.some((p) => /trade_catalyst/i.test(p.q))).toBe(false) // no junction
    expect(countQ!.q).not.toMatch(/deleted_at/i) // deletion-blind
  })

  it('(i) custom + zero trades -> DELETE, { deleted:true, archivedInstead:false }', () => {
    respond = programDelete({ is_custom: 1, count: 0 })
    const r = deleteCatalystDef({ id: 7 })
    expect(deletedRow()).toBe(true)
    expect(archivedRow()).toBe(false)
    expect(r).toEqual({ deleted: true, archivedInstead: false })
  })

  it('(ii) seeded (is_custom=0) -> ARCHIVE not delete, { deleted:false, archivedInstead:true }', () => {
    respond = programDelete({ is_custom: 0, count: 0 })
    const r = deleteCatalystDef({ id: 1 })
    expect(deletedRow()).toBe(false)
    expect(archivedRow()).toBe(true)
    expect(r).toEqual({ deleted: false, archivedInstead: true })
  })

  it('(iii) custom but used by trades (count>0) -> ARCHIVE not delete', () => {
    respond = programDelete({ is_custom: 1, count: 3 })
    const r = deleteCatalystDef({ id: 7 })
    expect(deletedRow()).toBe(false)
    expect(archivedRow()).toBe(true)
    expect(r).toEqual({ deleted: false, archivedInstead: true })
  })
})

// THE FINAL TWO (build B) — the archived-name collision wall. The dup checks
// lose their is_archived = 0 exclusion (rename AND create): an archived
// collision throws "— archived; unarchive it instead" BEFORE the transaction,
// an active collision keeps the existing message. For catalysts the blocked
// path matters most: the rename transaction rewrites trades by name, so the
// no-runs assertions ARE the "trade history byte-unchanged" pin.
describe('the archived-name collision wall (rename + create)', () => {
  it('(1) rename onto an ARCHIVED name throws the archived message; NOTHING runs — trades byte-unchanged', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Old Name' }
      if (/SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\) AND id != \?/i.test(q))
        return { id: 9, is_archived: 1 }
      return undefined
    }
    expect(() => renameCatalystDef({ id: 7, name: 'fda approval' })).toThrow(
      /"fda approval" already exists — archived; unarchive it instead/,
    )
    expect(runs.length).toBe(0)
  })

  it('(3) rename onto an ACTIVE name still blocked with the existing message', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Old Name' }
      if (/SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\) AND id != \?/i.test(q))
        return { id: 9, is_archived: 0 }
      return undefined
    }
    expect(() => renameCatalystDef({ id: 7, name: 'earnings' })).toThrow(/"earnings" already exists$/)
    expect(runs.length).toBe(0)
  })

  it('(4) create onto an ARCHIVED name blocked; no INSERT', () => {
    respond = (q) =>
      /SELECT id, is_archived FROM catalyst_def WHERE lower\(name\) = lower\(\?\)$/i.test(q)
        ? { id: 9, is_archived: 1 }
        : undefined
    expect(() => createCatalystDef({ name: 'fda approval' })).toThrow(
      /archived; unarchive it instead/,
    )
    expect(runs.some((r) => /INSERT INTO catalyst_def/i.test(r.sql))).toBe(false)
  })

  it('(5) a legitimate rename still succeeds through the widened check', () => {
    respond = (q) => {
      if (/SELECT name FROM catalyst_def WHERE id = \?/i.test(q)) return { name: 'Old Name' }
      if (/SELECT id, name, sort_position, is_custom, is_archived FROM catalyst_def WHERE id = \?/i.test(q))
        return { id: 7, name: 'Fresh Name', sort_position: 0, is_custom: 1, is_archived: 0 }
      return undefined
    }
    renameCatalystDef({ id: 7, name: 'Fresh Name' })
    expect(runs.some((r) => /UPDATE catalyst_def SET name/i.test(r.sql))).toBe(true)
    expect(runs.some((r) => /UPDATE trades SET catalyst_type/i.test(r.sql))).toBe(true)
  })
})
