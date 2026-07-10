// Cache-invalidation contract for the DAY_RULE_BREAKS_SAVE handler.
//
// Bug: the handler wrote journal.rule_breaks but never bumped the analytics data
// version, so the main-process memoize('analytics:<scope>') cache (5-min TTL,
// electron/lib/cache.ts) kept serving the pre-tag payload until TTL/restart —
// Analytics > Psychology showed "Flawed Days: 0" after tagging until a restart.
//
// These tests use the REAL cache module (memoize + bumpDataVersion + the real
// version counter) so they assert the actual invalidation CONTRACT — "after the
// save, the next analyticsGet recomputes and reflects the new break" — not merely
// that a spy fired. better-sqlite3 doesn't load under vitest, so openDatabase is
// faked (the ruleBreaks.test.ts pattern) and getAnalytics's rollup is modeled by
// a compute that reads the same journal state the save writes.
//
// Harness: handlers-map electron mock (lifecycle-ipc.test.ts precedent).

import { describe, expect, it, beforeEach, vi } from 'vitest'

const { handlers, state } = vi.hoisted(() => ({
  handlers: new Map<string, (e: unknown, input: unknown) => unknown>(),
  state: { journalHasBreak: false },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: (e: unknown, input: unknown) => unknown) => {
      handlers.set(ch, fn)
    },
  },
}))

// Fake DB: the rule-breaks upsert flips journalHasBreak to model "the day now
// carries a non-empty rule_breaks array"; every other query is inert so the note
// handler's session_meta upsert also runs without better-sqlite3.
vi.mock('../../db/database', () => ({
  getDbPath: () => '/fake/db/path',
  openDatabase: () => ({
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        if (/INSERT INTO journal/i.test(sql) && /rule_breaks/i.test(sql)) {
          const json = String(args[1] ?? '[]')
          state.journalHasBreak = json !== '[]' && json !== ''
        }
        return { changes: 1 }
      },
      get: () => undefined,
      all: () => [],
    }),
  }),
}))

// NOTE: ../../lib/cache is intentionally NOT mocked — the real memoize +
// bumpDataVersion drive the assertions (the invalidation contract, not a spy).
import { registerDayIpc } from '../ipc'
import { memoize, getDataVersion, clearCache } from '../../lib/cache'
import { IPC } from '@shared/ipc-channels'

registerDayIpc()
const invoke = (ch: string, input: unknown) => handlers.get(ch)!({}, input)

// Models getAnalytics's Daily Rule Breaks rollup: reads the journal state the
// save writes. days_with_any_break flips to 1 once a break is tagged.
const analyticsPayload = () => ({
  ruleBreaks: { days_with_any_break: state.journalHasBreak ? 1 : 0 },
})

beforeEach(() => {
  clearCache()
  state.journalHasBreak = false
})

describe('DAY_RULE_BREAKS_SAVE — analytics cache invalidation', () => {
  it('invalidates the analytics cache so the next analyticsGet recomputes and shows the flawed day', () => {
    const compute = vi.fn(analyticsPayload)

    // Warm the analytics cache with the CLEAN payload (no breaks tagged yet).
    const before = memoize('analytics:all', compute)
    expect(before.ruleBreaks.days_with_any_break).toBe(0)
    expect(compute).toHaveBeenCalledTimes(1)

    // Tag a rule break through the real handler (writes journal + must bump).
    invoke(IPC.DAY_RULE_BREAKS_SAVE, {
      date: '2026-05-14',
      breaks: ['Ignored daily max loss'],
    })
    expect(state.journalHasBreak).toBe(true) // the write landed

    // Same key, within TTL — only a data-version bump can force this miss. The
    // next analyticsGet must recompute FRESH and reflect the new flawed day.
    const after = memoize('analytics:all', compute)
    expect(after.ruleBreaks.days_with_any_break).toBe(1)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('returns the saved (cleaned) result AND bumps the data version', () => {
    const v0 = getDataVersion()
    const result = invoke(IPC.DAY_RULE_BREAKS_SAVE, {
      date: '2026-05-14',
      breaks: ['Ignored daily max loss', 'Ignored daily max loss'],
    }) as { date: string; breaks: string[] }

    // Return value/behavior otherwise unchanged (deduped, same shape).
    expect(result).toEqual({ date: '2026-05-14', breaks: ['Ignored daily max loss'] })
    // The version bump is what makes the memoize version-check miss.
    expect(getDataVersion()).toBe(v0 + 1)
  })
})

describe('DAY_NOTE_SAVE — deliberately does NOT invalidate (scope guard)', () => {
  // session_meta.notes is not read by any analytics rollup, so a bump here would
  // be needless full-cache invalidation with no correctness benefit. This encodes
  // that scoping decision: a future reflexive bump on the note handler trips this.
  it('does not bump the data version', () => {
    const v0 = getDataVersion()
    invoke(IPC.DAY_NOTE_SAVE, { date: '2026-05-14', body: 'just a post-session note' })
    expect(getDataVersion()).toBe(v0)
  })
})
