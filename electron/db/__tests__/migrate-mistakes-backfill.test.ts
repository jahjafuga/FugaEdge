// Mistakes-recovery Beat 1 — the schema 44 -> 45 version bump for the orphan-mistakes
// backfill. The BEHAVIOR (find-or-create defs, junction links, byte-identical mistakes_json,
// idempotency, uncategorized report, and the wrapper's gate/latch/backup-abort/txn) is proven
// against a REAL in-memory engine in electron/mistakes/__tests__/backfill.inmemory.ts, run via
// `npm run test:mistakes-backfill` (better-sqlite3's Electron ABI won't load under vitest). This
// file locks the pure, sqlite-free part: the version bump + the migration's target constant.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import { MISTAKES_BACKFILL_TARGET_SCHEMA_VERSION } from '../migrate-mistakes-backfill'

describe('migrate-mistakes-backfill — schema 44 -> 45 version bump', () => {
  it('holds SCHEMA_VERSION at the mistakes-recovery floor of 45 or later (later beats advance it)', () => {
    // Relaxed from an exact-45 assertion when catalyst-recovery Beat 1 bumped the head to 46 —
    // the same floor convention the F0 / F3 / B1 / B2b migration tests already use. The gate
    // constant below stays EXACT: it is this migration's boundary, not the head version.
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(45)
  })

  it('targets schema 45 (the wrapper gate boundary)', () => {
    expect(MISTAKES_BACKFILL_TARGET_SCHEMA_VERSION).toBe(45)
  })
})
