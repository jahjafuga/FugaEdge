// Catalyst-recovery Beat 1 — the schema 45 -> 46 version bump for the orphan-catalyst backfill.
// The BEHAVIOR (data-derived orphan enumeration, active+custom recovered rows, case-insensitive
// no-dup, trim/null handling, byte-identical trades.catalyst_type, idempotency, and the wrapper's
// gate/latch/backup-abort/txn) is proven against a REAL in-memory engine in
// electron/catalyst/__tests__/backfill.inmemory.ts, run via `npm run test:catalyst-backfill`
// (better-sqlite3's Electron ABI won't load under vitest). This file locks the pure, sqlite-free
// part: the version bump + the migration's target constant.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import { CATALYST_BACKFILL_TARGET_SCHEMA_VERSION } from '../migrate-catalyst-backfill'

describe('migrate-catalyst-backfill — schema 45 -> 46 version bump', () => {
  it('holds SCHEMA_VERSION at the catalyst-recovery floor of 46 or later (later beats advance it)', () => {
    // Relaxed from an exact-46 assertion when rule-breaks Beat 3a bumped the head to 47 — the
    // same floor convention the mistakes / F0 / F3 / B1 / B2b migration tests already use. The
    // gate constant below stays EXACT: it is this migration's boundary, not the head version.
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(46)
  })

  it('targets schema 46 (the wrapper gate boundary)', () => {
    expect(CATALYST_BACKFILL_TARGET_SCHEMA_VERSION).toBe(46)
  })
})
