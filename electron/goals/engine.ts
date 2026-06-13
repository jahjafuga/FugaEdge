// v0.2.5 Phase B Session 5 — the goals evaluate-and-read engine (L25/L26/
// L27; spec §G, D19, D25).
//
// READ-TIME EVALUATION IS THE DESIGN (L27): GOALS_LIST computes progress
// for every active goal and performs due completions inline. No launch-
// sweep goal logic, no hooks — a goal completes when its owner looks at
// it, which is also when the celebration can be seen. Idempotent by
// construction: only ACTIVE goals transition; the goal_completed
// idempotency key and the badge expression index dedupe everything else.
//
// THE D19 WALL: process completion awards goal_completed (+1,000) through
// awardGoalCompletion, which THROWS on an equity goal — the Sunday-guard
// analog. Equity completion awards the challenge badge + status only.
// Equity progress MAY read net_pnl (./equity); the XP path never can.

import type { Goal, GoalProgress, GoalsListResult, GoalWithProgress } from '@shared/identity-types'
import { METRIC_EVENT_TYPE, parseGoalConfig } from '@/core/goals/config'
import { challengeBadgeId } from '@/core/badges/catalog'
import { buildGoalCompletedIntent } from '@/core/xp/engine'
import { listGoals, updateGoalStatus } from './repo'
import { insertXpEvents, listXpEvents } from '../xp/repo'
import { awardBadge } from '../badges/repo'
import { cumulativeNetPnlSince } from './equity'

/** D19's law as a programmer-error guard: equity goals award ZERO XP —
 *  completion is celebration + challenge badge only. Throws loud rather
 *  than minting a quiet windfall. */
export function awardGoalCompletion(goal: Goal): void {
  if (goal.kind === 'equity') {
    throw new Error(
      `awardGoalCompletion: equity goal '${goal.id}' can never award XP (D19)`,
    )
  }
  insertXpEvents([buildGoalCompletedIntent(goal.id)])
}

function progressFor(goal: Goal): GoalProgress | null {
  const parsed = parseGoalConfig(goal.kind, goal.config_json)
  if (!parsed) return null

  if (parsed.kind === 'process') {
    // L25 — ledger counts only, forward-looking from goal creation. A
    // sweep that retro-pays history AFTER creation counts those events
    // (their created_at is sweep time) — accepted, under-surprise (D25).
    const since = goal.created_at ?? undefined
    const eventType = METRIC_EVENT_TYPE[parsed.config.metric]
    const current = listXpEvents({ sinceIso: since }).filter(
      (e) => e.event_type === eventType,
    ).length
    const target = parsed.config.target
    return { current, target, fraction: Math.min(1, current / target) }
  }

  const { start_date, start_amount, target_amount } = parsed.config
  const current = start_amount + cumulativeNetPnlSince(start_date)
  const span = target_amount - start_amount // validator guarantees > 0
  const fraction = Math.min(1, Math.max(0, (current - start_amount) / span))
  return { current, target: target_amount, fraction }
}

function isDue(progress: GoalProgress | null): boolean {
  return progress !== null && progress.current >= progress.target
}

export function evaluateAndListGoals(): GoalsListResult {
  const justCompleted: string[] = []

  for (const goal of listGoals('active')) {
    const progress = progressFor(goal)
    if (!isDue(progress)) continue
    // Complete inline (L27). Status first — the transition is what makes
    // re-entry idempotent; the XP key + badge index dedupe the rest.
    updateGoalStatus(goal.id, 'completed', new Date().toISOString())
    if (goal.kind === 'process') awardGoalCompletion(goal)
    // R2 — preset_id → its NAMED catalog badge ('Make a Million' → the million
    // badge); custom / diverged goals (null preset_id) mint the generic
    // 'challenge-complete'. Never 'goal:'+ulid — the wall shows named trophies.
    awardBadge({ badge_id: challengeBadgeId(goal.preset_id), tier: null, source_ref: goal.id })
    justCompleted.push(goal.id)
  }

  // Re-list AFTER completions so just-completed goals land in their strip.
  const active: GoalWithProgress[] = listGoals('active').map((goal) => ({
    ...goal,
    progress: progressFor(goal),
  }))
  return {
    active,
    completed: listGoals('completed'),
    abandoned: listGoals('abandoned'),
    justCompleted,
  }
}
