// Multi-account Beat 2 (Option A ratified) — rebuild the trades table to
// retire the inline exec_hash UNIQUE constraint. That constraint lives as
// sqlite_autoindex_trades_1, which SQLite cannot DROP, so per-account dedup
// (equal hash + different account -> both insertable) requires the documented
// table-rebuild procedure. The new shape:
//   - exec_hash TEXT NOT NULL            (inline UNIQUE removed)
//   - account_id TEXT NOT NULL REFERENCES accounts(id)
//   - UNIQUE (account_id, exec_hash)     via idx_trades_exec_hash_account
//   - UNIQUE (account_id, content_hash) WHERE content_hash IS NOT NULL
//     via idx_trades_content_hash_account (supersedes the single-column
//     idx_trades_content_hash, which must NOT return)
// Hash COMPUTATION is untouched (scoping, not re-hashing).
//
// Order rules (the STEP 0 correction): PRAGMA foreign_keys is a NO-OP inside
// an open transaction, so OFF/ON bracket the transaction from OUTSIDE; the
// copy + drop + rename + index replay ride ONE transaction; PRAGMA
// foreign_key_check runs INSIDE it before COMMIT and any violation throws —
// rolling everything back so boot survives on the old table. trades.id values
// are preserved by the explicit-column INSERT…SELECT, which is what keeps the
// five inbound CASCADE FKs (trade_notes, executions, trade_technicals,
// trade_playbooks, trade_mistake) valid; foreign_key_check is the proof.
//
// Idempotency: the composite index name is the gate. Fresh installs get the
// new-shape trades from SCHEMA_SQL and land in the fast path (composites
// created, zero copying). Type-only better-sqlite3 import (migrate-*.ts
// convention) so the contract is unit-testable under vitest.

import type Database from 'better-sqlite3'

export interface TradesRebuildResult {
  status: 'noop-already-composite' | 'fastpath-fresh-shape' | 'rebuilt' | 'aborted'
  rowsMoved: number
  indexesRecreated: number
  reason?: string
}

// The 51-column live shape: the 50 columns quoted from sqlite_master pre-flight
// plus account_id (appended by Beat 1's additive ALTER, which runs before this
// migration). Explicit everywhere — never SELECT *.
const COLUMNS = [
  'id',
  'date',
  'symbol',
  'side',
  'open_time',
  'close_time',
  'is_open',
  'shares_bought',
  'avg_buy_price',
  'shares_sold',
  'avg_sell_price',
  'pnl',
  'gross_pnl',
  'fee_ecn',
  'fee_sec',
  'fee_finra',
  'fee_htb',
  'fee_cat',
  'total_fees',
  'net_pnl',
  'executions_json',
  'exec_hash',
  'created_at',
  'entry_timeframe',
  'entry_ema9_distance_pct',
  'playbook_id',
  'confidence',
  'mistakes_json',
  'planned_risk',
  'float_shares',
  'catalyst_type',
  'days_since_catalyst',
  'mae',
  'mfe',
  'planned_stop_loss_price',
  'country',
  'country_name',
  'region',
  'country_source',
  'source_broker',
  'source_format',
  'source_file',
  'account_name',
  'fees_reported',
  'content_hash',
  'shares_outstanding',
  'deleted_at',
  'daily_change_pct',
  'rvol',
  'commission',
  'account_id',
] as const

// Rebuilt from the LIVE sqlite_master CREATE TABLE (pre-flight quote), not
// from schema.ts memory: same columns, same constraints and defaults, with
// exactly two changes — exec_hash loses its inline UNIQUE, and account_id
// becomes NOT NULL with the real FK.
const CREATE_TRADES_NEW = `
CREATE TABLE trades_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT    NOT NULL,
  symbol          TEXT    NOT NULL,
  side            TEXT    NOT NULL CHECK (side IN ('long','short')),
  open_time       TEXT    NOT NULL,
  close_time      TEXT,
  is_open         INTEGER NOT NULL DEFAULT 0,
  shares_bought   INTEGER NOT NULL DEFAULT 0,
  avg_buy_price   REAL    NOT NULL DEFAULT 0,
  shares_sold     INTEGER NOT NULL DEFAULT 0,
  avg_sell_price  REAL    NOT NULL DEFAULT 0,
  pnl             REAL    NOT NULL DEFAULT 0,
  gross_pnl       REAL    NOT NULL DEFAULT 0,
  fee_ecn         REAL    NOT NULL DEFAULT 0,
  fee_sec         REAL    NOT NULL DEFAULT 0,
  fee_finra       REAL    NOT NULL DEFAULT 0,
  fee_htb         REAL    NOT NULL DEFAULT 0,
  fee_cat         REAL    NOT NULL DEFAULT 0,
  total_fees      REAL    NOT NULL DEFAULT 0,
  net_pnl         REAL    NOT NULL DEFAULT 0,
  executions_json TEXT    NOT NULL DEFAULT '[]',
  exec_hash       TEXT    NOT NULL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  entry_timeframe TEXT,
  entry_ema9_distance_pct REAL,
  playbook_id INTEGER,
  confidence INTEGER,
  mistakes_json TEXT NOT NULL DEFAULT '[]',
  planned_risk REAL,
  float_shares INTEGER,
  catalyst_type TEXT,
  days_since_catalyst INTEGER,
  mae REAL,
  mfe REAL,
  planned_stop_loss_price REAL,
  country TEXT,
  country_name TEXT,
  region TEXT,
  country_source TEXT,
  source_broker TEXT NOT NULL DEFAULT 'DAS',
  source_format TEXT NOT NULL DEFAULT 'execution',
  source_file TEXT,
  account_name TEXT,
  fees_reported INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT,
  shares_outstanding INTEGER,
  deleted_at TEXT,
  daily_change_pct REAL,
  rvol REAL,
  commission REAL,
  account_id TEXT NOT NULL REFERENCES accounts(id)
)`

const COMPOSITE_EXEC =
  'CREATE UNIQUE INDEX idx_trades_exec_hash_account ON trades(account_id, exec_hash)'
const COMPOSITE_CONTENT =
  'CREATE UNIQUE INDEX idx_trades_content_hash_account ON trades(account_id, content_hash) WHERE content_hash IS NOT NULL'

export function migrateTradesRebuildDedup(
  conn: Database.Database,
  opts: { backup: () => void },
): TradesRebuildResult {
  // Gate — composite present means the rebuild (or the fresh fast path)
  // already happened. Cheap, runs every boot.
  const gate = conn
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_trades_exec_hash_account'",
    )
    .get()
  if (gate) return { status: 'noop-already-composite', rowsMoved: 0, indexesRecreated: 0 }

  const ddlRow = conn
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trades'")
    .get() as { sql: string } | undefined
  const liveDdl = ddlRow?.sql ?? ''

  // Fresh new-shape table (SCHEMA_SQL already dropped the inline UNIQUE and
  // carries account_id NOT NULL): no copy needed — just swap the index set.
  // The composites deliberately do NOT live in SCHEMA_SQL: on a legacy
  // upgrade boot SCHEMA_SQL runs BEFORE the account_id ALTER, and CREATE
  // INDEX on a missing column would brick the boot.
  if (!/exec_hash\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(liveDdl)) {
    conn.exec('DROP INDEX IF EXISTS idx_trades_content_hash')
    conn.exec(COMPOSITE_EXEC)
    conn.exec(COMPOSITE_CONTENT)
    console.info(
      '[FE migrate] trades-rebuild: fresh new-shape table — composite dedup indexes created (no copy)',
    )
    return { status: 'fastpath-fresh-shape', rowsMoved: 0, indexesRecreated: 2 }
  }

  // Precondition — Beat 1's backfill guarantees this; if it somehow didn't,
  // NOT NULL would reject the copy. Abort (log) rather than fail the boot;
  // the gate re-fires next launch once repaired.
  const nulls =
    (
      conn
        .prepare('SELECT COUNT(*) AS n FROM trades WHERE account_id IS NULL')
        .get() as { n: number } | undefined
    )?.n ?? 0
  if (nulls > 0) {
    const reason = `${nulls} trade(s) still carry a NULL account_id — rebuild skipped`
    console.error(`[FE migrate] trades-rebuild: ${reason}`)
    return { status: 'aborted', rowsMoved: 0, indexesRecreated: 0, reason }
  }

  let rowsMoved = 0
  let indexesRecreated = 0
  try {
    // Backup BEFORE any structural change (the sentiment-polarity precedent:
    // a copy failure throws and aborts the rebuild — never rebuild without a
    // safety net).
    opts.backup()

    // PRAGMA foreign_keys is a NO-OP inside an open transaction — bracket
    // from OUTSIDE. The DROP TABLE below is only legal against the five
    // inbound CASCADE FKs while enforcement is off; ids are preserved so the
    // check below proves integrity before anything commits.
    conn.pragma('foreign_keys = OFF')
    try {
      const tx = conn.transaction(() => {
        // Capture the prior named-index set FROM sqlite_master (parity is
        // required against reality, not against schema.ts memory).
        const priorIndexes = conn
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'trades' AND sql IS NOT NULL",
          )
          .all() as { name: string; sql: string }[]

        conn.exec(CREATE_TRADES_NEW)

        const cols = COLUMNS.join(', ')
        rowsMoved = conn
          .prepare(`INSERT INTO trades_new (${cols}) SELECT ${cols} FROM trades`)
          .run().changes

        conn.exec('DROP TABLE trades')
        conn.exec('ALTER TABLE trades_new RENAME TO trades')

        // Replay every prior named index EXCEPT the superseded single-column
        // content_hash partial (it must NOT return), then the two composites.
        for (const ix of priorIndexes) {
          if (ix.name === 'idx_trades_content_hash') continue
          conn.exec(ix.sql)
          indexesRecreated++
        }
        conn.exec(COMPOSITE_EXEC)
        conn.exec(COMPOSITE_CONTENT)
        indexesRecreated += 2

        // Integrity proof BEFORE COMMIT — a throw here rolls the whole
        // rebuild back and boot continues on the old table.
        const violations = conn.pragma('foreign_key_check') as unknown[]
        if (violations.length > 0) {
          throw new Error(
            `foreign_key_check reported ${violations.length} violation(s) after the rebuild`,
          )
        }
      })
      tx()
    } finally {
      conn.pragma('foreign_keys = ON')
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    console.error(`[FE migrate] trades-rebuild ABORTED (rolled back): ${reason}`)
    return { status: 'aborted', rowsMoved: 0, indexesRecreated: 0, reason }
  }

  console.info(
    `[FE migrate] trades-rebuild: moved ${rowsMoved} trade(s), recreated ${indexesRecreated} index(es) ` +
      '(composite per-account dedup active; inline exec_hash UNIQUE retired; foreign_key_check clean)',
  )
  return { status: 'rebuilt', rowsMoved, indexesRecreated }
}
