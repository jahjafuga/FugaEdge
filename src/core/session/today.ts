// Pure derivation for the Today's Session card. No I/O, no electron — the
// caller hands in today's date, today's trades, and the persisted
// SessionMeta row. This module decides the card's status + stats + flags.
//
// Status semantics:
//   - 'active'      → at least one trade closed today
//   - 'no-trade'    → trader marked today as a no-trade day
//   - 'not-started' → no trades and not marked; the default "blank canvas"

import type { TradeListRow } from '@shared/trades-types'
import type { SessionMeta } from '@shared/session-types'
import type { JournalEntry } from '@shared/journal-types'
import { isWin, isLoss } from '@/core/classify/outcome'

export type SessionStatus = 'active' | 'no-trade' | 'not-started'

export interface TradeExtreme {
  symbol: string
  pnl: number
}

export interface TodaySessionStats {
  netPnL: number
  /** Gross P&L (pre-fees) summed across today's trades. v0.1.5 — surfaces
   *  on the Today's Session summary line so the trader can see fees as a
   *  distinct line item rather than baked into net. */
  grossPnL: number
  /** Total fees today (sum of trade.total_fees). Always shown — even 0 —
   *  so the user knows fees are tracked. */
  totalFees: number
  trades: number
  winners: number
  losers: number
  /** 0..1, or null when no decided trades today. */
  winRate: number | null
  bestTrade: TradeExtreme | null
  worstTrade: TradeExtreme | null
}

export interface TodaySessionStatus {
  date: string
  status: SessionStatus
  /** Always defined — defaults to a placeholder when no session_meta row
   *  exists for the date yet. */
  meta: SessionMeta
  /** Filled when status === 'active'; null otherwise. */
  stats: TodaySessionStats | null
  /** True when ANY journal field for today has been filled — premarket
   *  notes, post-session notes, emotion rating, rules followed / violated.
   *  Counts toward `committed`. */
  hasJournalEntry: boolean
  /** True when the session is "done" — trades imported, no-trade-day saved
   *  with a reason, or a journal entry exists. Drives the card's
   *  collapsed/completed state. */
  committed: boolean
}

export function emptyMeta(date: string): SessionMeta {
  return {
    date,
    sentiment: null,
    notes: '',
    no_trade_day: false,
    no_trade_reason: '',
  }
}

/** Compute today-stats from a list of trades scoped to a single date. */
export function computeTodayStats(trades: TradeListRow[]): TodaySessionStats {
  let net = 0
  let gross = 0
  let fees = 0
  let winners = 0
  let losers = 0
  let best: TradeExtreme | null = null
  let worst: TradeExtreme | null = null
  for (const t of trades) {
    net += t.net_pnl
    gross += t.gross_pnl
    fees += t.total_fees
    if (isWin(t.net_pnl)) winners += 1
    else if (isLoss(t.net_pnl)) losers += 1
    if (best == null || t.net_pnl > best.pnl) best = { symbol: t.symbol, pnl: t.net_pnl }
    if (worst == null || t.net_pnl < worst.pnl) worst = { symbol: t.symbol, pnl: t.net_pnl }
  }
  const decided = winners + losers
  return {
    netPnL: net,
    grossPnL: gross,
    totalFees: fees,
    trades: trades.length,
    winners,
    losers,
    winRate: decided > 0 ? winners / decided : null,
    bestTrade: best,
    worstTrade: worst,
  }
}

/** Mirror of the analytics "has-journal-entry" predicate. Pure — accepts
 *  the renderer-side JournalEntry. Returns true when any meaningful field
 *  has content. */
export function hasJournalContent(entry: JournalEntry | null): boolean {
  if (!entry) return false
  if (entry.premarket_notes.trim() !== '') return true
  if (entry.postsession_notes.trim() !== '') return true
  if (entry.emotion_rating != null) return true
  if (entry.rules_followed.length > 0) return true
  if (entry.rule_violations.length > 0) return true
  return false
}

/** Derive the full Today's Session status from the inputs. */
export function deriveTodayStatus(
  date: string,
  trades: TradeListRow[],
  meta: SessionMeta | null,
  hasJournalEntry: boolean,
): TodaySessionStatus {
  const resolvedMeta = meta ?? emptyMeta(date)
  const todays = trades.filter((t) => t.date === date)

  let status: SessionStatus
  let stats: TodaySessionStats | null = null
  if (todays.length > 0) {
    status = 'active'
    stats = computeTodayStats(todays)
  } else if (resolvedMeta.no_trade_day) {
    status = 'no-trade'
  } else {
    status = 'not-started'
  }

  // Commitment rule: the trader has explicitly closed the loop for today.
  // - Trades imported → automatic
  // - No-trade flag + non-empty reason → explicit log
  // - Journal entry filled → explicit log
  const committed =
    status === 'active' ||
    (status === 'no-trade' && resolvedMeta.no_trade_reason.trim() !== '') ||
    hasJournalEntry

  return {
    date,
    status,
    meta: resolvedMeta,
    stats,
    hasJournalEntry,
    committed,
  }
}

/** Suggested quick-reason chips for the no-trade-day textarea. Plain text
 *  so the UI can drop them into the field. */
export const NO_TRADE_REASON_CHIPS = [
  'Choppy market',
  'No A+ setups',
  'Sentiment too cold',
  'News event / FOMC',
  'Personal — off day',
  'Discipline check — followed rules',
] as const

/** Local-time YYYY-MM-DD for the current moment. Pure-but-clock-dependent
 *  — caller passes a Date so tests can stub it. */
export function todayDateISO(now: Date = new Date()): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** No-trade days in the calendar month containing `date`. Used for the
 *  "No-trade days this month: X" stat.
 *
 *  Counts DISTINCT dates flagged through any UI path:
 *   - session_meta.no_trade_day = 1 (dashboard "Mark as no-trade day")
 *   - journal.day_tags includes "no-trade-day" (calendar sit-out modal)
 *
 *  `extraNoTradeDates` is the renderer-supplied set of dates the calendar
 *  IPC already unified across both stores — pass it in to count without
 *  re-querying. Falls back to just the session_meta list when omitted, so
 *  existing call sites keep their old behaviour (test fixtures, mainly).
 */
export function countNoTradeDaysThisMonth(
  date: string,
  sessions: SessionMeta[],
  extraNoTradeDates: readonly string[] = [],
): number {
  const month = date.slice(0, 7) // YYYY-MM prefix
  const dates = new Set<string>()
  for (const s of sessions) {
    if (s.date.startsWith(month) && s.no_trade_day) dates.add(s.date)
  }
  for (const d of extraNoTradeDates) {
    if (d.startsWith(month)) dates.add(d)
  }
  return dates.size
}
