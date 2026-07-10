// Cache-invalidation contract for JOURNAL_SAVE.
//
// analytics computeDiscipline builds journaledDates from the journal rows that
// carry an emotion_rating / notes / day_tags (electron/analytics/get.ts:598-609,
// specifically the `OR emotion_rating IS NOT NULL` at :603), feeding
// days_journaled / discipline_score at :652. So a JOURNAL_SAVE changes a
// memoized analytics input — without a data-version bump the discipline rollup
// serves the pre-save payload until TTL/restart (the rule-breaks bug class,
// 6e0c0bc). REAL cache module; the save is stubbed (no DB).

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))

// Stub the read + save modules so registering the IPC pulls no DB layer.
vi.mock('../get', () => ({ getJournalDay: vi.fn() }))
vi.mock('../save', () => ({ saveJournalDay: vi.fn(() => ({ date: '2026-05-14' })) }))

import { registerJournalIpc } from '../ipc'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerJournalIpc()
const invoke = (ch: string, input: unknown) => handlers.get(ch)!({}, input)

beforeEach(() => {
  clearCache()
})

describe('JOURNAL_SAVE — analytics cache invalidation (discipline rollup)', () => {
  it('invalidates analytics:all so the next read recomputes the discipline rollup', () => {
    let n = 0
    const compute = vi.fn(() => ({ tick: ++n }))
    expect(memoize('analytics:all', compute).tick).toBe(1) // cold seed
    expect(compute).toHaveBeenCalledTimes(1)

    const v0 = getDataVersion()
    invoke(IPC.JOURNAL_SAVE, {
      date: '2026-05-14',
      premarket_notes: '',
      postsession_notes: '',
      emotion_rating: 4,
      rules_followed: [],
      rule_violations: [],
    })
    expect(getDataVersion()).toBe(v0 + 1) // the handler bumped

    expect(memoize('analytics:all', compute).tick).toBe(2) // MISS -> recompute fresh
    expect(compute).toHaveBeenCalledTimes(2)
  })
})
