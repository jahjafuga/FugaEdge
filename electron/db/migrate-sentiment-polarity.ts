// v0.2.5 (schema 28 → 29) — one-shot polarity flip of session_meta.sentiment.
//
// The 1..5 market-sentiment scale was inverted vs intuition: 1 used to mean
// the BEST environment (3+ stocks running >100%) and 5 the WORST (thin tape).
// The flip makes it intuitive — higher = hotter/better — so 5 = best (fire)
// and 1 = worst (ice), matching the upgraded sentiment card's icon ladder and
// a standard 1–5 mental model. The transform is the involution `6 - sentiment`
// (1↔5, 2↔4, 3↔3); NULL (unrated) rows are left untouched. Historical data
// flips with it and becomes the new normal — this is a one-way migration.
//
// DESTRUCTION PROFILE: this rewrites real user-entered values in place. The
// pre-migration backup (caller's `backup` closure) is the safety net if a
// flip needs to be undone by hand — so a backup failure MUST abort before the
// UPDATE. (Recovery is also possible by re-applying the same UPDATE, since the
// transform is its own inverse — but ONLY exactly once; see the warning below.)
//
// ⚠ NOT IDEMPOTENT. Unlike the additive / null-wipe / derived-rebuild
// migrations, re-running this UPDATE flips the values BACK and silently
// corrupts (numbers reversed while the labels show the new polarity). The
// version gate is therefore LOAD-BEARING, not just defense-in-depth: once a
// successful launch stamps schema_version = 29, priorVersion on the next
// launch is 29 and Guard 1 blocks any re-run regardless of the latch. KEEP
// BOTH guards — do NOT simplify to latch-only.
//
// Idempotency / safety: two guards plus an ATOMIC flip+latch.
//   1. Version gate — runs only on a DB that predates schema 29 (priorVersion
//      0 = fresh install → skip; fresh DBs are written under the NEW labels,
//      so flipping them would corrupt).
//   2. Settings latch — checked up front, and WRITTEN IN THE SAME TRANSACTION AS
//      THE FLIP. Either both land or neither does.
//
// *** THE LATCH USED TO BE A SEPARATE STATEMENT, AND ITS FAILURE WAS SWALLOWED. ***
//
// The flip committed in its own implicit transaction; the latch INSERT then ran separately and
// its failure was logged and ignored. So a disk-full could leave the data FLIPPED with the latch
// UNSET — "ran" and "latched" disagreeing about the same event. That was survivable only because
// the version gate had already been moved to 29 by SCHEMA_SQL, so the next boot refused to
// re-run. The stamp was doing the latch's job.
//
// *** THIS FIX IS ONLY CORRECT BECAUSE OF THE IN-PROGRESS MARKER, AND VICE VERSA. ***
//
//   Marker WITHOUT this fix: a crashed boot resumes from 28, the gate opens, the latch is unset
//     because it silently never landed — and the flip runs a SECOND time. It is an involution.
//     Every sentiment rating inverts. Silent corruption.
//   This fix WITHOUT the marker: the latch write fails, the whole transaction rolls back, the
//     flip is undone — but _meta was already stamped 29+ at database.ts:185, so the next boot
//     gates out at 'already-migrated' and the flip NEVER runs. The polarity stays wrong forever.
//     Silent corruption, in the other direction.
//
// Neither half is shippable alone. See src/core/db/migrationChain.ts.

import type Database from 'better-sqlite3'

// Schema version at/after which session_meta.sentiment already follows the
// flipped (5 = best) polarity. The migration runs only on DBs that predate it.
const SENTIMENT_POLARITY_TARGET_SCHEMA_VERSION = 29

// Settings latch — set only after a successful flip.
export const SENTIMENT_POLARITY_MIGRATION_LATCH_KEY =
  'sentiment_polarity_migration_done'

export interface SentimentPolarityMigrationResult {
  /** True only when the migration actually ran the flip. */
  ran: boolean
  reason?:
    | 'fresh-install'
    | 'already-migrated'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
    | 'flip-failed'
  /** Rows affected by the UPDATE (sentiment = 6 - sentiment). */
  rowsFlipped: number
}

export interface SentimentPolarityMigrationOptions {
  /** Invoked once, after guards pass and BEFORE the flip. Throwing aborts the
   *  migration without flipping (and without setting the latch) — same
   *  contract as the other migrations' backup closures. Omitted by unit tests. */
  backup?: () => void
}

export function migrateSentimentPolarity(
  conn: Database.Database,
  priorVersion: number,
  opts: SentimentPolarityMigrationOptions = {},
): SentimentPolarityMigrationResult {
  // Guard 1 — version gate. Fresh installs (priorVersion 0) write new-polarity
  // values from the start, so they must NOT be flipped.
  if (priorVersion === 0) {
    return { ran: false, reason: 'fresh-install', rowsFlipped: 0 }
  }
  if (priorVersion >= SENTIMENT_POLARITY_TARGET_SCHEMA_VERSION) {
    return { ran: false, reason: 'already-migrated', rowsFlipped: 0 }
  }

  // Guard 2 — settings latch.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SENTIMENT_POLARITY_MIGRATION_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', rowsFlipped: 0 }
    }
  } catch {
    return { ran: false, reason: 'inconsistent-state', rowsFlipped: 0 }
  }

  // Pre-migration backup. Throw = abort before the flip (latch stays unset).
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] sentiment-polarity migration: backup failed, aborting: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', rowsFlipped: 0 }
  }

  const started = Date.now()

  // The flip AND the latch, in ONE transaction. WHERE excludes NULL (unrated) rows.
  //
  // The latch is not a footnote here — it is the ONLY record that this flip ever happened.
  // The transform is its own inverse, so the data cannot tell you whether it has been applied:
  // a flipped 4 and an unflipped 2 are the same 2. If the flip could commit while the latch
  // silently did not, nothing on disk would know, and the next boot's decision to re-run would
  // be a coin toss on a value that corrupts when re-applied. Atomicity is not defensive
  // programming here; it is the only thing that makes the event observable at all.
  //
  // A throw rolls BOTH back, so the DB is exactly as it was, and the in-progress marker keeps
  // priorVersion at its pre-migration value — so the retry the message promises is real now.
  let rowsFlipped = 0
  try {
    const run = conn.transaction(() => {
      const info = conn
        .prepare('UPDATE session_meta SET sentiment = 6 - sentiment WHERE sentiment IS NOT NULL')
        .run()
      rowsFlipped = info.changes
      conn
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, 'true')
           ON CONFLICT(key) DO UPDATE SET value = 'true'`,
        )
        .run(SENTIMENT_POLARITY_MIGRATION_LATCH_KEY)
    })
    run()
  } catch (e) {
    console.error(
      `[FE db] sentiment-polarity migration: transaction failed and rolled back, ` +
        `sentiment UNCHANGED, will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'flip-failed', rowsFlipped: 0 }
  }

  console.info(
    `[FE db] sentiment-polarity migration: completed, ${rowsFlipped} ` +
      `session_meta row(s) flipped, duration=${Date.now() - started}ms`,
  )

  return { ran: true, rowsFlipped }
}
