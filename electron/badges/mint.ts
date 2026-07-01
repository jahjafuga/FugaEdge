// v0.2.5 — read-time badge auto-minting (the deferred threshold sweep, D27).
// DISPLAY-ONLY: writes only badge_awards rows via awardBadge (INSERT OR IGNORE,
// idempotent) and NEVER calls insertXpEvents — a badge grants no XP, so there is
// no XP -> level -> badge -> XP loop. Runs when the wall's awards are fetched
// (badges/ipc.ts), mirroring how challenge badges mint at read time
// (goals/engine.ts L27). Stats come from the append-only ledger + computeStreak;
// milestones read the FLOORED level via the shared displayedLevel helper.

import { earnedGrades } from '@/core/badges/earned'
import { computeStreak } from '@/core/xp/streak'
import { todayDateISO } from '@/core/session/today'
import type { XpEventType } from '@shared/xp-types'
import { listTradeDates } from '../xp/facts'
import { displayedLevel } from '../xp/level'
import { listIdempotencyKeys, listXpEvents } from '../xp/repo'
import { awardBadge } from './repo'

const STREAK_PREFIX = 'streak:'

/** Evaluate every threshold badge against the current stats and INSERT OR IGNORE
 *  each earned grade. Idempotent (already-minted grades are skipped) and
 *  display-only (no XP path touched). Safe to run on every read. */
export function mintEarnedBadges(): void {
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
  })

  for (const grade of earned) {
    awardBadge({ badge_id: grade.badge_id, tier: grade.tier, source_ref: null })
  }
}
