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
  it('bumps SCHEMA_VERSION to exactly 46', () => {
    expect(SCHEMA_VERSION).toBe('46')
  })

  it('targets schema 46 (the wrapper gate boundary)', () => {
    expect(CATALYST_BACKFILL_TARGET_SCHEMA_VERSION).toBe(46)
  })
})
