// THE 24 LIES — the pure half.
//
// Every version-gated migration promises "the latch is unset, so it retries next launch."
// 24 places across 8 files say it. NONE of them is true.
//
// db.exec(SCHEMA_SQL) (database.ts:185) DURABLY stamps _meta.schema_version, and
// migrateAfterSchema (:186) runs AFTER it, outside that transaction, and returns `void` —
// every migration's result is DISCARDED. So a migration that soft-fails ('transaction-failed',
// 'flip-failed', 'backup-failed') leaves its latch unset, the boot completes cheerfully, and
// the NEXT boot reads priorVersion = 47 and gates out at 'already-migrated' BEFORE the latch —
// the one thing that knows it never ran — is ever consulted. The retry never happens. Ever.
//
// No crash is required. A disk hiccup, a SQLITE_BUSY, a locked backup file is enough.
//
// This module is the pure core of the fix: which outcomes mean the chain is healthy, and
// which version a boot must actually resume from.

import { describe, expect, it } from 'vitest'
import {
  chainSucceeded,
  isMigrationOk,
  resolveEffectivePriorVersion,
  HEALTHY_SKIP_REASONS,
  type MigrationReason,
} from '@/core/db/migrationChain'

describe('[C] *** THE 24 LIES *** — a soft-failed migration must be RETRIED, not forgotten', () => {
  it('THE BUG, IN ONE ASSERTION: boot 1 soft-fails at 46 -> boot 2 must resume from 46, NOT the stamped 47', () => {
    // Boot 1: the rule-breaks backfill's transaction throws. It returns 'transaction-failed'
    // and leaves its latch UNSET — which is exactly what it says entitles it to a retry.
    const boot1 = chainSucceeded([{ ran: false, reason: 'transaction-failed' }])
    expect(boot1).toBe(false) // => the in-progress marker must NOT be cleared

    // Boot 2: _meta.schema_version says 47 (SCHEMA_SQL stamped it before the migration ever
    // ran). The marker says 46. THE MARKER MUST WIN. If the stamp wins, the version gate
    // returns 'already-migrated' and that migration is dead for the life of the install.
    expect(resolveEffectivePriorVersion(46, 47)).toBe(46)
  })

  it('every failure reason in the codebase blocks the marker from clearing', () => {
    // The full failure union, harvested from the 12 result-bearing migrations.
    for (const reason of [
      'transaction-failed', // rule-breaks / mistakes / catalyst / tz / precise / net-precise
      'flip-failed', // sentiment-polarity  <- the involution. Double-apply = corruption.
      'wipe-failed', // reset-mae-mfe
      'recompute-failed', // scratch-reclassify
      'backup-failed', // every backed-up migration
      'inconsistent-state', // settings unreadable on a versioned DB
    ] as const) {
      expect(isMigrationOk({ ran: false, reason })).toBe(false)
      expect(chainSucceeded([{ ran: true }, { ran: false, reason }])).toBe(false)
    }
  })

  it('a HEALTHY skip does not block the marker — those are not failures', () => {
    for (const reason of ['fresh-install', 'already-migrated', 'latched'] as const) {
      expect(isMigrationOk({ ran: false, reason })).toBe(true)
    }
    expect(HEALTHY_SKIP_REASONS).toEqual(['fresh-install', 'already-migrated', 'latched'])
  })

  it('a migration that RAN is healthy (it reports no reason at all)', () => {
    expect(isMigrationOk({ ran: true })).toBe(true)
  })

  it('a clean chain of runs + healthy skips clears the marker', () => {
    expect(
      chainSucceeded([
        { ran: true },
        { ran: false, reason: 'latched' },
        { ran: false, reason: 'already-migrated' },
        { ran: false, reason: 'fresh-install' },
      ]),
    ).toBe(true)
  })

  it('an empty chain is healthy (nothing to resume)', () => {
    expect(chainSucceeded([])).toBe(true)
  })
})

describe('[C] FAIL-SAFE: an UNKNOWN reason counts as a FAILURE', () => {
  it('an unrecognised reason blocks the clear rather than being waved through', () => {
    // Deliberate. The cost of a false failure is ONE extra retry, and that retry is a no-op
    // because the migration is latched and skips. The cost of a false SUCCESS is the bug this
    // whole module exists to kill: a new failure mode silently clears the marker and the
    // migration is never retried again. Asymmetric, so we take the cheap side.
    // The CAST is the point of this test, not a workaround for it. tsc now REFUSES this literal
    // outright (MigrationReason is a closed union derived from the two arrays) — that is layer 1,
    // and it is proven by migration-reasons.contract.test.ts. This asserts layer 2: the RUNTIME
    // guard still holds for a value that arrives past the type system — an `any` boundary, a
    // string read back from the DB, a bundling seam. It must land on FAILURE, never be waved through.
    expect(isMigrationOk({ ran: false, reason: 'a-reason-nobody-classified' as MigrationReason })).toBe(false)
    expect(isMigrationOk({ ran: false })).toBe(false) // no reason at all -> not a healthy skip
  })

  it('*** the trades-rebuild outlier: it has NO `ran` field, only status ***', () => {
    // TradesRebuildResult is { status: 'noop-already-composite' | 'fastpath-fresh-shape'
    //   | 'rebuilt' | 'aborted', reason?: string } — migrate-trades-rebuild-dedup.ts:30-35.
    // A uniform collector reading `.ran` gets undefined -> falsy -> and its free-form
    // `reason` string is not a healthy skip -> it would read as FAILED ON EVERY BOOT, so the
    // marker would never clear and every boot would re-run the whole chain forever.
    // It MUST be normalised explicitly at the call site. These pin both directions.
    expect(isMigrationOk({ ran: true })).toBe(true) // rebuilt / noop / fastpath
    // 'aborted' is a CLASSIFIED literal now; its free-form detail is carried separately, OUT of
    // the classifier, so a template string can never reach the reason union.
    expect(isMigrationOk({ ran: false, reason: 'aborted' })).toBe(false)
  })
})

describe('resolveEffectivePriorVersion — the marker wins, when there is one', () => {
  it('no marker -> the on-disk stamp is the truth', () => {
    expect(resolveEffectivePriorVersion(null, 47)).toBe(47)
  })

  it('a marker -> IT is the truth, even though the stamp reads higher', () => {
    expect(resolveEffectivePriorVersion(28, 47)).toBe(28) // Dave, mid-upgrade, crashed
  })

  it('[H] FRESH INSTALL: no marker, stamp 0 -> 0 (and NO marker may be written)', () => {
    // _meta does not exist yet on a fresh install — that is precisely why readSchemaVersion
    // returns 0, via its catch (database.ts:110-112). Writing a marker here would throw
    // "no such table: _meta" and, under our own fail-closed boot, would brick every fresh
    // install. The `effective > 0` guard at the call site is LOAD-BEARING, not an optimisation.
    expect(resolveEffectivePriorVersion(null, 0)).toBe(0)
  })

  it('[F] DOUBLE CRASH: a marker of 0 or garbage is treated as absent, never as a resume point', () => {
    expect(resolveEffectivePriorVersion(0, 47)).toBe(47)
    expect(resolveEffectivePriorVersion(-1, 47)).toBe(47)
  })
})
