// v0.2.5 Phase A Session 2 — pure XP core fact types. Session 3's fact
// assembly (electron-side) imports these; they deliberately do NOT live in
// shared/: facts never cross IPC — assembly and engine both run in the main
// process. shared/xp-types.ts holds only the ledger types that do cross.

import type { XpEventType } from '@shared/xp-types'

/** One trading date's session-level facts (D4/D9 inputs). */
export interface SessionFact {
  /** Trading day YYYY-MM-DD (trades.date / session_meta.date). */
  date: string
  /** Non-deleted trades on the date. */
  tradeCount: number
  /** D9: session_meta.sentiment IS NOT NULL — nothing else. */
  sentimentSet: boolean
  /** D9: 100% of the date's non-deleted trades have playbook_id. */
  allTradesPlaybookTagged: boolean
  /** session_meta.no_trade_day = 1. */
  isNoTradeDay: boolean
  /**
   * When this date's trades were imported — Session 3 derives it as
   * MIN(trades.created_at) over the date's non-deleted rows (R1: MIN, not
   * MAX, so a straggler fill imported later can never re-qualify an old
   * session as fresh). Both ISO-8601 and SQLite datetime('now')
   * ('YYYY-MM-DD HH:MM:SS', already UTC) are accepted RAW — the engine
   * consumes only the first-10-char date prefix (A1). null or malformed
   * values take the archive branch: under-pay, the safe direction (L7).
   */
  importedAt: string | null
}

/** One trade's annotation/discipline facts (D7/D8 inputs). */
export interface TradeFact {
  /** trades.id — the per-date cap selection order (L5: id ASC). */
  id: number
  /** D13 key: content_hash when non-NULL, else 'id:' + id (tradeKeyFor). */
  tradeKey: string
  /** Trading day YYYY-MM-DD (trades.date). */
  date: string
  /** D8: playbook_id set. */
  hasPlaybook: boolean
  /** D8: catalyst_type set. */
  hasCatalyst: boolean
  /** D8: non-empty note (trade_notes row; saveNote never stores ''). */
  hasNote: boolean
  /**
   * D7 inputs from the trade's tf_1m technicals snapshot; null when the
   * trade has no trade_technicals row. Any null field → not disciplined.
   */
  technicals1m: {
    macdPositive: boolean | null
    vwapDistPct: number | null
    ema9DistPct: number | null
  } | null
}

/** A ledger row as the engine needs it — existing-award knowledge (L5/L7). */
export interface ExistingEventFact {
  event_type: XpEventType
  idempotency_key: string
  /** L4 convention: the date for per-date-capped types. null on legacy or
   *  malformed rows — consumes no cap slot (L5, defensive). */
  source_ref: string | null
}
