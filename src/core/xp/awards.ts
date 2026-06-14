// v0.2.5 Phase A Session 2 — award amounts, eligibility predicates, and the
// UTC day-diff helper (spec §A2, D7, D8, D9, D13; rulings L4-L8 + A1).
// Pure module: no electron, no DB, no node:* imports.

import type { XpEventType } from '@shared/xp-types'
import type { SessionFact, TradeFact } from './types'
import { isFullyAligned } from '@/core/technicals/alignment'

/** Single source of truth for every §A2 amount and per-date cap. */
export const XP_AWARDS = {
  session_journaled: { xp: 40, capPerDate: 1 },
  session_journaled_archive: { xp: 10, capPerDate: 1 },
  trade_fully_annotated: { xp: 12, capPerDate: 6 },
  disciplined_entry: { xp: 15, capPerDate: 4 },
  daily_streak_bonus: { xp: 25, capPerDate: 1 },
  weekly_review_completed: { xp: 175 },
  goal_completed: { xp: 1000 },
} as const satisfies Record<XpEventType, { xp: number; capPerDate?: number }>

/** L6/L7 — the D4 fresh window, in UTC calendar days (day 7 in, day 8 out). */
export const FRESH_WINDOW_DAYS = 7

/** D13: content_hash when non-NULL, else 'id:' + trades.id. */
export function tradeKeyFor(t: { content_hash: string | null; id: number }): string {
  return t.content_hash !== null ? t.content_hash : `id:${t.id}`
}

/** D8: playbook set AND catalyst set AND non-empty note. */
export function isFullyAnnotated(t: TradeFact): boolean {
  return t.hasPlaybook && t.hasCatalyst && t.hasNote
}

/**
 * D7, evaluated on the tf_1m snapshot only, via the shared isFullyAligned
 * predicate (single source of truth across XP + analytics). Regular-hours
 * entry: macd_positive AND vwap_dist_pct > 0 AND ema9_dist_pct > 0. Pre-market
 * entry (t.isPreMarket): macd_positive AND ema9_dist_pct > 0 — session VWAP is
 * N/A before the 09:30 open and is dropped. A missing snapshot is never an award.
 */
export function isDisciplinedEntry(t: TradeFact): boolean {
  const s = t.technicals1m
  if (s === null) return false
  return isFullyAligned(s.macdPositive, s.vwapDistPct, s.ema9DistPct, t.isPreMarket)
}

/**
 * D9 (per L8): no_trade_day OR (≥1 trade AND sentiment set AND 100% of the
 * date's trades playbook-tagged). A day with zero trades and no no-trade
 * mark is neutral — false here, and the engine awards nothing for it.
 */
export function isJournaledDay(s: SessionFact): boolean {
  return (
    s.isNoTradeDay ||
    (s.tradeCount >= 1 && s.sentimentSet && s.allTradesPlaybookTagged)
  )
}

// A1 — parse the first-10-char YYYY-MM-DD prefix to a UTC midnight. NEVER
// Date.parse on a full timestamp: V8 reads 'YYYY-MM-DD HH:MM:SS' as LOCAL
// time, which near midnight shifts day-7 to day-8 depending on the machine's
// zone. created_at is stored UTC, so the date prefix IS the UTC calendar
// date — component parsing is the exact semantic, not an approximation. The
// round-trip check rejects semantic rollovers ('2026-02-31') that the regex
// alone would let Date.UTC silently normalize.
function utcMidnightMs(value: string): number | null {
  const prefix = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(prefix)) return null
  const [y, m, d] = prefix.split('-').map(Number)
  const ms = Date.UTC(y, m - 1, d)
  const back = new Date(ms)
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== m - 1 ||
    back.getUTCDate() !== d
  ) {
    return null
  }
  return ms
}

/**
 * UTC floor-day difference `to − from`, consuming only each argument's
 * YYYY-MM-DD prefix (A1) — ISO-8601 and SQLite datetime('now') strings are
 * both accepted raw. Returns null when either side is malformed; callers
 * treat null as "unknown" and take the under-paying branch.
 */
export function diffUtcDays(from: string, to: string): number | null {
  const a = utcMidnightMs(from)
  const b = utcMidnightMs(to)
  if (a === null || b === null) return null
  // Both are exact UTC midnights, so the division is exact; round() only
  // guards hypothetical float noise.
  return Math.round((b - a) / 86_400_000)
}
