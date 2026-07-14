// Contract test for the v0.2.3 mae/mfe-reset migration (schema 24 → 25).
//
// Same harness constraint as migrate-scratch-reclassify.test.ts: better-sqlite3's
// native binary won't load under vitest. The migration is self-contained (the
// wipe is a single SQL statement on the passed-in conn), so we drive it with a
// mock Database shim. This pins the GLUE — version gate, settings latch,
// idempotency, backup-before-wipe ordering, the backfill-pending flag, and
// safe-on-failure latch ordering. It does NOT exercise real SQLite; the actual
// UPDATE + recompute are verified by sandbox.

import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  migrateResetMaeMfe,
  RESET_MAE_MFE_MIGRATION_LATCH_KEY,
  MAE_MFE_BACKFILL_PENDING_KEY,
} from '../migrate-reset-mae-mfe'

let settings: Record<string, string>
let wipeRuns: number
let tradeCount: number
const mockEvents: string[] = []

// Minimal better-sqlite3 stand-in: get() serves the latch read; run() applies
// the UPDATE (returns a changes count) and the settings INSERTs (pending +
// latch) to the in-memory settings map.
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
          if (/UPDATE trades SET mae = NULL, mfe = NULL/i.test(sql)) {
            mockEvents.push('wipe')
            wipeRuns += 1
            return { changes: tradeCount, lastInsertRowid: 0 }
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
  wipeRuns = 0
  tradeCount = 5
  mockEvents.length = 0
})

describe('migrateResetMaeMfe — version gate', () => {
  it('skips on a fresh install (priorVersion 0); no wipe', () => {
    const r = migrateResetMaeMfe(makeConn(), 0)
    expect(r).toEqual({ ran: false, reason: 'fresh-install', rowsReset: 0 })
    expect(wipeRuns).toBe(0)
  })

  it('skips when priorVersion >= 25 (already migrated); no wipe', () => {
    const r = migrateResetMaeMfe(makeConn(), 25)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('already-migrated')
    expect(wipeRuns).toBe(0)
  })

  it('runs on priorVersion 24 (predates schema 25)', () => {
    const r = migrateResetMaeMfe(makeConn(), 24)
    expect(r.ran).toBe(true)
  })
})

describe('migrateResetMaeMfe — wipe + flags + latch', () => {
  it('wipes mae/mfe, arms the backfill-pending flag, then latches', () => {
    const r = migrateResetMaeMfe(makeConn(), 24)
    expect(r).toEqual({ ran: true, rowsReset: 5 })
    expect(wipeRuns).toBe(1)
    expect(settings[MAE_MFE_BACKFILL_PENDING_KEY]).toBe('true')
    expect(settings[RESET_MAE_MFE_MIGRATION_LATCH_KEY]).toBe('true')
  })

  it('skips when the settings latch is already set; no wipe', () => {
    settings[RESET_MAE_MFE_MIGRATION_LATCH_KEY] = 'true'
    const r = migrateResetMaeMfe(makeConn(), 24)
    expect(r.ran).toBe(false)
    expect(r.reason).toBe('latched')
    expect(wipeRuns).toBe(0)
  })

  it('is idempotent: a second run after success is a latched no-op', () => {
    const conn = makeConn()
    migrateResetMaeMfe(conn, 24)
    expect(wipeRuns).toBe(1)
    const r2 = migrateResetMaeMfe(conn, 24)
    expect(r2.reason).toBe('latched')
    expect(wipeRuns).toBe(1) // not wiped again
  })
})

describe('migrateResetMaeMfe — backup + safe-on-failure', () => {
  it('invokes the backup BEFORE the wipe', () => {
    const backup = vi.fn(() => mockEvents.push('backup'))
    migrateResetMaeMfe(makeConn(), 24, { backup })
    expect(backup).toHaveBeenCalledTimes(1)
    expect(mockEvents).toEqual(['backup', 'wipe'])
  })

  it('a backup failure aborts: no wipe, no pending flag, no latch', () => {
    const backup = vi.fn(() => {
      throw new Error('disk full')
    })
    const r = migrateResetMaeMfe(makeConn(), 24, { backup })
    expect(r).toEqual({ ran: false, reason: 'backup-failed', rowsReset: 0 })
    expect(wipeRuns).toBe(0)
    expect(settings[MAE_MFE_BACKFILL_PENDING_KEY]).toBeUndefined()
    expect(settings[RESET_MAE_MFE_MIGRATION_LATCH_KEY]).toBeUndefined()
  })
})
