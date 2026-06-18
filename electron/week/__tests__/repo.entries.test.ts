// Phase 5 Beat B — getWeekDetail now carries the week's per-day journal entry
// text (for the weekly pattern view). better-sqlite3's native binary won't load
// under vitest (Electron ABI), so we mock openDatabase with a SQL-dispatching
// shim: the journal range-query returns fake rows, every other read returns [].
// That exercises the REAL getWeekDetail mapping (rows → entries, null
// coalescing, honest empty) without a DB. Behavioural correctness on real data
// is covered by the sandbox-acceptance step.

import { describe, it, expect, beforeEach, vi } from 'vitest'

let journalRows: Array<{
  date: string
  premarket_notes: string | null
  postsession_notes: string | null
}> = []

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      const isJournal = /\bfrom\s+journal\b/i.test(sql)
      return {
        all: () => (isJournal ? journalRows : []),
        get: () => undefined,
        run: () => ({ changes: 0, lastInsertRowid: 0 }),
        pluck() {
          return this
        },
        raw() {
          return this
        },
        iterate: function* () {},
      }
    },
    exec: () => {},
    transaction:
      (fn: any) =>
      (...a: any[]) =>
        fn(...a),
    pragma: () => {},
  }),
  closeDatabase: () => {},
  getDbPath: () => '',
  listTables: () => [],
}))

import { getWeekDetail } from '../repo'

beforeEach(() => {
  journalRows = []
})

describe('getWeekDetail — weekly journal entry text (Phase 5 Beat B)', () => {
  it('populates entries from the week journal rows (nulls coalesced to "")', () => {
    journalRows = [
      { date: '2026-01-05', premarket_notes: 'watching $AAPL', postsession_notes: 'cut losses' },
      { date: '2026-01-07', premarket_notes: null, postsession_notes: 'FOMO again' },
    ]
    const detail = getWeekDetail('2026-01-04')
    expect(detail.entries).toEqual([
      { date: '2026-01-05', premarket_notes: 'watching $AAPL', postsession_notes: 'cut losses' },
      { date: '2026-01-07', premarket_notes: '', postsession_notes: 'FOMO again' },
    ])
  })

  it('a week with no journal rows → entries: [] (honest empty, not null)', () => {
    journalRows = []
    const detail = getWeekDetail('2026-01-04')
    expect(detail.entries).toEqual([])
  })
})
