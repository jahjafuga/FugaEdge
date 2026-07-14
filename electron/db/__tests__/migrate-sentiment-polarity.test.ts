// Contract test for the v0.2.5 sentiment-polarity migration (schema 28 → 29).
//
// Same harness constraint as migrate-reset-mae-mfe.test.ts: better-sqlite3's
// native binary won't load under vitest. The migration is self-contained (the
// flip is a single SQL statement on the passed-in conn), so we drive it with a
// mock Database shim. This pins the GLUE — version gate, settings latch,
// guarded non-idempotency, backup-before-flip ordering, and safe-on-failure
// latch ordering. The actual `6 - sentiment` UPDATE on real rows is verified by
// the sandbox proof (a COPY of the real dev journal).

import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  migrateSentimentPolarity,
  SENTIMENT_POLARITY_MIGRATION_LATCH_KEY,
} from '../migrate-sentiment-polarity'

let settings: Record<string, string>
let flipRuns: number
let ratedRows: number
const mockEvents: string[] = []

// Minimal better-sqlite3 stand-in: get() serves the latch read; run() applies
// the UPDATE (returns a changes count) and the latch INSERT to the in-memory
// settings map.
function makeConn() {
  return {
    // The migration now wraps its data write(s) AND its latch in ONE conn.transaction, so they
    // can never disagree — a latch that silently failed to land while the data committed is the
    // defect this beat exists to kill. This shim RUNS the callback and PROPAGATES a throw; it
    // does not model ROLLBACK. Rollback is a real-engine claim and is proven as such in
    // electron/db/__tests__/migration-chain.inmemory.ts, fixture [B1].
    transaction(fn: (...a: unknown[]) => unknown) {
      return (...a: unknown[]) => fn(...a)
    },
    prepare(sql: string) {
      return {
        get: (...args: unknown[]) => {
          if (/SELECT value FROM settings WHERE key/i.test(sql)) {
            const key = String(args[0])
            return key in settings ? { value: settings[key] } : undefined
          }
          return undefined
        },
        all: () => [],
        run: (...args: unknown[]) => {
          if (/UPDATE session_meta SET sentiment = 6 - sentiment/i.test(sql)) {
            mockEvents.push('flip')
            flipRuns += 1
            return { changes: ratedRows, lastInsertRowid: 0 }
          }
          if (/INSERT INTO settings/i.test(sql)) {
            settings[String(args[0])] = 'true'
            return { changes: 1, lastInsertRowid: 0 }
          }
          return { changes: 0, lastInsertRowid: 0 }
        },
      }
    },
  } as unknown as import('better-sqlite3').Database
}

beforeEach(() => {
  settings = {}
  flipRuns = 0
  ratedRows = 7
  mockEvents.length = 0
})

describe('migrateSentimentPolarity — version gate', () => {
  it('skips on a fresh install (priorVersion 0); no flip', () => {
    const r = migrateSentimentPolarity(makeConn(), 0)
    expect(r).toEqual({ ran: false, reason: 'fresh-install', rowsFlipped: 0 })
    expect(flipRuns).toBe(0)
  })

  it('skips when priorVersion >= 29 (already migrated); no flip', () => {
    const r = migrateSentimentPolarity(makeConn(), 29)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('already-migrated')
    expect(flipRuns).toBe(0)
  })

  it('runs on priorVersion 28 (predates schema 29)', () => {
    const r = migrateSentimentPolarity(makeConn(), 28)
    expect(r.ran).toBe(true)
  })
})

describe('migrateSentimentPolarity — flip + latch', () => {
  it('flips sentiment, then latches', () => {
    const r = migrateSentimentPolarity(makeConn(), 28)
    expect(r).toEqual({ ran: true, rowsFlipped: 7 })
    expect(flipRuns).toBe(1)
    expect(settings[SENTIMENT_POLARITY_MIGRATION_LATCH_KEY]).toBe('true')
  })

  it('skips when the settings latch is already set; no flip', () => {
    settings[SENTIMENT_POLARITY_MIGRATION_LATCH_KEY] = 'true'
    const r = migrateSentimentPolarity(makeConn(), 28)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('latched')
    expect(flipRuns).toBe(0)
  })

  // The flip is an involution — a SECOND apply would corrupt. Both guards must
  // prevent it: the latch (within a version) and the version gate (across
  // launches). Here we prove the latch stops the re-run after a success.
  it('does NOT flip twice: a second run after success is a latched no-op', () => {
    const conn = makeConn()
    migrateSentimentPolarity(conn, 28)
    expect(flipRuns).toBe(1)
    const r2 = migrateSentimentPolarity(conn, 28)
    expect(r2.reason).toBe('latched')
    expect(flipRuns).toBe(1) // not flipped again
  })

  // The other half of the double-flip guard: even if the latch were somehow
  // missing, a post-stamp launch reports priorVersion 29 and the version gate
  // blocks the re-run.
  it('version gate blocks a re-run after the schema is stamped (priorVersion 29)', () => {
    const r = migrateSentimentPolarity(makeConn(), 29)
    expect(r.reason).toBe('already-migrated')
    expect(flipRuns).toBe(0)
  })
})

describe('migrateSentimentPolarity — backup + safe-on-failure', () => {
  it('invokes the backup BEFORE the flip', () => {
    const backup = vi.fn(() => mockEvents.push('backup'))
    migrateSentimentPolarity(makeConn(), 28, { backup })
    expect(backup).toHaveBeenCalledTimes(1)
    expect(mockEvents).toEqual(['backup', 'flip'])
  })

  it('a backup failure aborts: no flip, no latch', () => {
    const backup = vi.fn(() => {
      throw new Error('disk full')
    })
    const r = migrateSentimentPolarity(makeConn(), 28, { backup })
    expect(r).toEqual({ ran: false, reason: 'backup-failed', rowsFlipped: 0 })
    expect(flipRuns).toBe(0)
    expect(settings[SENTIMENT_POLARITY_MIGRATION_LATCH_KEY]).toBeUndefined()
  })
})
