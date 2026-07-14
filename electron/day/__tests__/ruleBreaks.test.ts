import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 2 — per-day rule-breaks storage round-trip. better-sqlite3 doesn't load
// under vitest, so a STATEFUL in-memory store stands in behind the openDatabase mock
// (the electron/settings/__tests__/repo.test.ts pattern). Any other query (listTrades'
// trades SELECT, session_meta SELECT) falls through to empty so getDayDetail runs
// end-to-end on a 0-trade day — which is the point of the strengthened test: the value
// must flow through getDayDetail (a NET-NEW journal read on that function), not just the
// readRuleBreaks helper.
//
// 3b-1 — THE STORE GREW A JUNCTION, because the storage did. saveRuleBreaks now
// dual-writes (journal.rule_breaks AND journal_rule_break -> rule_break_def) and
// readRuleBreaks reads the JOIN. A fake that still modelled one column would go green
// while the real SQL failed, which is worse than no fake at all.
//
// This fake is deliberately only faithful enough for the round-trip. It is NOT the
// authority on the SQL: that is electron/ruleBreaks/__tests__/repo.inmemory.ts, which
// runs the real statements against a real in-memory better-sqlite3 (an engine is the
// only thing that can prove lower(name) actually merges "Overtrading" and "overtrading").
const { store } = vi.hoisted(() => ({
  store: {
    column: new Map<string, string>(), // journal.rule_breaks — still dual-written
    defs: [] as { id: number; name: string; sort: number }[], // rule_break_def
    links: new Map<string, number[]>(), // journal_rule_break: date -> def ids
    nextId: 1,
  },
}))

vi.mock('../../db/database', () => ({
  getDbPath: () => '/fake/db/path',
  openDatabase: () => ({
    transaction:
      (fn: (...a: unknown[]) => unknown) =>
      (...a: unknown[]) =>
        fn(...a),
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        // The COLUMN half of the dual-write. Anchored on `journal (` so it cannot also
        // swallow `journal_rule_break (` below.
        if (/INSERT INTO journal\s*\(/i.test(sql) && /rule_breaks/i.test(sql)) {
          store.column.set(String(args[0]), String(args[1]))
          return { changes: 1, lastInsertRowid: 0 }
        }
        // find-or-create mints a def for a label the vocabulary doesn't know.
        if (/INSERT INTO rule_break_def/i.test(sql)) {
          const id = store.nextId++
          store.defs.push({ id, name: String(args[0]), sort: Number(args[1]) })
          return { changes: 1, lastInsertRowid: id }
        }
        // Replace-all: clear the day, then one link per resolved def id.
        if (/DELETE FROM journal_rule_break/i.test(sql)) {
          store.links.delete(String(args[0]))
          return { changes: 1, lastInsertRowid: 0 }
        }
        if (/INSERT INTO journal_rule_break/i.test(sql)) {
          const date = String(args[0])
          const ids = store.links.get(date) ?? []
          ids.push(Number(args[1]))
          store.links.set(date, ids)
          return { changes: 1, lastInsertRowid: 0 }
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
      get: (...args: unknown[]) => {
        // find-or-create's CASE-INSENSITIVE lookup. Not a heuristic: ux_rule_break_def_name
        // is UNIQUE(lower(name)) and NON-partial, so at most one def can ever match.
        if (/SELECT id FROM rule_break_def WHERE lower\(name\)/i.test(sql)) {
          const name = String(args[0]).toLowerCase()
          return store.defs.find((d) => d.name.toLowerCase() === name)
        }
        if (/COALESCE\(MAX\(sort_position\)/i.test(sql)) return { n: store.defs.length }
        // Every other single-row read (e.g. session_meta) -> undefined, so its repo yields null.
        return undefined
      },
      all: (...args: unknown[]) => {
        // readRuleBreakNamesForDate's JOIN — the linked defs' CURRENT names, in vocab order.
        if (/FROM journal_rule_break j/i.test(sql) && /WHERE j\.date = \?/i.test(sql)) {
          const ids = store.links.get(String(args[0])) ?? []
          return store.defs
            .filter((d) => ids.includes(d.id))
            .sort((a, b) => a.sort - b.sort || a.id - b.id)
            .map((d) => ({ name: d.name }))
        }
        return [] // listTrades + any other multi-row read
      },
    }),
  }),
}))

// SUT imported after the mock.
import { saveRuleBreaks, readRuleBreaks, cleanRuleBreaks } from '../ruleBreaks'
import { getDayDetail } from '../repo'

beforeEach(() => {
  store.column = new Map()
  store.defs = []
  store.links = new Map()
  store.nextId = 1
})

describe('cleanRuleBreaks — dedup / trim / drop-empty (clone of dayTags clean)', () => {
  it('trims, drops blank/whitespace, dedups preserving first-seen order', () => {
    expect(cleanRuleBreaks(['  A  ', '', '   ', 'B', 'A'])).toEqual(['A', 'B'])
  })
  it('empty input -> empty', () => {
    expect(cleanRuleBreaks([])).toEqual([])
  })
})

// 3b-1 — this block used to assert readRuleBreaks' JSON-parse edge cases. It no longer
// parses JSON: it reads the junction. That defensiveness was NOT dropped, it MOVED — the
// column is still parsed by getRuleBreakUsage via the pure tallyRuleBreakUsage, whose
// malformed-cell case is src/core/ruleBreaks/__tests__/usage.test.ts:42.
describe('readRuleBreaks — the JUNCTION read', () => {
  it('a day with no links -> []', () => {
    expect(readRuleBreaks('2026-05-01')).toEqual([])
  })

  it('*** reads each rule by its CURRENT name, not the name it was tagged under ***', () => {
    // THE REASON THE DAY VIEW MOVED OFF THE COLUMN. The column stores the label as it read
    // on the day it was tagged, frozen forever; the junction stores an ID and resolves the
    // name at read time. Once 3b-2 ships rename, a column read would show every historical
    // day under a name the user has already changed and cannot correct.
    store.defs.push({ id: 1, name: 'Ignored daily max loss', sort: 0 })
    store.defs.push({ id: 2, name: 'Low accuracy', sort: 1 })
    store.links.set('2026-05-01', [1, 2])

    expect(readRuleBreaks('2026-05-01')).toEqual(['Ignored daily max loss', 'Low accuracy'])

    store.defs[1].name = 'Sub-50% win rate' // the 3b-2 rename
    expect(readRuleBreaks('2026-05-01')).toEqual(['Ignored daily max loss', 'Sub-50% win rate'])
  })
})

describe('saveRuleBreaks -> readRuleBreaks direct round-trip', () => {
  it('persists the CLEANED list and reads it back', () => {
    saveRuleBreaks({
      date: '2026-05-01',
      breaks: ['Ignored daily max loss', '  ', 'Ignored daily max loss', 'Gave back >30%'],
    })
    expect(readRuleBreaks('2026-05-01')).toEqual(['Ignored daily max loss', 'Gave back >30%'])
  })
})

// 3b-1 — the dual-write is DELIBERATE and TEMPORARY. It dies in 3b-2, when rename arrives
// and the column can no longer be kept honest. Until then the column stays current, which
// is what lets the migration stay re-runnable and keeps the pre-migration .bak restorable.
describe('saveRuleBreaks — DUAL-WRITE (column + junction, atomically)', () => {
  it('writes BOTH the journal.rule_breaks column and the junction links', () => {
    saveRuleBreaks({ date: '2026-05-01', breaks: ['Ignored daily max loss'] })

    expect(store.column.get('2026-05-01')).toBe('["Ignored daily max loss"]')
    expect(store.links.get('2026-05-01')).toEqual([1])
    expect(store.defs).toEqual([{ id: 1, name: 'Ignored daily max loss', sort: 0 }])
  })

  it('clearing a day drops its links AND empties the column', () => {
    saveRuleBreaks({ date: '2026-05-01', breaks: ['Ignored daily max loss'] })
    saveRuleBreaks({ date: '2026-05-01', breaks: [] })

    expect(store.column.get('2026-05-01')).toBe('[]')
    expect(store.links.get('2026-05-01')).toBeUndefined()
    expect(readRuleBreaks('2026-05-01')).toEqual([])
  })

  it('re-tagging an existing label REUSES its def rather than minting a second one', () => {
    saveRuleBreaks({ date: '2026-05-01', breaks: ['Ignored daily max loss'] })
    saveRuleBreaks({ date: '2026-05-02', breaks: ['Ignored daily max loss'] })

    expect(store.defs).toHaveLength(1)
    expect(store.links.get('2026-05-01')).toEqual([1])
    expect(store.links.get('2026-05-02')).toEqual([1])
  })
})

describe('saveRuleBreaks -> getDayDetail (NET-NEW journal read on DayDetail)', () => {
  it('the saved breaks flow through getDayDetail onto DayDetail.ruleBreaks', () => {
    const date = '2026-05-01'
    saveRuleBreaks({ date, breaks: ['Gave back >30% after daily goal', 'Ignored daily max loss'] })
    const detail = getDayDetail(date)
    expect(detail.ruleBreaks).toEqual(['Gave back >30% after daily goal', 'Ignored daily max loss'])
  })
  it('a day with no saved breaks -> [] on DayDetail', () => {
    expect(getDayDetail('2026-05-02').ruleBreaks).toEqual([])
  })
})
