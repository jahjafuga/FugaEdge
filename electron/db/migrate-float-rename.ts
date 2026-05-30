// v0.2.2 Commit A — one-shot rename migration: shares-outstanding values
// currently mislabeled as "float" get preserved under the correctly-named
// `shares_outstanding` column on both `trades` and `market_data`, and the
// float-named columns are NULLed so a subsequent FMP enrichment (Commit B)
// can repopulate them with REAL free float.
//
// Convention split — the migration owns DATA, not SCHEMA:
//   The shares_outstanding columns themselves are added by migrateAfterSchema
//   as standard idempotent ALTERs (mirror of trades.float_shares, etc.). This
//   module assumes those columns exist by the time it runs. Keeps the SCHEMA
//   surface in one place (migrateAfterSchema), DATA migrations in their own
//   files — same separation as migrate-content-hash and migrate-tz-utc.
//
// Why this is safe to mutate existing data:
//   - The legacy `trades.float_shares` + `market_data.float` values are
//     shares-outstanding from Polygon's /v3/reference/tickers — a useful
//     number, just under the wrong label. Copying it under the correct
//     name preserves it; NULLing the old column doesn't lose it.
//   - The user is asked to back up via Settings → Back up database before
//     running this version. The pre-migration backup closure mirrors
//     content-hash / tz-utc as the code-level safety net.
//
// Idempotency: three guards, strongest first.
//   1. Settings latch — once 'float_rename_migration_done' = 'true', no-op.
//      This is the PRIMARY truth, set inside the data-move transaction so
//      it can never end up out of sync with the data.
//   2. Version gate — priorVersion === 0 (fresh install: SCHEMA_SQL + the
//      additive ALTER created the new columns, no legacy data to move) and
//      priorVersion >= 21 (already migrated on a prior launch). Both set
//      the latch defensively before returning, so a subsequent corrupted
//      priorVersion read can't re-trigger the migration.
//   3. Per-row gate via the WHERE clause on the COPY UPDATE — re-running
//      after a partial completion would copy nothing (target columns are
//      already populated from the first run; UPDATE ... WHERE old IS NOT
//      NULL is a no-op once we've NULLed the source). Belt-and-braces.

import type Database from 'better-sqlite3'

const FLOAT_RENAME_TARGET_SCHEMA_VERSION = 21

// Settings latch key — written inside the data-move transaction so it never
// ends up set without the corresponding data move having completed.
export const FLOAT_RENAME_LATCH_KEY = 'float_rename_migration_done'

export interface FloatRenameMigrationResult {
  /** True only when this run actually mutated data. */
  ran: boolean
  reason?:
    | 'already-migrated'
    | 'fresh-install'
    | 'latched'
    | 'inconsistent-state'
    | 'backup-failed'
  /** Rows in trades whose float_shares was non-null and got copied. */
  tradesRowsCopied: number
  /** Rows in market_data whose float was non-null and got copied. */
  marketDataRowsCopied: number
}

const EMPTY = { tradesRowsCopied: 0, marketDataRowsCopied: 0 }

export interface FloatRenameMigrationOptions {
  /** Invoked once, after guards pass and BEFORE any data is mutated. Throws
   *  abort the migration without writing — same contract as tz-utc and
   *  content-hash. Omitted by unit tests. */
  backup?: () => void
}

function setLatch(conn: Database.Database): void {
  // Used both by the success path (inside the transaction) and by the
  // guard paths (defensive set when priorVersion already says we're past
  // the target). Best-effort outside the transaction — a latch failure
  // there isn't fatal because the version gate will still hold.
  conn
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, 'true')
       ON CONFLICT(key) DO UPDATE SET value = 'true'`,
    )
    .run(FLOAT_RENAME_LATCH_KEY)
}

export function migrateFloatRename(
  conn: Database.Database,
  priorVersion: number,
  opts: FloatRenameMigrationOptions = {},
): FloatRenameMigrationResult {
  // ── Guard 1 (PRIMARY) — settings latch ────────────────────────────────
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(FLOAT_RENAME_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') {
      return { ran: false, reason: 'latched', ...EMPTY }
    }
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent.
    return { ran: false, reason: 'inconsistent-state', ...EMPTY }
  }

  // ── Guard 2 — fresh install ───────────────────────────────────────────
  // SCHEMA_SQL + the additive ALTER created the new columns; there's no
  // legacy data to move. Set the latch defensively so a future corrupted
  // priorVersion read can't re-trigger.
  if (priorVersion === 0) {
    try {
      setLatch(conn)
    } catch {
      /* latch write best-effort on fresh install */
    }
    return { ran: false, reason: 'fresh-install', ...EMPTY }
  }

  // ── Guard 3 — already past target version ─────────────────────────────
  if (priorVersion >= FLOAT_RENAME_TARGET_SCHEMA_VERSION) {
    try {
      setLatch(conn)
    } catch {
      /* defensive — version gate already holds */
    }
    return { ran: false, reason: 'already-migrated', ...EMPTY }
  }

  // ── Pre-migration backup ──────────────────────────────────────────────
  // Throw = abort without mutating data. Same contract as tz-utc.
  try {
    opts.backup?.()
  } catch (e) {
    console.error(
      `[FE db] float-rename migration: backup failed, aborting migration: ${e}`,
    )
    return { ran: false, reason: 'backup-failed', ...EMPTY }
  }

  const started = Date.now()

  // ── Copy + NULL + latch (single transaction) ──────────────────────────
  // Order matters: COPY before NULL. Reversed would erase the legacy data
  // before it's preserved. The latch write lives INSIDE the transaction so
  // a crash mid-move can't leave us latched-without-data or
  // data-without-latch — both writes commit or both roll back.
  let tradesRowsCopied = 0
  let marketDataRowsCopied = 0
  const run = conn.transaction(() => {
    const t = conn
      .prepare(
        'UPDATE trades SET shares_outstanding = float_shares WHERE float_shares IS NOT NULL',
      )
      .run() as { changes: number }
    tradesRowsCopied = t.changes

    const m = conn
      .prepare(
        'UPDATE market_data SET shares_outstanding = float WHERE float IS NOT NULL',
      )
      .run() as { changes: number }
    marketDataRowsCopied = m.changes

    conn.exec('UPDATE trades SET float_shares = NULL')
    conn.exec('UPDATE market_data SET float = NULL')

    setLatch(conn)
  })

  try {
    run()
  } catch (e) {
    console.error(
      `[FE db] float-rename migration: transaction failed and rolled back, ` +
        `data left untouched: ${e}`,
    )
    // Re-throw — a partial migration leaves us in a state we can't recover
    // from automatically. Boot fails loud; the user restores from backup.
    throw e
  }

  console.info(
    `[FE db] float-rename migration: tradesRowsCopied=${tradesRowsCopied}, ` +
      `marketDataRowsCopied=${marketDataRowsCopied}, ` +
      `duration=${Date.now() - started}ms`,
  )

  return { ran: true, tradesRowsCopied, marketDataRowsCopied }
}
