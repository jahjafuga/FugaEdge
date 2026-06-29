import { describe, it, expect, beforeEach, vi } from 'vitest'

// Phase 2 — per-day rule-breaks storage round-trip. better-sqlite3 doesn't load
// under vitest, so a STATEFUL in-memory journal store stands in behind the
// openDatabase mock (the electron/settings/__tests__/repo.test.ts pattern), keyed
// by date: saveRuleBreaks upserts journal.rule_breaks, readRuleBreaks selects it
// back. Any other query (listTrades' trades SELECT, session_meta SELECT) falls
// through to empty so getDayDetail runs end-to-end on a 0-trade day — which is the
// point of the strengthened test: the value must flow through getDayDetail (a
// NET-NEW journal read on that function), not just the readRuleBreaks helper.
const { store } = vi.hoisted(() => ({
  store: { current: new Map<string, string>() },
}))

vi.mock('../../db/database', () => ({
  getDbPath: () => '/fake/db/path',
  openDatabase: () => ({
    prepare: (sql: string) => ({
      // journal rule_breaks upsert: run(date, json)
      run: (...args: unknown[]) => {
        if (/INSERT INTO journal/i.test(sql) && /rule_breaks/i.test(sql)) {
          store.current.set(String(args[0]), String(args[1]))
        }
      },
      // journal rule_breaks read: get(date). All other single-row reads (e.g.
      // session_meta) return undefined so their repos yield null.
      get: (...args: unknown[]) => {
        if (/SELECT rule_breaks FROM journal/i.test(sql)) {
          return { rule_breaks: store.current.get(String(args[0])) ?? '[]' }
        }
        return undefined
      },
      // listTrades + any other multi-row read -> empty.
      all: () => [],
    }),
  }),
}))

// SUT imported after the mock.
import { saveRuleBreaks, readRuleBreaks, cleanRuleBreaks } from '../ruleBreaks'
import { getDayDetail } from '../repo'

beforeEach(() => {
  store.current = new Map()
})

describe('cleanRuleBreaks — dedup / trim / drop-empty (clone of dayTags clean)', () => {
  it('trims, drops blank/whitespace, dedups preserving first-seen order', () => {
    expect(cleanRuleBreaks(['  A  ', '', '   ', 'B', 'A'])).toEqual(['A', 'B'])
  })
  it('empty input -> empty', () => {
    expect(cleanRuleBreaks([])).toEqual([])
  })
})

describe('readRuleBreaks — parse edge cases (never throws)', () => {
  it('absent row / empty -> []', () => {
    expect(readRuleBreaks('2026-05-01')).toEqual([])
  })
  it('malformed JSON -> []', () => {
    store.current.set('2026-05-01', 'not json')
    expect(readRuleBreaks('2026-05-01')).toEqual([])
  })
  it('stored JSON array -> string[]', () => {
    store.current.set('2026-05-01', '["Ignored daily max loss","Low accuracy"]')
    expect(readRuleBreaks('2026-05-01')).toEqual(['Ignored daily max loss', 'Low accuracy'])
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
