// HOTFIX — saveJournalDay's row-DELETE destroyed journal.rule_breaks.
//
// THE BUG: emptying a journal entry drops the whole journal row (save.ts:50). The
// only thing that stops the drop is a preservation guard that reads `day_tags` —
// and `rule_breaks` lives on the SAME ROW but was never added to it. So clearing a
// note silently destroyed every rule-break tagged on that day, with no trace.
//
// rule_breaks is NOT part of SaveJournalInput (it is written by the separate
// DAY_RULE_BREAKS_SAVE path), so it CANNOT be added to the `empty` predicate — the
// input simply does not carry it. The fix therefore belongs in the PRESERVATION
// GUARD, which already reads the row from the DB for exactly this reason. Same
// shape as day_tags, one column wider.
//
// NOT touched: the `empty` predicate. The recording durations are deliberately
// excluded from it — a LOCKED decision with its own guard test
// (journal-voice-duration.test.ts:126-132, "treats a duration with no
// notes/emotion/rules as EMPTY"). Widening `empty` would break that lock.
//
// SQL-contract style (the journal-test convention): better-sqlite3's native binary
// won't load under vitest, so openDatabase is mocked with a capturing shim and we
// assert on the SQL prepared. The behavioural round-trip against a real sqlite file
// is the dev-DB live-look.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaveJournalInput } from '@shared/journal-types'

// ── capturing DB shim — records every prepared statement ────────────────────
let prepared: string[] = []
let journalRow: Record<string, unknown> | undefined

function makeStmt(sql: string) {
  const stmt = {
    run: () => ({ changes: 1, lastInsertRowid: 1 }),
    get: () => (/FROM journal WHERE date/i.test(sql) ? journalRow : undefined),
    all: () => [] as unknown[],
    pluck: () => stmt,
    raw: () => stmt,
    iterate: function* () {},
  }
  return stmt
}

const capturingDb: any = {
  prepare: (sql: string) => {
    prepared.push(sql)
    return makeStmt(sql)
  },
  exec: (sql: string) => {
    prepared.push(sql)
  },
  transaction:
    (fn: any) =>
    (...args: any[]) =>
      fn(...args),
  pragma: () => {},
}

vi.mock('../../db/database', () => ({
  openDatabase: () => capturingDb,
  closeDatabase: () => {},
  getDbPath: () => '',
  listTables: () => [],
}))

import { saveJournalDay } from '../save'

afterEach(() => {
  prepared = []
  journalRow = undefined
})

// An EMPTY journal payload — the exact thing the UI sends when the user clears
// their entry, and what NoTradeDayModal's "Remove sit-out" sends.
function emptySave(over: Partial<SaveJournalInput> = {}): SaveJournalInput {
  return {
    date: '2026-07-13',
    premarket_notes: '',
    postsession_notes: '',
    emotion_rating: null,
    rules_followed: [],
    rule_violations: [],
    ...over,
  }
}

// The stored journal row the guard reads back. Defaults mirror the column
// defaults: day_tags '[]', rule_breaks '[]'.
function storedRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date: '2026-07-13',
    premarket_notes: '',
    postsession_notes: '',
    emotion_rating: null,
    rules_followed: '[]',
    rule_violations: '[]',
    day_tags: '[]',
    rule_breaks: '[]',
    premarket_recording_duration: null,
    postsession_recording_duration: null,
    ...over,
  }
}

const deleteSql = () => prepared.find((s) => /DELETE FROM journal/i.test(s))
const updateSql = () => prepared.find((s) => /UPDATE journal\s+SET/i.test(s))
const insertSql = () => prepared.find((s) => /INSERT INTO journal/i.test(s))
const guardSelect = () =>
  prepared.find((s) => /SELECT .*FROM journal WHERE date/i.test(s))

describe('saveJournalDay — rule_breaks must survive an emptied entry', () => {
  it('THE REPRO: a day with rule_breaks + a note -> empty save -> row SURVIVES, breaks INTACT', () => {
    // The day carries rule-breaks (tagged via the Day Detail modal) and no
    // day_tags. The user clears their journal note. Today: the row is DELETED
    // and the rule-breaks are destroyed with it.
    journalRow = storedRow({
      rule_breaks: '["Ignored daily max loss","Revenge traded"]',
      day_tags: '[]',
    })

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeUndefined() // the row must NOT be dropped
    expect(updateSql()).toBeDefined() // it must take the preserve branch
    // and the preserve branch must not clobber the breaks it just saved
    expect(updateSql()).not.toMatch(/rule_breaks\s*=/i)
  })

  it('a day with rule_breaks and NOTHING else -> empty save -> row SURVIVES', () => {
    journalRow = storedRow({ rule_breaks: '["Ignored daily max loss"]' })

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeUndefined()
    expect(updateSql()).toBeDefined()
  })

  it('the guard READS rule_breaks (it only read day_tags — that was the bug)', () => {
    journalRow = storedRow({ rule_breaks: '["X"]' })
    saveJournalDay(emptySave())
    expect(guardSelect()).toMatch(/rule_breaks/i)
  })
})

describe('saveJournalDay — the existing cleanup behaviour is PRESERVED', () => {
  it('a day with NOTHING at all -> empty save -> the row is STILL DELETED', () => {
    // No breaks, no tags, no content. The tidy-up delete must survive the fix.
    journalRow = storedRow()

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeDefined()
    expect(updateSql()).toBeUndefined()
  })

  it('no existing row -> empty save -> still the DELETE branch (harmless no-op)', () => {
    journalRow = undefined

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeDefined()
  })

  it('day_tags alone still preserves the row (the original guard, unregressed)', () => {
    journalRow = storedRow({ day_tags: '["Sat out"]', rule_breaks: '[]' })

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeUndefined()
    expect(updateSql()).toBeDefined()
  })

  it("rule_breaks = '' (legacy empty, not '[]') counts as EMPTY -> row deleted", () => {
    // Reuses the existing non-empty predicate shape: NOT NULL AND != '' AND != '[]'.
    journalRow = storedRow({ rule_breaks: '' })

    saveJournalDay(emptySave())

    expect(deleteSql()).toBeDefined()
  })

  it('a NON-empty entry still upserts and never deletes', () => {
    journalRow = storedRow({ rule_breaks: '["X"]' })

    saveJournalDay(emptySave({ premarket_notes: 'plan the open' }))

    expect(insertSql()).toBeDefined()
    expect(deleteSql()).toBeUndefined()
  })
})
