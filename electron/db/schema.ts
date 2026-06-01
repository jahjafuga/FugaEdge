// FugaEdge SQLite schema, version 2.
//
// v1 was built around DAS Trader's per-symbol daily summary CSV. v2 reads the
// per-execution Trades.csv and groups fills into round trips, so a symbol can
// have multiple `trades` rows per day. Dedup moved from (date, symbol) to a
// content hash over the round trip's TradeID:OrderID pairs.

// Bumped to 23 for v0.2.3 delete-trade — additive trades.deleted_at column
// (nullable ISO-8601 UTC timestamp; NULL = live, set = soft-deleted/in Trash)
// plus a partial index. Purely additive, no data move: added via the
// migrateAddDeletedAt helper (mirror of the industry/country PRAGMA-gated
// ALTER pattern, in its own type-only module so it's unit-testable). Reads
// filter `deleted_at IS NULL`; getTrade deliberately does NOT (it returns
// deleted rows so the Trash UI / detail modal can render them).
//
// Bumped to 22 for v0.2.3 Stage 2 — additive market_data.industry column
// (FMP /stable/profile industry, companion to sector). Purely
// additive: a NULL column added via the PRAGMA-gated ALTER in
// migrateAfterSchema (no data move, no module, no backup latch). The version
// bump is for release-tracking only.
//
// Bumped to 21 for v0.2.2 Commit A — float-rename migration: legacy
// `trades.float_shares` and `market_data.float` were shares-outstanding
// values mislabeled as "float". This bump preserves them under the new
// correctly-named `shares_outstanding` columns and NULLs the old columns
// so a subsequent FMP enrichment (Commit B) can repopulate with REAL
// free float. Data move + latch live in migrate-float-rename.ts; the
// shares_outstanding columns themselves are added as additive ALTERs in
// migrateAfterSchema.
//
// Prior bump (20, v0.2.1): trades.content_hash backfill — second dedup
// hash computed from intrinsic fill content. See migrate-content-hash.ts.
//
// Prior bump (19, Day 8.5 Commit B): timestamps flipped from bare-local
// Eastern to true UTC. See migrate-tz-utc.ts.
export const SCHEMA_VERSION = '23'

export const SCHEMA_SQL = /* sql */ `
PRAGMA foreign_keys = ON;

-- TIMEZONE FOOTGUN (Day 8.5 Commit B): open_time / close_time are true UTC
-- (ISO 8601 with a Z suffix). \`date\` is the Eastern TRADING DAY and
-- deliberately does NOT track the UTC calendar day — an after-hours fill
-- (20:00 ET) has an open_time on the next UTC day while \`date\` stays the
-- Eastern day. Bucket P&L / calendar / day-of-week by \`date\`; never derive
-- the trading day from open_time.slice(0,10).
CREATE TABLE IF NOT EXISTS trades (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  date            TEXT    NOT NULL,                           -- Eastern trading day YYYY-MM-DD (see footgun note above)
  symbol          TEXT    NOT NULL,
  side            TEXT    NOT NULL CHECK (side IN ('long','short')),
  open_time       TEXT    NOT NULL,                           -- ISO 8601 UTC, e.g. 2026-05-14T13:30:00Z
  close_time      TEXT,                                       -- ISO 8601 UTC; null if is_open = 1
  is_open         INTEGER NOT NULL DEFAULT 0,                 -- 1 if position never returned to 0
  shares_bought   INTEGER NOT NULL DEFAULT 0,
  avg_buy_price   REAL    NOT NULL DEFAULT 0,
  shares_sold     INTEGER NOT NULL DEFAULT 0,
  avg_sell_price  REAL    NOT NULL DEFAULT 0,
  pnl             REAL    NOT NULL DEFAULT 0,                 -- mirrors net_pnl for legacy callers
  gross_pnl       REAL    NOT NULL DEFAULT 0,                 -- sells_value - buys_value
  fee_ecn         REAL    NOT NULL DEFAULT 0,
  fee_sec         REAL    NOT NULL DEFAULT 0,
  fee_finra       REAL    NOT NULL DEFAULT 0,
  fee_htb         REAL    NOT NULL DEFAULT 0,
  fee_cat         REAL    NOT NULL DEFAULT 0,
  total_fees      REAL    NOT NULL DEFAULT 0,                 -- 0 until we estimate fees from execs
  net_pnl         REAL    NOT NULL DEFAULT 0,                 -- gross_pnl - total_fees
  executions_json TEXT    NOT NULL DEFAULT '[]',              -- raw fills, parent→children grouping
  exec_hash       TEXT    NOT NULL UNIQUE,                    -- SHA-1 of sorted TradeID:OrderID
  -- content_hash column is added in migrateAfterSchema (additive ALTER) so
  -- existing v0.1.6/v0.2.0 rows can be backfilled idempotently. The partial
  -- UNIQUE index "idx_trades_content_hash" (WHERE content_hash IS NOT NULL)
  -- is also created in migrateAfterSchema after the migration sweep so
  -- legacy NULL rows can coexist with the constraint.
  entry_timeframe TEXT,                                       -- user-input: '10s' | '1m' | '5m'
  entry_ema9_distance_pct REAL,                               -- backfilled from intraday_bars
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  -- v0.2.3 soft-delete. NULL = live; ISO-8601 UTC timestamp = in Trash
  -- (recoverable). Readers filter on deleted_at IS NULL; getTrade() does NOT
  -- (it returns deleted rows so the UI can render them differently). Also
  -- added via the migrateAddDeletedAt ALTER for upgraded DBs.
  deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_trades_date        ON trades(date);
CREATE INDEX IF NOT EXISTS idx_trades_symbol      ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_date_symbol ON trades(date, symbol);
CREATE INDEX IF NOT EXISTS idx_trades_open_time   ON trades(open_time);
CREATE INDEX IF NOT EXISTS idx_trades_net_pnl     ON trades(net_pnl);
-- idx_trades_playbook_id is created in migrateAfterSchema() after the
-- ALTER COLUMN that adds the column itself — fresh installs don't have
-- playbook_id at the time SCHEMA_SQL runs.

-- v0.2.0 universal-import: per-fill execution log. Dual-written alongside
-- trades.executions_json so readers can stay on the JSON column today while
-- the table accumulates the data we'll need for multi-broker analytics and
-- the eventual web port. round_trip_id FK is ON DELETE CASCADE so the
-- existing purgeOpen wipe-and-rewrite path continues to work on (symbol,
-- date) — cascade deletes the dangling fills.
--
-- Column conventions: timestamp_utc / quantity match the v0.2.0 universal-
-- model spec. side stays as 'B'/'S' (decision C — no renames in v0.2.0).
-- Fee components are sign-preserving — negative ECN values are rebates.
CREATE TABLE IF NOT EXISTS executions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  round_trip_id   INTEGER NOT NULL,
  trade_id        TEXT    NOT NULL,
  order_id        TEXT    NOT NULL,
  symbol          TEXT    NOT NULL,
  side            TEXT    NOT NULL CHECK (side IN ('B','S')),
  quantity        INTEGER NOT NULL,
  price           REAL    NOT NULL,
  timestamp_utc   TEXT    NOT NULL,                          -- ISO 8601 UTC, e.g. 2026-05-14T13:30:00Z
  source_broker   TEXT    NOT NULL,                          -- 'DAS' | 'Webull' | ...
  source_format   TEXT    NOT NULL,                          -- 'execution' | 'summary' | ...
  source_file     TEXT,
  route           TEXT,
  liquidity_type  TEXT,                                      -- 'ADDED' | 'REMOVED'
  account_name    TEXT,
  is_paper        INTEGER NOT NULL DEFAULT 0,
  commission      REAL,
  ecn_fee         REAL,
  sec_fee         REAL,
  finra_fee       REAL,
  cat_fee         REAL,
  htb_fee         REAL,
  other_fees      REAL,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (round_trip_id) REFERENCES trades(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_executions_round_trip  ON executions(round_trip_id);
CREATE INDEX IF NOT EXISTS idx_executions_symbol      ON executions(symbol);
CREATE INDEX IF NOT EXISTS idx_executions_timestamp   ON executions(timestamp_utc);

CREATE TABLE IF NOT EXISTS daily_summary (
  date          TEXT    PRIMARY KEY,
  total_pnl     REAL    NOT NULL DEFAULT 0,
  total_fees    REAL    NOT NULL DEFAULT 0,
  trade_count   INTEGER NOT NULL DEFAULT 0,
  winners       INTEGER NOT NULL DEFAULT 0,
  losers        INTEGER NOT NULL DEFAULT 0,
  gross_pnl     REAL    NOT NULL DEFAULT 0,
  largest_win   REAL    NOT NULL DEFAULT 0,
  largest_loss  REAL    NOT NULL DEFAULT 0
);

-- Raw per-(date, symbol) fee data imported from DAS Trader's daily summary
-- CSV. trades.fee_* and trades.net_pnl are recomputed pro-rata from this
-- table any time it (or trades for that date+symbol) changes.
CREATE TABLE IF NOT EXISTS day_fees (
  date        TEXT    NOT NULL,
  symbol      TEXT    NOT NULL,
  fee_ecn     REAL    NOT NULL DEFAULT 0,
  fee_sec     REAL    NOT NULL DEFAULT 0,
  fee_finra   REAL    NOT NULL DEFAULT 0,
  fee_htb     REAL    NOT NULL DEFAULT 0,
  fee_cat     REAL    NOT NULL DEFAULT 0,
  total_fees  REAL    NOT NULL DEFAULT 0,
  source      TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date, symbol)
);

CREATE INDEX IF NOT EXISTS idx_day_fees_date ON day_fees(date);

-- 1-minute intraday bars from Massive, keyed by (symbol, date). Cached
-- effectively forever — past intraday data is immutable, so a refresh is only
-- needed if the fetch failed (error column set).
CREATE TABLE IF NOT EXISTS intraday_bars (
  symbol      TEXT NOT NULL,
  date        TEXT NOT NULL,
  bars        TEXT NOT NULL DEFAULT '[]',   -- JSON [{t,o,h,l,c,v}, ...]
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
  error       TEXT,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_intraday_bars_date ON intraday_bars(date);

-- Per-trade image attachments (chart screenshots, scans, etc.). File bytes
-- live on disk under userData/attachments/<trade_id>/; this table only
-- stores the metadata and the on-disk filename.
CREATE TABLE IF NOT EXISTS trade_attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id      INTEGER NOT NULL,
  filename      TEXT    NOT NULL UNIQUE,   -- uuid + extension; safe for URLs
  original_name TEXT    NOT NULL,
  mime_type     TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trade_attachments_trade ON trade_attachments(trade_id);

-- Momentum playbooks. The user defines their setup library here; each trade
-- can optionally be tagged with a playbook so we can roll up performance by
-- setup. Soft delete via the archived flag so historical trades keep their tag.
CREATE TABLE IF NOT EXISTS playbooks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL UNIQUE,
  description      TEXT    NOT NULL DEFAULT '',
  rules            TEXT    NOT NULL DEFAULT '',
  ideal_conditions TEXT    NOT NULL DEFAULT '',
  archived         INTEGER NOT NULL DEFAULT 0,
  -- v0.1.5: classify each setup by quality tier so the user can see
  -- whether A+ discipline actually pays. 'A+' | 'A' | 'B' | 'C'. Defaults
  -- to 'B' (the average tier) so existing playbooks neither over- nor
  -- under-claim quality until the user grades them.
  tier             TEXT    NOT NULL DEFAULT 'B',
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Default playbooks are seeded EXACTLY ONCE — on first launch, via
-- migrateAfterSchema(). Deleting one in the UI must stay deleted. The
-- defaults_seeded settings flag below is the latch.

-- Market metadata, keyed by symbol. As of schema 21 the columns carry their
-- semantically-correct values: \`float\` is real tradable free float (from
-- FMP /stable/shares-float, populated by Commit B's enrichment) and
-- \`shares_outstanding\` is issued share count (preserved from the legacy
-- float-mislabel + also populated by FMP). Until Commit B ships the
-- enrichment wire-up, \`float\` will be NULL on rows the schema-21 migration
-- cleared; the UI shows "Float unavailable" in that state.
-- daily_volumes is a JSON map of YYYY-MM-DD → volume so we can compute RVOL
-- for individual trade dates without an extra round trip.
CREATE TABLE IF NOT EXISTS market_data (
  symbol             TEXT    PRIMARY KEY,
  float              REAL,
  shares_outstanding REAL,
  market_cap         REAL,
  sector             TEXT,
  -- v0.2.3 Stage 2 — FMP /stable/profile industry (e.g.
  -- "Biotechnology"), the finer-grained companion to sector
  -- ("Healthcare"). NOT Polygon SIC text. Additive in schema 22.
  industry           TEXT,
  avg_volume         REAL,
  daily_volumes      TEXT    NOT NULL DEFAULT '{}',
  country            TEXT,
  country_name       TEXT,
  region             TEXT,
  fetched_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  error              TEXT
);

CREATE TABLE IF NOT EXISTS trade_notes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id        INTEGER NOT NULL,
  note_text       TEXT    NOT NULL DEFAULT '',
  emotion_rating  INTEGER,
  tags            TEXT    NOT NULL DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trade_notes_trade ON trade_notes(trade_id);

CREATE TABLE IF NOT EXISTS journal (
  date              TEXT PRIMARY KEY,
  premarket_notes   TEXT NOT NULL DEFAULT '',
  postsession_notes TEXT NOT NULL DEFAULT '',
  emotion_rating    INTEGER,
  rules_followed    TEXT NOT NULL DEFAULT '',
  rule_violations   TEXT NOT NULL DEFAULT '',
  day_tags          TEXT NOT NULL DEFAULT '[]'   -- JSON array of short labels (FOMC, Earnings, Choppy…)
);

CREATE INDEX IF NOT EXISTS idx_journal_date ON journal(date);

-- The legacy 'insights' table (auto-detected detector rows, dismiss / act-on
-- state) has been retired in favor of the renderer-side pure rule engine in
-- /src/core/insights. The table is no longer created on fresh installs; on
-- upgraded DBs it remains as orphaned data (no code reads or writes it).

-- Week-level reflections shown in the calendar's weekly review modal.
-- Keyed by Sunday-start date (YYYY-MM-DD). Lives alongside daily journal
-- rows but is intentionally a different table — weekly review is a roll-up
-- artifact, not a per-day session log.
CREATE TABLE IF NOT EXISTS week_notes (
  week_start TEXT PRIMARY KEY,
  text       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-day market session metadata. Currently holds the trader's market
-- sentiment rating (1..5) for the session. Keyed by YYYY-MM-DD; a single
-- row per trading day. Created on first edit — no migration needed for
-- existing data. The notes column is reserved for future short notes
-- on the trading day at the session level (distinct from the longer-form
-- journal entry which has its own table).
CREATE TABLE IF NOT EXISTS session_meta (
  date              TEXT PRIMARY KEY,
  sentiment         INTEGER,                          -- 1..5 or NULL
  notes             TEXT NOT NULL DEFAULT '',
  no_trade_day      INTEGER NOT NULL DEFAULT 0,       -- 1 = trader sat out
  no_trade_reason   TEXT NOT NULL DEFAULT '',         -- free-form reason
  day_mistakes_json TEXT NOT NULL DEFAULT '[]',       -- v0.2.2 Day 4: JSON array of day-level mistake tags (Day Detail Modal)
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('max_daily_loss', '500');
INSERT OR IGNORE INTO settings (key, value) VALUES ('account_size',   '25000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme',          'dark');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'journal_rules',
  '["Followed pre-market plan","Sized correctly per setup","Honored stop loss","Avoided FOMO entries","No revenge trading","Took breaks after losing trades","Stopped at max daily loss"]'
);
-- API key is intentionally empty on fresh install. Users paste their own
-- in Settings → Market Data; the value lives in the user's local DB only,
-- never in source.
INSERT OR IGNORE INTO settings (key, value) VALUES ('polygon_api_key', '');
-- FMP (Financial Modeling Prep) API key — paired with polygon_api_key for
-- v0.2.2+ enrichment: FMP supplies real tradable float, Polygon supplies
-- market_cap + sector + country (free riders). Same convention — empty on
-- fresh install, user pastes in Settings → Market data → FMP API key card.
INSERT OR IGNORE INTO settings (key, value) VALUES ('fmp_api_key', '');
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'mistake_list',
  '["Chased extended entry","FOMO entry","Revenge trade","Sized too big","Took profit too early","Cut winner too early","Held loser too long","Ignored stop loss","Traded outside playbook","Forced trade on choppy day"]'
);
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'day_tag_list',
  '["FOMC","CPI","Earnings","News","Halt","Choppy","Trending","Holiday"]'
);
-- Latch — set to 'true' once the first-run seed runs (or once the migration
-- detects an existing populated playbook table). Never re-seeds afterwards.
INSERT OR IGNORE INTO settings (key, value) VALUES ('defaults_seeded', 'false');

CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', '${SCHEMA_VERSION}');
`
