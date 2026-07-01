// v0.2.5 — the pure badge earn-rule for threshold auto-minting. PURE module:
// no electron/db. Given a stat-set, return every badge GRADE currently earned.
//
// Mint-all-tiers: for a tiered badge, emit EVERY grade whose threshold is met
// (16 sessions -> Journaler copper only; 60 -> copper+silver). Milestones read
// the FLOORED level (the caller passes displayProgress(...).level, never raw).
// The two CONDITION badges (Locked-In, Sharpening) and the CHALLENGE badges are
// absent from COUNT_FOR, so they are never auto-minted: condition badges need an
// unwired windowed-discipline stat; challenge badges mint on goal completion
// (goals/engine.ts). Display-only: earning a badge grants no XP.

import type { BadgeTier } from '@shared/identity-types'
import { BADGE_CATALOG } from './catalog'

export interface BadgeStats {
  sessionCount: number
  archiveCount: number
  reviewCount: number
  disciplinedCount: number
  /** Longest journaling streak ever (never-lost — computeStreak.longest). */
  longestStreak: number
  /** The DISPLAYED (floored) level — displayProgress(...).level, never raw. */
  flooredLevel: number
}

export interface EarnedGrade {
  badge_id: string
  tier: BadgeTier | null
}

/** The stat each auto-minted badge counts. Badges absent here are not minted by
 *  this sweep (the condition + challenge badges). Milestones all read the
 *  floored level; each milestone grade's threshold IS the level it requires. */
const COUNT_FOR: Readonly<Record<string, (s: BadgeStats) => number>> = {
  journaler: (s) => s.sessionCount,
  historian: (s) => s.archiveCount,
  reviewer: (s) => s.reviewCount,
  aligned: (s) => s.disciplinedCount,
  streak: (s) => s.longestStreak,
  'level-10': (s) => s.flooredLevel,
  'level-25': (s) => s.flooredLevel,
  'level-50': (s) => s.flooredLevel,
  'level-75': (s) => s.flooredLevel,
  'level-99': (s) => s.flooredLevel,
}

export function earnedGrades(stats: BadgeStats): EarnedGrade[] {
  const out: EarnedGrade[] = []
  for (const def of BADGE_CATALOG) {
    const countOf = COUNT_FOR[def.id]
    if (!countOf) continue // condition / challenge badge — not auto-minted here
    const count = countOf(stats)
    for (const g of def.grades) {
      // threshold > 0 guards against a 0-threshold grade minting on count 0.
      if (g.threshold > 0 && count >= g.threshold) {
        out.push({ badge_id: def.id, tier: g.tier })
      }
    }
  }
  return out
}
