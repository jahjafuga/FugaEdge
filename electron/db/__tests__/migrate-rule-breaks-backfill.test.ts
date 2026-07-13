// Rule-breaks reshape Beat 3a — the schema 46 -> 47 version bump for the rule-breaks backfill.
// The BEHAVIOR (data-derived orphan resurrection as ARCHIVED defs, the day junction,
// byte-identical journal.rule_breaks, idempotency, and the wrapper's gate/latch/backup-abort/txn
// — plus [20] rename-resurrection and [19] the restore walk) is proven against a REAL in-memory
// engine in electron/ruleBreaks/__tests__/backfill.inmemory.ts, run via
// `npm run test:rule-breaks-backfill` (better-sqlite3's Electron ABI won't load under vitest).
// This file locks the pure, sqlite-free part: the version bump + the migration's constants.

import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import {
  RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION,
  RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY,
  RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY,
} from '../migrate-rule-breaks-backfill'

describe('migrate-rule-breaks-backfill — schema 46 -> 47 version bump', () => {
  it('bumps SCHEMA_VERSION to exactly 47', () => {
    expect(SCHEMA_VERSION).toBe('47')
  })

  it('targets schema 47 (the wrapper gate boundary)', () => {
    expect(RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION).toBe(47)
  })

  it('the gate boundary IS the head version — the migration must run on the 46 cohort', () => {
    // If these ever diverge the migration is either dead on arrival (target above head, so
    // every DB looks un-migrated forever) or skips its own cohort (target below head).
    expect(RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION).toBe(Number(SCHEMA_VERSION))
  })

  it('the two latches are distinct keys', () => {
    // They answer different questions — "did the backup land?" (written by database.ts, before
    // SCHEMA_SQL) and "did the migration run?" (written inside the migration's txn). Collapsing
    // them into one key would let a successful backup look like a completed migration.
    expect(RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY).not.toBe(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY)
    expect(RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY).toBe('rule_breaks_backfill_migration_done')
    expect(RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY).toBe('rule_breaks_backfill_backup_done')
  })
})
