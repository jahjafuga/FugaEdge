// v0.2.5 Phase A Session 2 — the pure award-intent engine (D12/D13, rulings
// L4-L9 + adjustments A1/A2). Given facts → the list of intents to INSERT OR
// IGNORE. Both emission paths share this one function: the inline hooks call
// it with one date's facts, the Session 3 reconciliation sweep with all of
// them — subset-safety (L9) is what makes that sharing correct. Pure module:
// no electron, no DB, no node:* imports, no clock reads (nowIso is input).

import type { XpAwardIntent, XpEventType } from '@shared/xp-types'
import {
  FRESH_WINDOW_DAYS,
  XP_AWARDS,
  diffUtcDays,
  isDisciplinedEntry,
  isFullyAnnotated,
  isJournaledDay,
} from './awards'
import type { ExistingEventFact, SessionFact, TradeFact } from './types'

export interface ComputeAwardIntentsInput {
  /** "Now" for the L6 fresh window — date prefix only is consumed (A1). */
  nowIso: string
  sessions: SessionFact[]
  trades: TradeFact[]
  /** The ledger as it stands — keys block re-awards, source_refs consume
   *  per-date cap slots (L5). */
  existing: ExistingEventFact[]
}

const PER_TRADE = [
  {
    type: 'trade_fully_annotated',
    keyPrefix: 'annotate',
    predicate: isFullyAnnotated,
  },
  {
    type: 'disciplined_entry',
    keyPrefix: 'discipline',
    predicate: isDisciplinedEntry,
  },
] as const

export function computeAwardIntents(
  input: ComputeAwardIntentsInput,
): XpAwardIntent[] {
  const { nowIso, sessions, trades, existing } = input

  const existingKeys = new Set(existing.map((e) => e.idempotency_key))

  // L5 — cap consumption is computable from the ledger alone: every existing
  // per-trade event with a date source_ref consumes one of its date's slots,
  // whether or not its trade still exists (hard-delete keeps the slot spent).
  // A null/legacy source_ref consumes nothing — defensive; the L4 convention
  // ships with the first event ever written.
  const capUsed = new Map<string, number>()
  for (const e of existing) {
    if (e.source_ref === null) continue
    if (
      e.event_type !== 'trade_fully_annotated' &&
      e.event_type !== 'disciplined_entry'
    ) {
      continue
    }
    const key = `${e.source_ref}|${e.event_type}`
    capUsed.set(key, (capUsed.get(key) ?? 0) + 1)
  }

  // Intents carry sort metadata until the final L9 ordering pass.
  const out: Array<{
    date: string
    eventType: XpEventType
    tradeId: number
    intent: XpAwardIntent
  }> = []

  function push(
    date: string,
    eventType: XpEventType,
    tradeId: number,
    intent: XpAwardIntent,
  ): void {
    out.push({ date, eventType, tradeId, intent })
  }

  // ── Session-level intents ────────────────────────────────────────────────
  for (const s of sessions) {
    // L7/L8 — the session award rewards the IMPORT act (≥1 trade required).
    // The fresh/archive pair is ONE logical award at two rates: a date is
    // eligible only if neither key exists yet.
    if (
      s.tradeCount >= 1 &&
      !existingKeys.has(`session:${s.date}`) &&
      !existingKeys.has(`session_archive:${s.date}`)
    ) {
      // floor-days(importedAt − sessionDate) ≤ 7 → fresh. null or malformed
      // importedAt → archive (under-pay, safe direction; A1). A negative
      // diff (import stamped before the session date — clock skew) is ≤ 7
      // and therefore fresh, which is the only sane reading of "within".
      const d = s.importedAt === null ? null : diffUtcDays(s.date, s.importedAt)
      if (d !== null && d <= FRESH_WINDOW_DAYS) {
        push(s.date, 'session_journaled', 0, {
          event_type: 'session_journaled',
          xp: XP_AWARDS.session_journaled.xp,
          idempotency_key: `session:${s.date}`,
          source_ref: s.date,
        })
      } else {
        push(s.date, 'session_journaled_archive', 0, {
          event_type: 'session_journaled_archive',
          xp: XP_AWARDS.session_journaled_archive.xp,
          idempotency_key: `session_archive:${s.date}`,
          source_ref: s.date,
        })
      }
    }

    // L8 — the streak bonus has its own bar (D9 journaled day); a no-trade
    // day earns this and only this.
    if (isJournaledDay(s) && !existingKeys.has(`streak:${s.date}`)) {
      push(s.date, 'daily_streak_bonus', 0, {
        event_type: 'daily_streak_bonus',
        xp: XP_AWARDS.daily_streak_bonus.xp,
        idempotency_key: `streak:${s.date}`,
        source_ref: s.date,
      })
    }
  }

  // ── Per-trade intents (annotate / discipline) ────────────────────────────
  const byDate = new Map<string, TradeFact[]>()
  for (const t of trades) {
    const arr = byDate.get(t.date)
    if (arr) {
      arr.push(t)
    } else {
      byDate.set(t.date, [t])
    }
  }

  for (const [date, dateTrades] of byDate) {
    // L6 — the D4 amendment: per-trade XP only while the trade's date is
    // within FRESH_WINDOW_DAYS of now (day 7 in, day 8 out, UTC days).
    // Older trades never earn annotate/discipline XP — history is rewarded
    // via archive session XP + the Historian badges (Phase B). Accepted
    // edge: technicals that compute >7 days after the trade date forfeit
    // the discipline bonus — rare post-§K, and in the under-pay direction.
    // A malformed date diffs to null and is skipped (under-pay, safe).
    const staleness = diffUtcDays(date, nowIso)
    if (staleness === null || staleness > FRESH_WINDOW_DAYS) continue

    for (const { type, keyPrefix, predicate } of PER_TRADE) {
      // L5 top-up: remaining = cap − slots already paid for this date,
      // regardless of WHICH trades the existing events point at — the
      // engine converges with whatever the inline hooks already wrote.
      const used = capUsed.get(`${date}|${type}`) ?? 0
      let remaining = Math.max(0, XP_AWARDS[type].capPerDate - used)
      if (remaining === 0) continue

      const candidates = dateTrades
        .filter((t) => predicate(t) && !existingKeys.has(`${keyPrefix}:${t.tradeKey}`))
        .sort((a, b) => a.id - b.id) // L5: id ASC (filter() already copied)

      for (const t of candidates) {
        if (remaining === 0) break
        remaining -= 1
        push(date, type, t.id, {
          event_type: type,
          xp: XP_AWARDS[type].xp,
          idempotency_key: `${keyPrefix}:${t.tradeKey}`,
          source_ref: date, // L4: the TRADE'S DATE — cap accounting survives hard deletes
        })
      }
    }
  }

  // ── L9 determinism: date asc, then event_type, then trade id ────────────
  out.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    if (a.eventType !== b.eventType) return a.eventType < b.eventType ? -1 : 1
    return a.tradeId - b.tradeId
  })
  return out.map((s) => s.intent)
}

/**
 * A2 — the weekly-review button's intent. Validates week_start is a bare
 * YYYY-MM-DD UTC SUNDAY (the calendar grid's anchor, per week_notes): a
 * caller passing a Monday would mint a DIFFERENT key for the same logical
 * week — a double-award class idempotency cannot catch — so this fails loud
 * as a programmer-error guard.
 */
export function buildWeeklyReviewIntent(weekStart: string): XpAwardIntent {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    throw new Error(
      `buildWeeklyReviewIntent: week_start must be bare YYYY-MM-DD, got '${weekStart}'`,
    )
  }
  const [y, m, d] = weekStart.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(
      `buildWeeklyReviewIntent: '${weekStart}' is not a real calendar date`,
    )
  }
  if (date.getUTCDay() !== 0) {
    throw new Error(
      `buildWeeklyReviewIntent: '${weekStart}' is not a Sunday — week_start must use the calendar grid's Sunday anchor`,
    )
  }
  return {
    event_type: 'weekly_review_completed',
    xp: XP_AWARDS.weekly_review_completed.xp,
    idempotency_key: `weekly_review:${weekStart}`,
    source_ref: weekStart,
  }
}

/** The Phase B goal engine's completion intent (process goals only, D19). */
export function buildGoalCompletedIntent(goalId: string): XpAwardIntent {
  return {
    event_type: 'goal_completed',
    xp: XP_AWARDS.goal_completed.xp,
    idempotency_key: `goal:${goalId}:completed`,
    source_ref: goalId,
  }
}
