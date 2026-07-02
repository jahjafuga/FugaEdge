// THE SINGLE, DELIBERATE §A2 EXCEPTION — the ONLY XP path permitted to read P&L.
//
// §A2 (shared/xp-types.ts) holds that no XP event references P&L or dollar
// targets, and it STILL holds for every other award: facts.ts remains P&L-blind
// and its allowlist guard (electron/xp/__tests__/facts.test.ts) is untouched.
// This one award -- maxloss_respected -- rewards a DISCIPLINE/PROCESS act:
// staying within a SELF-SET daily loss limit, a controllable behavior. By
// founder decision (2026-07-01) it may read a day's realized net P&L, contained
// ENTIRELY here. Do NOT read P&L elsewhere in the XP layer, and NEVER move this
// query into facts.ts (it would enter the allowlist guard and correctly fail).
// The pure rule + per-day intent gate live in @/core/xp/discipline.

import { openDatabase } from '../db/database'
import { SIM_WALL } from '../accounts/scope'
import type { DayPnl } from '@/core/xp/discipline'

/** Per-date REALIZED net P&L (SUM net_pnl) + closed-trade count over non-deleted
 *  CLOSED trades (close_time IS NOT NULL) -- the same realized, close-time basis
 *  the analytics giveback uses (analytics/get.ts). Optional `dates` scopes it to
 *  the dates being reconciled. Dedicated query; NOT coupled to getAnalytics. */
export function netPnlByDate(dates?: string[]): Map<string, DayPnl> {
  const db = openDatabase()
  const scope =
    dates && dates.length > 0
      ? `AND date IN (${dates.map(() => '?').join(', ')})`
      : ''
  const rows = db
    .prepare(
      // Sim-unlock audit fix beat 2 — the maxloss award judges REAL money
      // only (Lao ruling 2026-07-02): the sim wall fences this one
      // money-reading query. Still the single A2 exception; still no scope
      // param — the wall is a data-integrity fence.
      `SELECT date,
              SUM(net_pnl) AS net_pnl,
              COUNT(*)     AS trade_count
         FROM trades
        WHERE deleted_at IS NULL AND close_time IS NOT NULL AND ${SIM_WALL}
          ${scope}
        GROUP BY date`,
    )
    .all(...(dates && dates.length > 0 ? dates : [])) as {
    date: string
    net_pnl: number
    trade_count: number
  }[]
  const map = new Map<string, DayPnl>()
  for (const r of rows) {
    map.set(r.date, { netPnl: r.net_pnl, tradeCount: r.trade_count })
  }
  return map
}
