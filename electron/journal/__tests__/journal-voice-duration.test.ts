// Beat A (Voice Journal Phase 1) — SQL-contract + shape tests for the two
// additive journal recording-duration columns. Proves the save/get repo wiring:
//   - saveJournalDay's INSERT carries premarket_recording_duration +
//     postsession_recording_duration AND binds their values,
//   - a duration with NO notes/emotion/rules stays "empty" (no row persisted) —
//     the LOCKED duration-only lean: the transcript-as-notes is the real
//     content, the duration is metadata about it,
//   - getJournalDay's SELECT reads both columns and maps them onto the entry
//     (present when set; undefined for rows that predate the columns).
//
// Why SQL-contract + shape, not a real round-trip: better-sqlite3's native
// binary won't load under vitest (ERR_DLOPEN_FAILED — Electron ABI; see
// electron/db/__tests__/read-paths-deleted-filter.test.ts:6-15). We mock
// openDatabase with a capturing shim and assert the SQL prepared + the args
// bound + the mapped shape. The behavioral round-trip on a REAL DB with
// existing rows is the Beat-A sandbox-acceptance step (a fuga-voiceA copy);
// the inline ALTER in database.ts (which value-imports better-sqlite3, so it
// isn't importable here) is proven there via PRAGMA table_info(journal) — the
// day_tags precedent, which likewise has no ALTER unit test.

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SaveJournalInput } from '@shared/journal-types'

// ── capturing DB shim — records prepared SQL + the args bound to run() ───────
let prepared: string[] = []
let runArgs: unknown[][] = []
// Per-test override for what a `FROM journal WHERE date` .get() returns; the
// get-mapping tests need a concrete row, the save tests don't care.
let journalRow: Record<string, unknown> | undefined

function makeStmt(sql: string) {
  const stmt = {
    run: (...args: unknown[]) => {
      runArgs.push(args)
      return { changes: 1, lastInsertRowid: 1 }
    },
    get: (..._a: unknown[]) =>
      /FROM journal WHERE date/i.test(sql) ? journalRow : undefined,
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

// Mocked relative to THIS file (electron/journal/__tests__/) — resolves to the
// same electron/db/database module that save.ts/get.ts import via '../db/database'.
vi.mock('../../db/database', () => ({
  openDatabase: () => capturingDb,
  closeDatabase: () => {},
  getDbPath: () => '',
  listTables: () => [],
}))

// SUTs imported after the mock.
import { saveJournalDay } from '../save'
import { getJournalDay } from '../get'

afterEach(() => {
  prepared = []
  runArgs = []
  journalRow = undefined
})

function baseSave(over: Partial<SaveJournalInput> = {}): SaveJournalInput {
  return {
    date: '2026-06-18',
    premarket_notes: '',
    postsession_notes: '',
    emotion_rating: null,
    rules_followed: [],
    rule_violations: [],
    ...over,
  }
}

const insertSql = () => prepared.find((s) => /INSERT INTO journal/i.test(s))

describe('saveJournalDay — recording-duration columns', () => {
  it('INSERTs both duration columns when the entry has content', () => {
    saveJournalDay(
      baseSave({
        premarket_notes: 'plan',
        postsession_notes: 'debrief',
        premarket_recording_duration: 45,
        postsession_recording_duration: 90,
      }),
    )
    const sql = insertSql()
    expect(sql).toBeDefined()
    expect(sql).toMatch(/premarket_recording_duration/i)
    expect(sql).toMatch(/postsession_recording_duration/i)
  })

  it('binds the duration values on the INSERT run()', () => {
    saveJournalDay(
      baseSave({
        premarket_notes: 'plan',
        premarket_recording_duration: 45,
        postsession_recording_duration: 90,
      }),
    )
    // The INSERT run carries the 6 original binds + the 2 new durations.
    const insertRun = runArgs.find((a) => a.length >= 8)
    expect(insertRun).toBeDefined()
    expect(insertRun).toContain(45)
    expect(insertRun).toContain(90)
  })

  // LOCKED lean (duration-only is NOT meaningfully non-empty): a recording with
  // no notes/emotion/rules must NOT persist a row. Guards my own GREEN change
  // from sneaking duration into the empty-check.
  it('treats a duration with no notes/emotion/rules as EMPTY — no INSERT', () => {
    saveJournalDay(baseSave({ premarket_recording_duration: 30 }))
    expect(insertSql()).toBeUndefined()
  })
})

const journalSelect = () =>
  prepared.find((s) => /FROM journal WHERE date/i.test(s))

describe('getJournalDay — recording-duration columns', () => {
  it('SELECTs both duration columns', () => {
    journalRow = {
      date: '2026-06-18',
      premarket_notes: 'p',
      postsession_notes: 's',
      emotion_rating: null,
      rules_followed: '[]',
      rule_violations: '[]',
      premarket_recording_duration: 45,
      postsession_recording_duration: 90,
    }
    getJournalDay('2026-06-18')
    const sql = journalSelect()
    expect(sql).toMatch(/premarket_recording_duration/i)
    expect(sql).toMatch(/postsession_recording_duration/i)
  })

  it('maps the durations onto the entry when present', () => {
    journalRow = {
      date: '2026-06-18',
      premarket_notes: 'p',
      postsession_notes: 's',
      emotion_rating: null,
      rules_followed: '[]',
      rule_violations: '[]',
      premarket_recording_duration: 45,
      postsession_recording_duration: 90,
    }
    const day = getJournalDay('2026-06-18')
    expect(day.entry?.premarket_recording_duration).toBe(45)
    expect(day.entry?.postsession_recording_duration).toBe(90)
  })

  // Backward-compat: a row written before this beat has NULL durations (the
  // migration adds them nullable) → the entry surfaces them as undefined.
  it('reads back undefined for rows predating the columns (NULL durations)', () => {
    journalRow = {
      date: '2026-06-18',
      premarket_notes: 'legacy plan',
      postsession_notes: '',
      emotion_rating: null,
      rules_followed: '[]',
      rule_violations: '[]',
      premarket_recording_duration: null,
      postsession_recording_duration: null,
    }
    const day = getJournalDay('2026-06-18')
    expect(day.entry).toBeTruthy()
    expect(day.entry?.premarket_recording_duration).toBeUndefined()
    expect(day.entry?.postsession_recording_duration).toBeUndefined()
  })
})
