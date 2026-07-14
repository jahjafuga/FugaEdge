// The migration chain's decision logic. PURE (zero electron / db / fs imports, per ARCHITECTURE #1).
//
// *** WHY THIS MODULE EXISTS: "retries next launch" was a LIE. 24 times, across 8 files. ***
//
// db.exec(SCHEMA_SQL) (database.ts:185) DURABLY stamps _meta.schema_version — it is the LAST
// statement in SCHEMA_SQL (schema.ts:735), and better-sqlite3's .exec() auto-commits each
// statement, so the new version is on disk before a single migration has run. migrateAfterSchema
// (:186) then runs OUTSIDE that transaction and used to return `void`, discarding every result.
//
// So a migration that soft-failed — 'transaction-failed', 'flip-failed', 'backup-failed' — left
// its latch unset, the boot completed cheerfully, and the NEXT boot read priorVersion = 47 and
// gated out at 'already-migrated' BEFORE the latch (the one thing that knew it never ran) was
// ever consulted. The retry never happened. Every "the latch is unset, so it retries next
// launch" comment in the repo was false.
//
// NO CRASH IS REQUIRED. A disk hiccup, a SQLITE_BUSY, a locked backup file is enough.
//
// The fix is two facts, kept separately:
//   _meta.schema_version   — what the schema PHYSICALLY is. Still stamped by SCHEMA_SQL. Honest.
//   _meta.migration_in_progress — the version the chain STARTED from, cleared only on success.
// The boot resumes from the marker when there is one, and from the stamp when there is not.

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE REASON UNIVERSE. Every reason any migration in the chain can report lives in exactly one
// of these two arrays, and MigrationReason is DERIVED from them.
//
// *** THAT DERIVATION IS THE ENFORCEMENT. It makes tsc the gate, not a console line. ***
//
// A new migration that invents 'foo-failed' cannot be passed to migrateAfterSchema's collector:
// its reason union is not assignable to MigrationReason, so `record(...)` FAILS TO COMPILE. The
// only way to make it compile is to put 'foo-failed' in one of these two arrays — which forces
// the author to DECIDE, explicitly, whether it is a healthy skip or a failure. There is no path
// that silently defaults.
//
// (An earlier draft typed `reason?: string`. That compiled anything and enforced nothing — the
// classification would have degraded to a runtime console.error nobody in a packaged app reads.)
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Reasons a version-gated migration may DECLINE to run and still be perfectly healthy. */
export const HEALTHY_SKIP_REASONS = ['fresh-install', 'already-migrated', 'latched'] as const

/** Reasons that mean the migration did NOT do its job. Any of these keeps the in-progress
 *  marker alive so the next launch resumes instead of forgetting. */
export const FAILURE_REASONS = [
  'inconsistent-state', // settings unreadable on a versioned DB
  'backup-failed', // no restorable .bak on record -> never migrate
  'transaction-failed', // the atomic core rolled back
  'flip-failed', // sentiment-polarity: the involution rolled back
  'wipe-failed', // reset-mae-mfe: the wipe + arming flag + latch rolled back
  'recompute-failed', // scratch-reclassify: the cache rebuild rolled back
  'aborted', // trades-rebuild-dedup, normalised from its `status` at the call site
] as const

export type MigrationReason =
  | (typeof HEALTHY_SKIP_REASONS)[number]
  | (typeof FAILURE_REASONS)[number]

/** The shape every version-gated migration reports.
 *
 *  `migrateTradesRebuildDedup` is the one outlier — it has NO `ran` field at all, only `status`
 *  and a free-form `reason: string` (migrate-trades-rebuild-dedup.ts:30-35) — so it is normalised
 *  into this shape explicitly at the call site. Do NOT feed it in raw: `.ran` would read
 *  `undefined` and its free-form reason would not match a healthy skip, so it would report FAILED
 *  ON EVERY BOOT — the marker would never clear and every launch would re-run the whole chain. */
export interface MigrationOutcome {
  ran: boolean
  reason?: MigrationReason
}

/** FAIL-SAFE BY DESIGN: an unrecognised reason counts as a FAILURE.
 *
 *  The asymmetry is the point. A false FAILURE costs one extra retry, and that retry is a
 *  no-op — the migration is latched and skips. A false SUCCESS clears the marker and the
 *  migration is never retried again, which is precisely the bug this module exists to kill.
 *  So when a future migration invents a failure reason nobody added here, we take the cheap
 *  side of the trade automatically. */
export function isMigrationOk(outcome: MigrationOutcome): boolean {
  if (outcome.ran) return true
  // The `as readonly string[]` widening is deliberate: tsc has already narrowed `reason` to a
  // known member at every call site, but this must ALSO hold for a value that arrives untyped
  // (an `any` cast, a value read back from the DB). Belt at compile time, braces at run time.
  return (
    outcome.reason != null &&
    (HEALTHY_SKIP_REASONS as readonly string[]).includes(outcome.reason)
  )
}

/** Is this reason classified at all? Every member of MigrationReason must answer true —
 *  enforced by electron/db/__tests__/migration-reasons.contract.test.ts, which reads the
 *  migration SOURCE and fails the suite on any reason literal that is in neither array. */
export function isClassifiedReason(reason: string): boolean {
  return (
    (HEALTHY_SKIP_REASONS as readonly string[]).includes(reason) ||
    (FAILURE_REASONS as readonly string[]).includes(reason)
  )
}

/** The chain succeeded iff nothing in it reported a failure. Only then may the marker clear.
 *
 *  A PERSISTENTLY failing migration therefore keeps the marker alive forever, and that is
 *  BENIGN, not a boot loop: the boot still completes (a soft failure does not throw —
 *  database.ts:1514), every migration that already succeeded is latched and skips, the failing
 *  one's data change is atomic so there is nothing to corrupt, and its backup is latched too so
 *  it cannot fill the disk. It is loud (a console line every boot) and self-healing (the moment
 *  the cause clears it succeeds and the marker goes). Retrying forever beats never retrying. */
export function chainSucceeded(outcomes: MigrationOutcome[]): boolean {
  return outcomes.every(isMigrationOk)
}

/** Which version the boot must actually migrate FROM.
 *
 *  The marker wins when present: it records where the chain STARTED, before SCHEMA_SQL moved
 *  the stamp out from under it. A missing / zero / garbage marker falls back to the on-disk
 *  stamp, so a corrupt marker can never invent a bogus resume point and re-run history.
 *
 *  Returns 0 on a fresh install (no _meta at all). The caller MUST NOT write a marker at 0:
 *  _meta does not exist yet — that is exactly why readSchemaVersion returns 0, via its catch
 *  (database.ts:110-112) — so the write would throw `no such table: _meta` and, under our own
 *  fail-closed boot, would brick every fresh install. The `effective > 0` guard is load-bearing. */
export function resolveEffectivePriorVersion(
  marker: number | null,
  stampedVersion: number,
): number {
  if (marker != null && Number.isFinite(marker) && marker > 0) return marker
  return stampedVersion
}
