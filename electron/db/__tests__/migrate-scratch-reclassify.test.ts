// Contract test for the v0.2.3 scratch-reclassify daily_summary backfill.
//
// Same harness constraint as recompute-summary.test.ts: better-sqlite3's native
// binary won't load under vitest, and the migration transitively pulls it in via
// recompute-summary -> database. So we mock recompute-summary (capturing the
// dates Set) and drive the migration with a mock Database shim. This pins the
// GLUE — version gate, settings latch, idempotency, backup-before-recompute
// ordering, and safe-on-failure latch ordering. It does NOT assert recomputed
// winners/losers values; real execution is verified by sandbox 4.0.
//
// Captured vars are `mock`-prefixed so vitest's vi.mock hoisting allows the
// factory to reference them (same rule recompute-summary.test.ts relies on).

import { describe, expect, it, beforeEach, vi } from 'vitest'

let mockRecomputeCalls: Array<Set<string>> = []
let mockRecomputeThrows = false
const mockEvents: string[] = []

vi.mock('../../trades/recompute-summary', () => ({
  recomputeSummaryForDates: (dates: Set<string>) => {
    mockEvents.push('recompute')
    if (mockRecomputeThrows) throw new Error('recompute boom')
    mockRecomputeCalls.push(dates)
  },
}))

import {
  migrateScratchReclassify,
  SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY,
} from '../migrate-scratch-reclassify'

let settings: Record<string, string>
let liveDates: string[]

// Minimal better-sqlite3 stand-in: prepare() returns get/all/run keyed off the
// SQL text. get() serves the latch read; all() serves the distinct-dates read;
// run() applies the latch INSERT to the in-memory settings map.
function makeConn() {
  return {
    prepare(sql: string) {
      return {
        get: (...args: unknown[]) => {
          if (/SELECT value FROM settings WHERE key/i.test(sql)) {
            const key = String(args[0])
            return key in settings ? { value: settings[key] } : undefined
          }
          return undefined
        },
        all: () => {
          if (/SELECT DISTINCT date FROM trades/i.test(sql)) {
            return liveDates.map((date) => ({ date }))
          }
          return []
        },
        run: (...args: unknown[]) => {
          if (/INSERT INTO settings/i.test(sql)) {
            settings[String(args[0])] = 'true'
          }
          return { changes: 1, lastInsertRowid: 0 }
        },
      }
    },
  } as unknown as import('better-sqlite3').Database
}

beforeEach(() => {
  settings = {}
  liveDates = ['2026-01-05', '2026-01-06', '2026-01-07']
  mockRecomputeCalls = []
  mockRecomputeThrows = false
  mockEvents.length = 0
})

describe('migrateScratchReclassify — version gate', () => {
  it('skips on a fresh install (priorVersion 0); no recompute', () => {
    const r = migrateScratchReclassify(makeConn(), 0)
    expect(r).toEqual({ ran: false, reason: 'fresh-install', datesRecomputed: 0 })
    expect(mockRecomputeCalls).toHaveLength(0)
  })

  it('skips when priorVersion >= 24 (already migrated); no recompute', () => {
    const r = migrateScratchReclassify(makeConn(), 24)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('already-migrated')
    expect(mockRecomputeCalls).toHaveLength(0)
  })

  it('runs on priorVersion 23 (predates schema 24)', () => {
    const r = migrateScratchReclassify(makeConn(), 23)
    expect(r.ran).toBe(true)
  })
})

describe('migrateScratchReclassify — recompute + latch', () => {
  it('recomputes daily_summary for ALL distinct live dates, then latches', () => {
    const r = migrateScratchReclassify(makeConn(), 23)
    expect(r).toEqual({ ran: true, datesRecomputed: 3 })
    expect(mockRecomputeCalls).toHaveLength(1)
    expect(mockRecomputeCalls[0]).toEqual(
      new Set(['2026-01-05', '2026-01-06', '2026-01-07']),
    )
    expect(settings[SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY]).toBe('true')
  })

  it('skips when the settings latch is already set; no recompute', () => {
    settings[SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY] = 'true'
    const r = migrateScratchReclassify(makeConn(), 23)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('latched')
    expect(mockRecomputeCalls).toHaveLength(0)
  })

  it('is idempotent: a second run after success is a latched no-op', () => {
    const conn = makeConn()
    migrateScratchReclassify(conn, 23)
    expect(mockRecomputeCalls).toHaveLength(1)
    const r2 = migrateScratchReclassify(conn, 23)
    expect(r2.reason).toBe('latched')
    expect(mockRecomputeCalls).toHaveLength(1) // not recomputed again
  })
})

describe('migrateScratchReclassify — backup + safe-on-failure', () => {
  it('invokes the backup BEFORE the recompute', () => {
    const backup = vi.fn(() => mockEvents.push('backup'))
    migrateScratchReclassify(makeConn(), 23, { backup })
    expect(backup).toHaveBeenCalledTimes(1)
    expect(mockEvents).toEqual(['backup', 'recompute'])
  })

  it('a backup failure aborts: no recompute, no latch', () => {
    const backup = vi.fn(() => {
      throw new Error('disk full')
    })
    const r = migrateScratchReclassify(makeConn(), 23, { backup })
    expect(r).toEqual({ ran: false, reason: 'backup-failed', datesRecomputed: 0 })
    expect(mockRecomputeCalls).toHaveLength(0)
    expect(settings[SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY]).toBeUndefined()
  })

  it('does NOT write the latch when recompute throws (retry stays possible)', () => {
    mockRecomputeThrows = true
    const r = migrateScratchReclassify(makeConn(), 23)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('recompute-failed')
    expect(settings[SCRATCH_RECLASSIFY_MIGRATION_LATCH_KEY]).toBeUndefined()
  })
})
