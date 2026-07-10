// Cache-invalidation contract for DAY_TAGS_SAVE — and the no-bump guard for its
// sibling WEEK_NOTES_SAVE.
//
// analytics computeDiscipline counts a date as "journaled" when its journal row
// carries a non-empty day_tags (electron/analytics/get.ts:606,
// `OR (day_tags IS NOT NULL AND day_tags != '' AND day_tags != '[]')`), feeding
// days_journaled / discipline_score at :652. So DAY_TAGS_SAVE mutates a memoized
// analytics input and must bump (the rule-breaks bug class, 6e0c0bc).
//
// WEEK_NOTES_SAVE writes week_notes, which NEITHER memoized cache reads
// (analytics reads trades/session_meta/trade_mistake/journal/settings; reports
// reads trades/market_data). It is the representative correctly-no-bump handler:
// this file locks it so a future reflexive bump there is flagged. (The trade-edit
// handlers are NOT valid no-bump guards — they already bump via withVersionBump
// in trades/ipc.ts, correctly, because analytics aggregates trades.)
//
// REAL cache module; the read + save modules are stubbed (no DB).

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

vi.mock('../get', () => ({ getCalendarMonth: vi.fn(), getCalendarYear: vi.fn() }))
vi.mock('../dayTags', () => ({ saveDayTags: vi.fn(() => ({ date: '2026-05-14', tags: [] })) }))
vi.mock('../weekNotes', () => ({ saveWeekNotes: vi.fn(() => ({ week_start: '2026-05-11' })) }))

import { registerCalendarIpc } from '../ipc'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerCalendarIpc()
const invoke = (ch: string, input: unknown) => handlers.get(ch)!({}, input)

beforeEach(() => {
  clearCache()
})

describe('DAY_TAGS_SAVE — analytics cache invalidation (journaled-presence)', () => {
  it('invalidates analytics:all so the next read recomputes the discipline rollup', () => {
    let n = 0
    const compute = vi.fn(() => ({ tick: ++n }))
    expect(memoize('analytics:all', compute).tick).toBe(1)
    expect(compute).toHaveBeenCalledTimes(1)

    const v0 = getDataVersion()
    invoke(IPC.DAY_TAGS_SAVE, { date: '2026-05-14', tags: ['FOMC'] })
    expect(getDataVersion()).toBe(v0 + 1)

    expect(memoize('analytics:all', compute).tick).toBe(2)
    expect(compute).toHaveBeenCalledTimes(2)
  })
})

describe('WEEK_NOTES_SAVE — deliberately does NOT invalidate (feeds no cache)', () => {
  it('does not bump the data version (week_notes is read by no memoized cache)', () => {
    let n = 0
    const compute = vi.fn(() => ({ tick: ++n }))
    expect(memoize('analytics:all', compute).tick).toBe(1)

    const v0 = getDataVersion()
    invoke(IPC.WEEK_NOTES_SAVE, { week_start: '2026-05-11', notes: 'solid week' })
    expect(getDataVersion()).toBe(v0) // no bump

    expect(memoize('analytics:all', compute).tick).toBe(1) // HIT -> still cached
    expect(compute).toHaveBeenCalledTimes(1)
  })
})
