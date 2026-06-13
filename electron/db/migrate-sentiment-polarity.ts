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
// Idempotency / safety: two guards plus an ordered latch write.
//   1. Version gate — runs only on a DB that predates schema 29 (priorVersion
//      0 = fresh install → skip; fresh DBs are written under the NEW labels,
//      so flipping them would corrupt).
//   2. Settings latch — checked up front; WRITTEN ONLY AFTER the flip returns
//      successfully, so a crash between UPDATE and latch retries next launch
//      (the version gate still guards against a double-flip across launches).

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

  // The flip. Single statement, full table. WHERE excludes NULL (unrated)
  // rows. Safe-on-failure: a throw here leaves the latch unset → the migration
  // retries next launch (with a fresh backup); a partially-applied UPDATE is
  // impossible (single SQL statement).
  let rowsFlipped = 0
  try {
    const info = conn
      .prepare('UPDATE session_meta SET sentiment = 6 - sentiment WHERE sentiment IS NOT NULL')
      .run()
    rowsFlipped = info.changes
  } catch (e) {
    console.error(
      `[FE db] sentiment-polarity migration: flip failed, latch NOT set, ` +
        `will retry next launch: ${e}`,
    )
    return { ran: false, reason: 'flip-failed', rowsFlipped: 0 }
  }

  // Latch only after a successful flip.
  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(SENTIMENT_POLARITY_MIGRATION_LATCH_KEY)
  } catch (e) {
    console.error(`[FE db] sentiment-polarity migration: latch write failed: ${e}`)
  }

  console.info(
    `[FE db] sentiment-polarity migration: completed, ${rowsFlipped} ` +
      `session_meta row(s) flipped, duration=${Date.now() - started}ms`,
  )

  return { ran: true, rowsFlipped }
}
