// v0.2.5 — the maxloss_respected discipline award: PURE rules (no electron/db).
//
// This award is the documented §A2 exception (see xp-types.ts): it rewards
// staying within a SELF-SET daily loss limit, a controllable process act. The
// P&L READING lives in electron/xp/pnl-facts.ts; this module only holds the
// boundary check + the per-day intent gate, fed a plain { netPnl, tradeCount }
// per date. Soundness (absence-fact hazard): only PAST days are awarded, since
// a closed day cannot gain new same-day trades under post-session CSV import.

import type { XpAwardIntent } from '@shared/xp-types'
import { XP_AWARDS } from './awards'

/** Respected = a limit is set AND the day's realized net P&L did not fall below
 *  it (inclusive: losing exactly the limit still respects it). */
export function respectedMaxLoss(dayNetPnl: number, maxLossLimit: number): boolean {
  return maxLossLimit > 0 && dayNetPnl >= -maxLossLimit
}

export interface DayPnl {
  netPnl: number
  tradeCount: number
}

/** One maxloss_respected intent per PAST day that had >=1 closed trade, stayed
 *  within the limit, and isn't already keyed. Today (and any future date) is
 *  skipped: the day must be closed for the absence fact to be sound. */
export function computeMaxLossIntents(
  pnlByDate: Map<string, DayPnl>,
  maxLossLimit: number,
  existingKeys: Set<string>,
  nowIso: string,
): XpAwardIntent[] {
  const today = nowIso.slice(0, 10)
  const intents: XpAwardIntent[] = []
  for (const [date, { netPnl, tradeCount }] of pnlByDate) {
    if (date >= today) continue // past days only (strictly before today)
    if (tradeCount < 1) continue // require >=1 closed trade
    if (!respectedMaxLoss(netPnl, maxLossLimit)) continue
    const key = `maxloss_respected:${date}`
    if (existingKeys.has(key)) continue
    intents.push({
      event_type: 'maxloss_respected',
      xp: XP_AWARDS.maxloss_respected.xp,
      idempotency_key: key,
      source_ref: date,
    })
  }
  return intents
}
