// v0.2.5 — read-time badge auto-minting (the deferred threshold sweep, D27).
// DISPLAY-ONLY: writes only badge_awards rows via awardBadge (INSERT OR IGNORE,
// idempotent) and NEVER calls insertXpEvents — a badge grants no XP, so there is
// no XP -> level -> badge -> XP loop. Runs when the wall's awards are fetched
// (badges/ipc.ts), mirroring how challenge badges mint at read time
// (goals/engine.ts L27). Stats come from the append-only ledger + computeStreak
// + walled trade facts (execution-facts.ts); milestones read the FLOORED level
// via the shared displayedLevel helper.

import { earnedGrades } from '@/core/badges/earned'
import { computeStreak } from '@/core/xp/streak'
import { todayDateISO } from '@/core/session/today'
import type { XpEventType } from '@shared/xp-types'
import type { NewlyMinted } from '@shared/identity-types'
import { listTradeDates } from '../xp/facts'
import { displayedLevel } from '../xp/level'
import { listIdempotencyKeys, listXpEvents } from '../xp/repo'
import {
  countGreenDays,
  countLowFloatTrades,
  countWinningTrades,
  longestGreenStreak,
} from './execution-facts'
import { awardBadge } from './repo'

const STREAK_PREFIX = 'streak:'

/** Evaluate every threshold badge against the current stats and INSERT OR IGNORE
 *  each earned grade. Returns the grades that were NEWLY inserted this call (the
 *  one-shot on-earn signal) — [] on a re-run since INSERT OR IGNORE skips them.
 *  Idempotent + display-only (no XP path touched). Safe to run on every read. */
export function mintEarnedBadges(): NewlyMinted[] {
  const events = listXpEvents()
  const count = (t: XpEventType) =>
    events.reduce((n, e) => (e.event_type === t ? n + 1 : n), 0)

  const journaledDates = listIdempotencyKeys(STREAK_PREFIX).map((k) =>
    k.slice(STREAK_PREFIX.length),
  )
  const { longest } = computeStreak({
    journaledDates,
    tradeDates: listTradeDates(),
    today: todayDateISO(),
  })

  const earned = earnedGrades({
    sessionCount: count('session_journaled'),
    archiveCount: count('session_journaled_archive'),
    reviewCount: count('weekly_review_completed'),
    disciplinedCount: count('disciplined_entry'),
    longestStreak: longest,
    flooredLevel: displayedLevel().level,
    // Arc 1 Beat 1 — ledger counts (annotation + risk-respected, like the other
    // process badges) + walled execution facts (green days/streak, winners, low
    // float). Still display-only: no insertXpEvents below.
    annotationCount: count('trade_fully_annotated'),
    maxLossRespectedDays: count('maxloss_respected'),
    greenDays: countGreenDays(),
    winningTrades: countWinningTrades(),
    lowFloatTrades: countLowFloatTrades(),
    greenStreakLongest: longestGreenStreak(),
  })

  const newlyMinted: NewlyMinted[] = []
  for (const grade of earned) {
    const { inserted } = awardBadge({
      badge_id: grade.badge_id,
      tier: grade.tier,
      source_ref: null,
    })
    if (inserted) newlyMinted.push({ badge_id: grade.badge_id, tier: grade.tier })
  }
  return newlyMinted
}
