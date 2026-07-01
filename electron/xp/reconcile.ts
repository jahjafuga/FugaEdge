// v0.2.5 Phase A Session 3 — the XP reconciliation sweep + its scoped hook
// variants (D12, L10/L12/L13). SINGLE-PASS by design: §K chunked because its
// items were rate-limited network fetches; this is local SQL + pure math,
// sub-second at 5,000-trade scale. It mirrors the §K siblings in WIRING
// only — launch-armed in the awaited chain, try/catch log-only at the call
// sites, fast no-op at steady state (zero intents → zero writes).
//
// Every path is the same three steps: assemble → computeAwardIntents →
// INSERT OR IGNORE. The engine's subset-safety (L9) is what makes the
// scoped hook variants emit exactly the full sweep's slice.

import { FRESH_WINDOW_DAYS } from '@/core/xp/awards'
import { computeMaxLossIntents } from '@/core/xp/discipline'
import { computeAwardIntents } from '@/core/xp/engine'
import type { XpAwardIntent } from '@shared/xp-types'
import { getSettings } from '../settings/repo'
import {
  assembleExistingEvents,
  assembleSessionFacts,
  assembleTradeFacts,
  lookupTradeDates,
} from './facts'
import { netPnlByDate } from './pnl-facts'
import { insertXpEvents } from './repo'

export interface XpReconcileResult {
  /** Events actually inserted this run, keyed by event_type. Empty object
   *  when the sweep was a no-op — the steady-state launch shape. */
  insertedByType: Record<string, number>
  durationMs: number
}

const ZERO: XpReconcileResult = { insertedByType: {}, durationMs: 0 }

// The L13 fresh-window lower bound: now − FRESH_WINDOW_DAYS as a UTC date
// string. Same component math as the engine's day-diff helper — no
// local-time parsing.
function freshWindowStart(nowIso: string): string {
  const [y, m, d] = nowIso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - FRESH_WINDOW_DAYS))
    .toISOString()
    .slice(0, 10)
}

function insertGroupedByType(intents: XpAwardIntent[]): Record<string, number> {
  const groups = new Map<string, XpAwardIntent[]>()
  for (const intent of intents) {
    const group = groups.get(intent.event_type)
    if (group) {
      group.push(intent)
    } else {
      groups.set(intent.event_type, [intent])
    }
  }
  const insertedByType: Record<string, number> = {}
  for (const [type, group] of groups) {
    insertedByType[type] = insertXpEvents(group)
  }
  return insertedByType
}

function reconcile(dates: string[] | undefined, nowIso: string): XpReconcileResult {
  const t0 = Date.now()
  const sessions = assembleSessionFacts(dates)
  const trades = assembleTradeFacts(freshWindowStart(nowIso), dates)
  const existing = assembleExistingEvents()
  const intents = computeAwardIntents({ nowIso, sessions, trades, existing })

  // §A2 EXCEPTION — the maxloss_respected discipline award (see ./pnl-facts).
  // Parallel + additive: computeAwardIntents above stays P&L-blind; this branch
  // reads the day's realized P&L (contained in pnl-facts.ts) and the self-set
  // limit to award PAST days that stayed within it. Same INSERT OR IGNORE path.
  const existingKeys = new Set(existing.map((e) => e.idempotency_key))
  const disciplineIntents = computeMaxLossIntents(
    netPnlByDate(dates),
    getSettings().values.max_daily_loss,
    existingKeys,
    nowIso,
  )

  const insertedByType = insertGroupedByType([...intents, ...disciplineIntents])
  return { insertedByType, durationMs: Date.now() - t0 }
}

/** The full launch sweep (L10). */
export function runXpReconcile(
  opts: { nowIso?: string } = {},
): XpReconcileResult {
  return reconcile(undefined, opts.nowIso ?? new Date().toISOString())
}

/** Scoped sweep for the date-keyed hooks (import, session saves — L12).
 *  Assembles only those dates' session facts + their fresh-window trades. */
export function reconcileXpForDates(
  dates: string[],
  nowIso?: string,
): XpReconcileResult {
  const unique = Array.from(new Set(dates))
  if (unique.length === 0) return { ...ZERO }
  return reconcile(unique, nowIso ?? new Date().toISOString())
}

/** Scoped sweep for the trade-keyed hooks (playbook/catalyst/note saves —
 *  L12): looks up the trades' dates, then delegates to the date path. */
export function xpReconcileForTradeIds(
  ids: number[],
  nowIso?: string,
): XpReconcileResult {
  if (ids.length === 0) return { ...ZERO }
  const dates = lookupTradeDates(ids)
  if (dates.length === 0) return { ...ZERO }
  return reconcileXpForDates(dates, nowIso)
}
