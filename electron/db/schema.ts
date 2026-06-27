// FugaEdge SQLite schema, version 2.
//
// v1 was built around DAS Trader's per-symbol daily summary CSV. v2 reads the
// per-execution Trades.csv and groups fills into round trips, so a symbol can
// have multiple `trades` rows per day. Dedup moved from (date, symbol) to a
// content hash over the round trip's TradeID:OrderID pairs.

// Bumped to 33 for v0.2.5 playbook confluence — a new `trade_playbooks`
// junction (the EXTRA confluence tags only; the primary grade-bearing setup
// stays on trades.playbook_id, never duplicated here), a new
// `playbooks.is_system` flag for app-owned protected rows, and a seeded
// protected "No Setup" playbook. All additive + idempotent: the table + column
// are declared in SCHEMA_SQL (fresh installs) and re-applied by
// migrate-confluence-junction.ts (the guarded ALTER for upgrades + the
// existence-checked seed), which runs UNCONDITIONALLY from migrateAfterSchema.
// The bump is release-tracking only — the migration is NOT version-gated.
//
// Bumped to 32 for v0.2.5 EdgeIQ Trader DNA — additive trades.rvol column
// (full-day relative volume = daily_volumes[date] / avg_volume, from cached
// market_data) + arms its fire-once CACHE re-derive. migrateAfterSchema adds
// the column AND sets `rvol_backfill_pending` on the upgrade (priorVersion < 32);
// runPendingRvolBackfill consumes + clears it at ready-to-show. ZERO API — a
// pure cache re-derive (the mae/mfe pattern, not daily-%'s network sweep), so
// column + arm ship in one bump.
//
// Bumped to 31 for v0.2.5 EdgeIQ Trader DNA — arms the daily_change_pct
// backfill EXACTLY ONCE. No schema/data change at 31: migrateAfterSchema sets
// the `daily_change_backfill_pending` settings flag on the upgrade (priorVersion
// < 31, skipping fresh installs), and runPendingDailyChangeBackfill consumes +
// clears it at ready-to-show (the migrate-reset-mae-mfe + runPendingMaeMfeBackfill
// pattern). The column itself landed at 30.
//
// Bumped to 30 for v0.2.5 EdgeIQ Trader DNA — additive trades.daily_change_pct
// column (the at-entry daily % change for the stock-selection pillar). Pure
// additive ALTER in migrateAfterSchema (no data transform); the column is NULL
// on every row until a later beat's rate-limited backfill fills it. The version
// bump pre-positions that backfill's arming trigger.
//
// Bumped to 29 for v0.2.5 sentiment-polarity flip — session_meta.sentiment was
// inverted (1 = best market / 3+ runners, 5 = worst / thin tape). The scale
// flips to the intuitive 5 = best / 1 = worst so it matches a standard 1–5
// mental model and the upgraded sentiment card's fire…ice icon ladder. One-shot
// `UPDATE session_meta SET sentiment = 6 - sentiment WHERE sentiment IS NOT NULL`
// in migrate-sentiment-polarity.ts; version-gated + settings-latched, with a
// throwing pre-migration backup. NOT idempotent (the transform is its own
// inverse — a double-apply flips back), so the version gate is load-bearing, not
// just defense-in-depth. First session_meta DATA transform (prior bumps were
// trades / market_data / intraday_bars additive ALTERs or derived-cache rebuilds).
//
// Bumped to 28 for v0.2.4 §K.1 — additive intraday_bars.warmup_error column
// (nullable TEXT; NULL = warmup succeeded or was legitimately empty, set = the
// fetch threw). Lets runWarmupBackfill's worklist predicate retry transient
// throws (rate-limit / network) while leaving out-of-coverage keys locked —
// Beat 2.7's smoke showed 11 of 15 "empty" warmups were actually throttled
// throws that warmup_attempted_at locked out of future launches. Purely
// additive, PRAGMA-gated ALTER via migrateAddWarmupError (mirror of
// migrateAddWarmupAttemptedAt).
//
// Bumped to 27 for v0.2.4 §K — additive intraday_bars.warmup_attempted_at
// column (nullable ISO-8601 timestamp; NULL = warmup never attempted, set =
// attempted regardless of success/empty/error). Lets runWarmupBackfill skip
// already-tried keys so holiday-window / out-of-coverage dates that return no
// warmup don't re-fetch every launch. Purely additive, no data move: added via
// the migrateAddWarmupAttemptedAt helper (mirror of migrateAddWarmupBars —
// PRAGMA-gated ALTER in its own type-only module). TEXT, not TIMESTAMP, to match
// the schema's ISO-timestamp columns (SQLite gives TIMESTAMP NUMERIC affinity,
// wrong for an ISO string).
//
// Bumped to 26 for v0.2.4 trade-technicals — new trade_technicals table
// (pre-computed per-trade indicator state at entry, 1M + 5M timeframes) plus
// the composite index idx_trade_technicals_stale on (schema_version,
// data_complete). The TABLE is created by CREATE TABLE IF NOT EXISTS in
// SCHEMA_SQL, so it lands on both fresh installs and upgrades with no
// per-version migration module (unlike an ALTER ADD COLUMN). The bump arms
// Session 3's one-time backfill sweep.
//
// Bumped to 24 for v0.2.3 scratch-fix — daily_summary cache backfill. The
// scratch definition changed from a ±$2 band / bare-sign to
// |net_pnl| <= SCRATCH_EPSILON (shared/trade-classification.ts). The stored
// daily_summary.winners/losers (written by recompute-summary.ts, read by the
// dashboard's per-day card) hold pre-fix counts, so migrate-scratch-reclassify.ts
// recomputes every live date once. Non-destructive (derived cache rebuilt from
// trades); version-gated + settings-latched, with a pre-migration backup. No
// schema-shape change — the bump drives the one-shot backfill + release tracking.
//
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
export const SCHEMA_VERSION = '35'

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
  commission      REAL,                                       -- Ocean One Comm: a display SLICE of total_fees (already folded in, NOT additive). NULL = not separately reported (renders em-dash, never a fabricated $0). Added via migrateAddCommission for upgraded DBs.
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
  warmup_bars TEXT,                         -- JSON prior-day warmup bars; NULL until backfilled (parseBars -> [])
  warmup_attempted_at TEXT,                 -- ISO ts of last warmup-fetch attempt (success/empty/error); NULL = never tried (§K runWarmupBackfill marker)
  warmup_error TEXT,                        -- error msg if the warmup fetch THREW (§K.1); NULL = succeeded or legit-empty (retry-eligible vs locked)
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now')),
  error       TEXT,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_intraday_bars_date ON intraday_bars(date);

-- 1M and 5M indicator state at trade entry, pre-computed and stored per
-- trade so the Technical Analysis tab and Edge Insights can filter/bucket
-- without recomputing EMAs over thousands of warmup bars on every query.
-- Populated by the lazy-guard hook (Commit 4) on chart open, and by
-- Session 3's one-time chunked backfill on first v0.2.4 launch.
-- Flat columns (not JSON blobs) so analytics WHERE / GROUP BY / range
-- filters stay direct SQL without json_extract().
CREATE TABLE IF NOT EXISTS trade_technicals (
  trade_id              INTEGER PRIMARY KEY,

  -- 1M timeframe snapshot at the bar containing the first entry fill
  tf_1m_macd_line       REAL,
  tf_1m_signal_line     REAL,
  tf_1m_histogram       REAL,
  tf_1m_histogram_prior REAL,
  tf_1m_macd_positive   INTEGER,  -- 0/1 nullable bool
  tf_1m_macd_open       INTEGER,  -- 0/1 nullable bool
  tf_1m_macd_rising     INTEGER,  -- 0/1 nullable bool
  tf_1m_vwap            REAL,
  tf_1m_vwap_dist_pct   REAL,
  tf_1m_ema9            REAL,
  tf_1m_ema9_dist_pct   REAL,
  tf_1m_ema20           REAL,
  tf_1m_ema20_dist_pct  REAL,
  tf_1m_ema9_above_ema20 INTEGER, -- 0/1 nullable bool

  -- 5M timeframe snapshot at the bar containing the first entry fill
  tf_5m_macd_line       REAL,
  tf_5m_signal_line     REAL,
  tf_5m_histogram       REAL,
  tf_5m_histogram_prior REAL,
  tf_5m_macd_positive   INTEGER,
  tf_5m_macd_open       INTEGER,
  tf_5m_macd_rising     INTEGER,
  tf_5m_vwap            REAL,
  tf_5m_vwap_dist_pct   REAL,
  tf_5m_ema9            REAL,
  tf_5m_ema9_dist_pct   REAL,
  tf_5m_ema20           REAL,
  tf_5m_ema20_dist_pct  REAL,
  tf_5m_ema9_above_ema20 INTEGER,

  -- Per-row metadata
  data_complete         INTEGER NOT NULL DEFAULT 0,  -- 0/1 bool
  computed_at           TEXT NOT NULL DEFAULT (datetime('now')),
  schema_version        INTEGER NOT NULL DEFAULT 1,

  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);

-- Composite index for Session 3's stale-row sweep:
--   SELECT trade_id FROM trade_technicals
--   WHERE data_complete = 0 OR schema_version < ?
-- The leading column (schema_version) supports the
-- "stale-version" query directly; data_complete as
-- secondary key keeps the "incomplete-but-current" subset
-- cheap to enumerate.
CREATE INDEX IF NOT EXISTS idx_trade_technicals_stale
  ON trade_technicals(schema_version, data_complete);

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
  -- v0.2.5: app-owned protected rows (the seeded "No Setup"). 0 = user
  -- playbook (editable / deletable), 1 = system (protected). Also added via the
  -- guarded ALTER in migrate-confluence-junction.ts for upgraded DBs.
  is_system        INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Default playbooks are seeded EXACTLY ONCE — on first launch, via
-- migrateAfterSchema(). Deleting one in the UI must stay deleted. The
-- defaults_seeded settings flag below is the latch.

-- v0.2.5 playbook confluence — the EXTRA confluence tags on a trade (the
-- secondary signals). The PRIMARY, grade-bearing setup stays on
-- trades.playbook_id and is NOT duplicated here. Composite PK keeps a
-- (trade, playbook) pair unique. FK + ON DELETE CASCADE on both columns lets
-- the DB itself clear a trade's confluence rows when the trade is deleted, and
-- a playbook's rows when the playbook is deleted — no orphans, no app-side
-- cleanup (the executions / trade_technicals / trade_notes convention, under
-- foreign_keys = ON). Declared here for fresh installs and re-applied
-- idempotently (IF NOT EXISTS) by migrate-confluence-junction.ts on upgrade.
CREATE TABLE IF NOT EXISTS trade_playbooks (
  trade_id    INTEGER NOT NULL REFERENCES trades(id)    ON DELETE CASCADE,
  playbook_id INTEGER NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (trade_id, playbook_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_playbooks_playbook ON trade_playbooks(playbook_id);

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
  day_tags          TEXT NOT NULL DEFAULT '[]',  -- JSON array of short labels (FOMC, Earnings, Choppy…)
  -- Voice Journal Phase 1 — per-field voice recording length in seconds
  -- (nullable; NULL = no recording). Also added via ALTER in migrateAfterSchema
  -- for existing DBs; declared here so a FRESH DB gets them at creation (the
  -- day_tags pattern — present in both CREATE and the additive ALTER).
  premarket_recording_duration   INTEGER,
  postsession_recording_duration INTEGER
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
-- sentiment rating (1..5; 5 = best/hottest market, 1 = worst — flipped to this
-- polarity at schema 29) for the session. Keyed by YYYY-MM-DD; a single
-- row per trading day. Created on first edit — no migration needed for
-- existing data. The notes column is reserved for future short notes
-- on the trading day at the session level (distinct from the longer-form
-- journal entry which has its own table).
CREATE TABLE IF NOT EXISTS session_meta (
  date              TEXT PRIMARY KEY,
  sentiment         INTEGER,                          -- 1..5 or NULL (5 = best, 1 = worst; schema 29 flip)
  notes             TEXT NOT NULL DEFAULT '',
  no_trade_day      INTEGER NOT NULL DEFAULT 0,       -- 1 = trader sat out
  no_trade_reason   TEXT NOT NULL DEFAULT '',         -- free-form reason
  day_mistakes_json TEXT NOT NULL DEFAULT '[]',       -- v0.2.2 Day 4: JSON array of day-level mistake tags (Day Detail Modal)
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── v0.2.5 Phase A — identity foundation (spec §B) ──────────────────────
-- Four tables land via CREATE TABLE IF NOT EXISTS per the trade_technicals
-- precedent: fresh installs and upgrades both get them with no migration
-- module and NO version bump (L1 — the 28→29 bump ships in Phase C with
-- the sentiment remap, where a bump is actually needed to arm it). All ids
-- are ULIDs minted by the repos (src/core/ids/ulid.ts); created_at /
-- updated_at are ISO-8601 UTC strings set at write time by the repos.

-- Single-row local user profile. member_since seeds from the earliest
-- non-deleted trade date when trades exist, else today (L2).
CREATE TABLE IF NOT EXISTS profile (
  id                   TEXT PRIMARY KEY,
  display_name         TEXT,
  handle               TEXT,
  avatar_data          TEXT,                          -- data-URL, ≤256px (D20)
  trading_style        TEXT,
  markets              TEXT,
  bio                  TEXT,
  featured_badges_json TEXT NOT NULL DEFAULT '[]',    -- ≤3 badge ids
  member_since         TEXT,
  created_at           TEXT,
  updated_at           TEXT
);

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('equity','process')),
  config_json  TEXT NOT NULL,                         -- equity: start_date/start_amount/target_amount; process: metric/target/window
  status       TEXT NOT NULL CHECK (status IN ('active','completed','abandoned')),
  created_at   TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS badge_awards (
  id         TEXT PRIMARY KEY,
  badge_id   TEXT NOT NULL,
  tier       TEXT CHECK (tier IN ('copper','silver','gold')), -- NULL = untiered (challenge badges)
  awarded_at TEXT NOT NULL,
  source_ref TEXT
);

-- Identity dedup for badge awards. NOT a table-level UNIQUE(badge_id, tier):
-- SQLite treats NULLs as DISTINCT in unique constraints, so two awards of the
-- same untiered (NULL-tier) badge — exactly what user challenge badges are —
-- would both insert. IFNULL collapses NULL to '' so the pair is genuinely
-- unique; awardBadge's INSERT OR IGNORE keys off this index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_awards_identity
  ON badge_awards(badge_id, IFNULL(tier, ''));

-- Append-only XP ledger (D12/D18: events are never revoked; total XP =
-- SUM(xp), level derived — no mutable current-XP row anywhere). The UNIQUE
-- idempotency_key is the entire dedup mechanism: the reconciliation sweep
-- and the inline hooks both INSERT OR IGNORE through it (D13 key formats).
CREATE TABLE IF NOT EXISTS xp_events (
  id              TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  source_ref      TEXT,
  xp              INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('max_daily_loss', '500');
-- account_size is intentionally NOT seeded (L24, Session 5): the settings
-- repo defaults it to 25,000 at READ time, so the row's absence is the only
-- honest "never configured" signal — shouldShowOnboarding's fresh-install
-- detector keys on raw row existence. Writers: onboarding completion and
-- the Settings page. (Pre-L24 installs already carry a seeded row; they
-- also carry trades, which suppresses onboarding regardless.)
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
