// v0.2.4 — trade_technicals repository.
//
// Pre-computed per-trade indicator state at entry (1M + 5M timeframes).
// Populated by the lazy-guard hook (Commit 4) and Session 3's bulk backfill.
// Read by the Technical Analysis tab (Sessions 4-7) for filtering and
// bucketing.
//
// Mirrors electron/market/repo.ts's intraday cache pattern: parsed/raw row
// split, parseBool guard for nullable boolean columns, getX/upsertX with
// ON CONFLICT(trade_id) DO UPDATE, @-named binds, openDatabase() singleton.
// Single PK (trade_id), not composite — each trade has exactly one technicals
// row. trade_id is INTEGER (matches trades.id and the executions.round_trip_id
// / trade_notes.trade_id sibling-FK precedent), so it round-trips as a JS
// number end to end.

import { openDatabase } from '../db/database'
import type {
  TechnicalSnapshot,
  TradeTechnicals,
} from '@/core/technicals/computeTradeTechnicals'

/**
 * Parsed trade_technicals row as exposed to callers.
 * Includes trade_id (added by the repo) and structurally
 * compatible with the pure compute's TradeTechnicals
 * output via the tf_1m / tf_5m / data_complete / etc fields.
 */
export interface TradeTechnicalsRow {
  trade_id: number
  tf_1m: TechnicalSnapshot
  tf_5m: TechnicalSnapshot
  data_complete: boolean
  computed_at: string
  schema_version: number
}

/**
 * Raw DB row shape — flat columns, INTEGER-encoded booleans
 * (0/1 nullable). Internal to this module; callers see
 * the parsed TradeTechnicalsRow. Exported only so the repo's
 * unit tests can type their synthetic fixtures.
 */
export interface TradeTechnicalsDbRow {
  trade_id: number

  tf_1m_macd_line: number | null
  tf_1m_signal_line: number | null
  tf_1m_histogram: number | null
  tf_1m_histogram_prior: number | null
  tf_1m_macd_positive: number | null     // 0/1 nullable
  tf_1m_macd_open: number | null
  tf_1m_macd_rising: number | null
  tf_1m_vwap: number | null
  tf_1m_vwap_dist_pct: number | null
  tf_1m_ema9: number | null
  tf_1m_ema9_dist_pct: number | null
  tf_1m_ema20: number | null
  tf_1m_ema20_dist_pct: number | null
  tf_1m_ema9_above_ema20: number | null

  tf_5m_macd_line: number | null
  tf_5m_signal_line: number | null
  tf_5m_histogram: number | null
  tf_5m_histogram_prior: number | null
  tf_5m_macd_positive: number | null
  tf_5m_macd_open: number | null
  tf_5m_macd_rising: number | null
  tf_5m_vwap: number | null
  tf_5m_vwap_dist_pct: number | null
  tf_5m_ema9: number | null
  tf_5m_ema9_dist_pct: number | null
  tf_5m_ema20: number | null
  tf_5m_ema20_dist_pct: number | null
  tf_5m_ema9_above_ema20: number | null

  data_complete: number
  computed_at: string
  schema_version: number
}

/**
 * Parse a nullable INTEGER-encoded boolean column.
 * SQLite stores boolean columns as INTEGER (0/1 or NULL).
 * Returns null when the column is null, true for non-zero,
 * false for zero. Mirrors the parseBars guard idiom from
 * electron/market/repo.ts — robust against unexpected
 * non-numeric values (defensive).
 */
export function parseBool(raw: number | null | undefined): boolean | null {
  if (raw === null || raw === undefined) return null
  return raw !== 0
}

/**
 * Encode a boolean for INSERT — null stays null, otherwise
 * 0 or 1.
 */
export function encodeBool(b: boolean | null | undefined): number | null {
  if (b === null || b === undefined) return null
  return b ? 1 : 0
}

/**
 * Map a raw DB row to a parsed TradeTechnicalsRow with
 * nested TechnicalSnapshot objects. INTEGER booleans
 * decoded to booleans.
 */
export function mapDbRowToParsed(row: TradeTechnicalsDbRow): TradeTechnicalsRow {
  return {
    trade_id: row.trade_id,
    tf_1m: {
      macd_line: row.tf_1m_macd_line,
      signal_line: row.tf_1m_signal_line,
      histogram: row.tf_1m_histogram,
      histogram_prior: row.tf_1m_histogram_prior,
      macd_positive: parseBool(row.tf_1m_macd_positive),
      macd_open: parseBool(row.tf_1m_macd_open),
      macd_rising: parseBool(row.tf_1m_macd_rising),
      vwap: row.tf_1m_vwap,
      vwap_dist_pct: row.tf_1m_vwap_dist_pct,
      ema9: row.tf_1m_ema9,
      ema9_dist_pct: row.tf_1m_ema9_dist_pct,
      ema20: row.tf_1m_ema20,
      ema20_dist_pct: row.tf_1m_ema20_dist_pct,
      ema9_above_ema20: parseBool(row.tf_1m_ema9_above_ema20),
    },
    tf_5m: {
      macd_line: row.tf_5m_macd_line,
      signal_line: row.tf_5m_signal_line,
      histogram: row.tf_5m_histogram,
      histogram_prior: row.tf_5m_histogram_prior,
      macd_positive: parseBool(row.tf_5m_macd_positive),
      macd_open: parseBool(row.tf_5m_macd_open),
      macd_rising: parseBool(row.tf_5m_macd_rising),
      vwap: row.tf_5m_vwap,
      vwap_dist_pct: row.tf_5m_vwap_dist_pct,
      ema9: row.tf_5m_ema9,
      ema9_dist_pct: row.tf_5m_ema9_dist_pct,
      ema20: row.tf_5m_ema20,
      ema20_dist_pct: row.tf_5m_ema20_dist_pct,
      ema9_above_ema20: parseBool(row.tf_5m_ema9_above_ema20),
    },
    data_complete: row.data_complete !== 0,
    computed_at: row.computed_at,
    schema_version: row.schema_version,
  }
}

/**
 * Get the trade_technicals row for a single trade, or null
 * if no row exists. Mirrors getIntradayRow in
 * electron/market/repo.ts.
 */
export function getTradeTechnicals(tradeId: number): TradeTechnicalsRow | null {
  const db = openDatabase()
  const row = db
    .prepare(`
      SELECT
        trade_id,
        tf_1m_macd_line, tf_1m_signal_line, tf_1m_histogram, tf_1m_histogram_prior,
        tf_1m_macd_positive, tf_1m_macd_open, tf_1m_macd_rising,
        tf_1m_vwap, tf_1m_vwap_dist_pct,
        tf_1m_ema9, tf_1m_ema9_dist_pct, tf_1m_ema20, tf_1m_ema20_dist_pct,
        tf_1m_ema9_above_ema20,
        tf_5m_macd_line, tf_5m_signal_line, tf_5m_histogram, tf_5m_histogram_prior,
        tf_5m_macd_positive, tf_5m_macd_open, tf_5m_macd_rising,
        tf_5m_vwap, tf_5m_vwap_dist_pct,
        tf_5m_ema9, tf_5m_ema9_dist_pct, tf_5m_ema20, tf_5m_ema20_dist_pct,
        tf_5m_ema9_above_ema20,
        data_complete, computed_at, schema_version
      FROM trade_technicals
      WHERE trade_id = ?
    `)
    .get(tradeId) as TradeTechnicalsDbRow | undefined
  if (!row) return null
  return mapDbRowToParsed(row)
}

/**
 * Upsert a trade_technicals row. Mirrors upsertIntradayRow
 * in electron/market/repo.ts — INSERT ... ON CONFLICT
 * DO UPDATE SET col = excluded.col for every column,
 * @-named binds throughout.
 *
 * The TradeTechnicals input is the pure compute's output;
 * trade_id is passed separately because the pure module
 * doesn't know about IDs.
 */
export function upsertTradeTechnicals(
  tradeId: number,
  technicals: TradeTechnicals,
): void {
  const db = openDatabase()
  db.prepare(`
    INSERT INTO trade_technicals (
      trade_id,
      tf_1m_macd_line, tf_1m_signal_line, tf_1m_histogram, tf_1m_histogram_prior,
      tf_1m_macd_positive, tf_1m_macd_open, tf_1m_macd_rising,
      tf_1m_vwap, tf_1m_vwap_dist_pct,
      tf_1m_ema9, tf_1m_ema9_dist_pct, tf_1m_ema20, tf_1m_ema20_dist_pct,
      tf_1m_ema9_above_ema20,
      tf_5m_macd_line, tf_5m_signal_line, tf_5m_histogram, tf_5m_histogram_prior,
      tf_5m_macd_positive, tf_5m_macd_open, tf_5m_macd_rising,
      tf_5m_vwap, tf_5m_vwap_dist_pct,
      tf_5m_ema9, tf_5m_ema9_dist_pct, tf_5m_ema20, tf_5m_ema20_dist_pct,
      tf_5m_ema9_above_ema20,
      data_complete, computed_at, schema_version
    ) VALUES (
      @trade_id,
      @tf_1m_macd_line, @tf_1m_signal_line, @tf_1m_histogram, @tf_1m_histogram_prior,
      @tf_1m_macd_positive, @tf_1m_macd_open, @tf_1m_macd_rising,
      @tf_1m_vwap, @tf_1m_vwap_dist_pct,
      @tf_1m_ema9, @tf_1m_ema9_dist_pct, @tf_1m_ema20, @tf_1m_ema20_dist_pct,
      @tf_1m_ema9_above_ema20,
      @tf_5m_macd_line, @tf_5m_signal_line, @tf_5m_histogram, @tf_5m_histogram_prior,
      @tf_5m_macd_positive, @tf_5m_macd_open, @tf_5m_macd_rising,
      @tf_5m_vwap, @tf_5m_vwap_dist_pct,
      @tf_5m_ema9, @tf_5m_ema9_dist_pct, @tf_5m_ema20, @tf_5m_ema20_dist_pct,
      @tf_5m_ema9_above_ema20,
      @data_complete, @computed_at, @schema_version
    )
    ON CONFLICT(trade_id) DO UPDATE SET
      tf_1m_macd_line        = excluded.tf_1m_macd_line,
      tf_1m_signal_line      = excluded.tf_1m_signal_line,
      tf_1m_histogram        = excluded.tf_1m_histogram,
      tf_1m_histogram_prior  = excluded.tf_1m_histogram_prior,
      tf_1m_macd_positive    = excluded.tf_1m_macd_positive,
      tf_1m_macd_open        = excluded.tf_1m_macd_open,
      tf_1m_macd_rising      = excluded.tf_1m_macd_rising,
      tf_1m_vwap             = excluded.tf_1m_vwap,
      tf_1m_vwap_dist_pct    = excluded.tf_1m_vwap_dist_pct,
      tf_1m_ema9             = excluded.tf_1m_ema9,
      tf_1m_ema9_dist_pct    = excluded.tf_1m_ema9_dist_pct,
      tf_1m_ema20            = excluded.tf_1m_ema20,
      tf_1m_ema20_dist_pct   = excluded.tf_1m_ema20_dist_pct,
      tf_1m_ema9_above_ema20 = excluded.tf_1m_ema9_above_ema20,
      tf_5m_macd_line        = excluded.tf_5m_macd_line,
      tf_5m_signal_line      = excluded.tf_5m_signal_line,
      tf_5m_histogram        = excluded.tf_5m_histogram,
      tf_5m_histogram_prior  = excluded.tf_5m_histogram_prior,
      tf_5m_macd_positive    = excluded.tf_5m_macd_positive,
      tf_5m_macd_open        = excluded.tf_5m_macd_open,
      tf_5m_macd_rising      = excluded.tf_5m_macd_rising,
      tf_5m_vwap             = excluded.tf_5m_vwap,
      tf_5m_vwap_dist_pct    = excluded.tf_5m_vwap_dist_pct,
      tf_5m_ema9             = excluded.tf_5m_ema9,
      tf_5m_ema9_dist_pct    = excluded.tf_5m_ema9_dist_pct,
      tf_5m_ema20            = excluded.tf_5m_ema20,
      tf_5m_ema20_dist_pct   = excluded.tf_5m_ema20_dist_pct,
      tf_5m_ema9_above_ema20 = excluded.tf_5m_ema9_above_ema20,
      data_complete          = excluded.data_complete,
      computed_at            = excluded.computed_at,
      schema_version         = excluded.schema_version
  `).run({
    trade_id: tradeId,
    tf_1m_macd_line: technicals.tf_1m.macd_line,
    tf_1m_signal_line: technicals.tf_1m.signal_line,
    tf_1m_histogram: technicals.tf_1m.histogram,
    tf_1m_histogram_prior: technicals.tf_1m.histogram_prior,
    tf_1m_macd_positive: encodeBool(technicals.tf_1m.macd_positive),
    tf_1m_macd_open: encodeBool(technicals.tf_1m.macd_open),
    tf_1m_macd_rising: encodeBool(technicals.tf_1m.macd_rising),
    tf_1m_vwap: technicals.tf_1m.vwap,
    tf_1m_vwap_dist_pct: technicals.tf_1m.vwap_dist_pct,
    tf_1m_ema9: technicals.tf_1m.ema9,
    tf_1m_ema9_dist_pct: technicals.tf_1m.ema9_dist_pct,
    tf_1m_ema20: technicals.tf_1m.ema20,
    tf_1m_ema20_dist_pct: technicals.tf_1m.ema20_dist_pct,
    tf_1m_ema9_above_ema20: encodeBool(technicals.tf_1m.ema9_above_ema20),
    tf_5m_macd_line: technicals.tf_5m.macd_line,
    tf_5m_signal_line: technicals.tf_5m.signal_line,
    tf_5m_histogram: technicals.tf_5m.histogram,
    tf_5m_histogram_prior: technicals.tf_5m.histogram_prior,
    tf_5m_macd_positive: encodeBool(technicals.tf_5m.macd_positive),
    tf_5m_macd_open: encodeBool(technicals.tf_5m.macd_open),
    tf_5m_macd_rising: encodeBool(technicals.tf_5m.macd_rising),
    tf_5m_vwap: technicals.tf_5m.vwap,
    tf_5m_vwap_dist_pct: technicals.tf_5m.vwap_dist_pct,
    tf_5m_ema9: technicals.tf_5m.ema9,
    tf_5m_ema9_dist_pct: technicals.tf_5m.ema9_dist_pct,
    tf_5m_ema20: technicals.tf_5m.ema20,
    tf_5m_ema20_dist_pct: technicals.tf_5m.ema20_dist_pct,
    tf_5m_ema9_above_ema20: encodeBool(technicals.tf_5m.ema9_above_ema20),
    data_complete: technicals.data_complete ? 1 : 0,
    computed_at: technicals.computed_at,
    schema_version: technicals.schema_version,
  })
}

/**
 * Return trade_ids whose technicals row is either missing,
 * incomplete (data_complete = 0), or has a stale
 * schema_version (< the current TECHNICALS_SCHEMA_VERSION).
 *
 * Session 3's chunked backfill enumerates these in batches.
 * Commit 4's lazy-guard hook calls this per-trade on chart
 * open (cheap, single-row check) to decide whether to
 * enqueue compute.
 *
 * "Missing" trades are surfaced via LEFT JOIN against the
 * trades table — trades with no trade_technicals row at
 * all show up in the result. Backed by the composite
 * index idx_trade_technicals_stale on
 * (schema_version, data_complete).
 */
export function getStaleTradeIds(currentSchemaVersion: number): number[] {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT t.id AS trade_id
      FROM trades t
      LEFT JOIN trade_technicals tt ON tt.trade_id = t.id
      WHERE tt.trade_id IS NULL
         OR tt.data_complete = 0
         OR tt.schema_version < ?
    `)
    .all(currentSchemaVersion) as { trade_id: number }[]
  return rows.map((r) => r.trade_id)
}
