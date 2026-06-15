// v0.2.5 — pure "main challenge" selector for the dashboard. Zero electron/DB/
// React imports (type-only GoalWithProgress). The DB-touching gather lives in
// electron/goals (listActiveEquityProgress); this only ranks the result.

import type { GoalWithProgress } from '@shared/identity-types'

/** Pick the single "main" challenge to feature on the dashboard: the active
 *  equity goal with the highest target. Input is assumed newest-first (as
 *  listGoals returns, created_at DESC), so a target tie keeps the first
 *  (newest) — strict `>` preserves it. Goals whose progress failed the
 *  defensive parse (progress null) are unrankable and skipped. Returns null
 *  when there is no rankable goal. */
export function pickMainChallenge(goals: GoalWithProgress[]): GoalWithProgress | null {
  let best: GoalWithProgress | null = null
  let bestTarget = -Infinity
  for (const g of goals) {
    if (!g.progress) continue
    if (g.progress.target > bestTarget) {
      best = g
      bestTarget = g.progress.target
    }
  }
  return best
}
