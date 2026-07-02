// v0.2.5 Phase A Session 3 — fact assembly for the pure XP engine (L13/L16).
// The only layer that reads journal state on the engine's behalf; the engine
// itself never touches the DB.
//
// STRUCTURAL RULE (A2): this module is P&L-BLIND BY CONSTRUCTION. No query
// here may SELECT any P&L column — the §A2 law says no XP source may ever
// reference P&L sign or dollar values, so the assembly layer simply never
// loads them. A shim-level guard test asserts /pnl/i appears in none of the
// SQL this module prepares.

import { openDatabase } from '../db/database'
import { tradeKeyFor } from '@/core/xp/awards'
import { isPreMarketEntry } from '@/core/technicals/alignment'
import type {
  ExistingEventFact,
  SessionFact,
  TradeFact,
} from '@/core/xp/types'

// ── Row shapes (exported for the mapper tests) ────────────────────────────

export interface SessionFactDbRow {
  date: string
  trade_count: number
  untagged_count: number
  imported_at: string | null
  sentiment: number | null
  no_trade_day: number | null
}

export interface TradeFactDbRow {
  id: number
  date: string
  open_time: string // entry timestamp (UTC ISO) — for the pre-market check; NOT a P&L column (A2)
  content_hash: string | null
  playbook_id: number | null
  catalyst_type: string | null
  has_note: number // EXISTS(...) → 0/1
  tt_trade_id: number | null
  tf_1m_macd_positive: number | null // INTEGER 0/1/NULL
  tf_1m_vwap_dist_pct: number | null
  tf_1m_ema9_dist_pct: number | null
}

// ── Mappers ───────────────────────────────────────────────────────────────

// A1 — the 0/1→boolean conversion the D7 predicate depends on. The engine
// checks macdPositive === true; in JS `1 === true` is FALSE, so passing the
// raw INTEGER through would make every discipline bonus silently never
// award (green tests, zero events, forever). Convert explicitly.
function toBoolOrNull(v: number | null): boolean | null {
  return v === null ? null : v === 1
}

export function mapSessionRow(r: SessionFactDbRow): SessionFact {
  return {
    date: r.date,
    tradeCount: r.trade_count,
    sentimentSet: r.sentiment !== null,
    // false at tradeCount 0 — the engine never reads it there (D9 requires
    // ≥1 trade on that branch), but no vacuous-true footguns.
    allTradesPlaybookTagged: r.trade_count > 0 && r.untagged_count === 0,
    isNoTradeDay: r.no_trade_day === 1,
    // RAW (L16/R1): SQLite datetime('now') format — the engine consumes
    // only the YYYY-MM-DD prefix (A1, Session 2).
    importedAt: r.imported_at,
  }
}

export function mapTradeRow(r: TradeFactDbRow): TradeFact {
  return {
    id: r.id,
    tradeKey: tradeKeyFor({ content_hash: r.content_hash, id: r.id }),
    date: r.date,
    hasPlaybook: r.playbook_id !== null,
    // catalyst_type is TEXT — treat '' / whitespace as unset (same
    // defensive spirit as the TRIM note guard; can only under-award).
    hasCatalyst: r.catalyst_type !== null && r.catalyst_type.trim() !== '',
    hasNote: r.has_note === 1,
    // Pre-market entries (before 09:30 ET) drop the N/A session-VWAP condition
    // in the D7 predicate (isFullyAligned). Derived from open_time, not P&L (A2).
    isPreMarket: isPreMarketEntry(r.open_time),
    // null when the trade has no trade_technicals row at all; a row whose
    // 1m fields are NULL maps to nulls and fails D7's strict triple anyway.
    technicals1m:
      r.tt_trade_id === null
        ? null
        : {
            macdPositive: toBoolOrNull(r.tf_1m_macd_positive),
            vwapDistPct: r.tf_1m_vwap_dist_pct,
            ema9DistPct: r.tf_1m_ema9_dist_pct,
          },
  }
}

// ── Assemblers ────────────────────────────────────────────────────────────

/**
 * SessionFacts over the FULL history (L13): the universe is (dates with ≥1
 * non-deleted trade) UNION (dates with a session_meta row), so no-trade
 * journaled days are included. Optional `dates` scopes the universe (hook
 * path). importedAt = MIN(created_at) over the date's non-deleted trades
 * (R1: MIN, so a straggler fill can never re-qualify an old session).
 *
 * Sim-unlock audit (Lao ruling 2026-07-02): practice is PROCESS — sim
 * trade-days count toward process XP. This read deliberately carries NO sim
 * wall and NO account dimension (pinned in pnl-facts-sim-wall.test.ts).
 */
export function assembleSessionFacts(dates?: string[]): SessionFact[] {
  const db = openDatabase()
  const scope =
    dates && dates.length > 0
      ? `WHERE u.date IN (${dates.map(() => '?').join(', ')})`
      : ''
  const rows = db
    .prepare(
      `WITH universe AS (
         SELECT date FROM trades WHERE deleted_at IS NULL
         UNION
         SELECT date FROM session_meta
       )
       SELECT
         u.date AS date,
         (SELECT COUNT(*) FROM trades t
            WHERE t.date = u.date AND t.deleted_at IS NULL) AS trade_count,
         (SELECT COUNT(*) FROM trades t
            WHERE t.date = u.date AND t.deleted_at IS NULL
              AND t.playbook_id IS NULL) AS untagged_count,
         (SELECT MIN(t.created_at) FROM trades t
            WHERE t.date = u.date AND t.deleted_at IS NULL) AS imported_at,
         sm.sentiment AS sentiment,
         COALESCE(sm.no_trade_day, 0) AS no_trade_day
       FROM universe u
       LEFT JOIN session_meta sm ON sm.date = u.date
       ${scope}
       ORDER BY u.date ASC`,
    )
    .all(...(dates && dates.length > 0 ? dates : [])) as SessionFactDbRow[]
  return rows.map(mapSessionRow)
}

/**
 * TradeFacts restricted to the fresh window (L13): callers pass fromDate =
 * now − FRESH_WINDOW_DAYS. PROOF this loses nothing: L6 makes the engine
 * skip every per-trade intent for dates older than the window, and L9
 * subset-safety guarantees the engine over this date-subset emits exactly
 * the full-input output's slice — so assembling stale trades could only
 * ever produce work the engine immediately discards. Optional `dates`
 * scopes further (hook path). NO P&L columns (A2).
 *
 * Sim-unlock audit (Lao ruling 2026-07-02): practice is PROCESS — sim
 * trades count toward process XP. NO sim wall, NO account dimension here
 * (pinned in pnl-facts-sim-wall.test.ts).
 */
export function assembleTradeFacts(
  fromDate: string,
  dates?: string[],
): TradeFact[] {
  const db = openDatabase()
  const scope =
    dates && dates.length > 0
      ? `AND t.date IN (${dates.map(() => '?').join(', ')})`
      : ''
  const rows = db
    .prepare(
      `SELECT
         t.id            AS id,
         t.date          AS date,
         t.open_time     AS open_time,
         t.content_hash  AS content_hash,
         t.playbook_id   AS playbook_id,
         t.catalyst_type AS catalyst_type,
         EXISTS(
           SELECT 1 FROM trade_notes n
           WHERE n.trade_id = t.id AND TRIM(n.note_text) <> ''
         )               AS has_note,
         tt.trade_id     AS tt_trade_id,
         tt.tf_1m_macd_positive AS tf_1m_macd_positive,
         tt.tf_1m_vwap_dist_pct AS tf_1m_vwap_dist_pct,
         tt.tf_1m_ema9_dist_pct AS tf_1m_ema9_dist_pct
       FROM trades t
       LEFT JOIN trade_technicals tt ON tt.trade_id = t.id
       WHERE t.deleted_at IS NULL AND t.date >= ?
       ${scope}
       ORDER BY t.id ASC`,
    )
    .all(fromDate, ...(dates && dates.length > 0 ? dates : [])) as TradeFactDbRow[]
  return rows.map(mapTradeRow)
}

/** The full ledger projection the engine needs (L13: full table — fine at
 *  this scale; revisit only if the ledger ever grows past ~10^5 rows). */
export function assembleExistingEvents(): ExistingEventFact[] {
  const db = openDatabase()
  return db
    .prepare(
      'SELECT event_type, idempotency_key, source_ref FROM xp_events',
    )
    .all() as ExistingEventFact[]
}

/** Every distinct non-deleted trade date — the streak engine's tradeDates
 *  input (S4/L20). Same allowlist-guard coverage as every query here. */
export function listTradeDates(): string[] {
  const db = openDatabase()
  const rows = db
    .prepare(
      'SELECT DISTINCT date FROM trades WHERE deleted_at IS NULL ORDER BY date ASC',
    )
    .all() as { date: string }[]
  return rows.map((r) => r.date)
}

/** Dates for a set of trade ids (the per-trade hook path). deleted_at is
 *  deliberately unfiltered — reconciling a date is idempotent either way. */
export function lookupTradeDates(ids: number[]): string[] {
  if (ids.length === 0) return []
  const db = openDatabase()
  const rows = db
    .prepare(
      `SELECT DISTINCT date FROM trades WHERE id IN (${ids.map(() => '?').join(', ')})`,
    )
    .all(...ids) as { date: string }[]
  return rows.map((r) => r.date)
}
