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
  // Arc 1 Beat 1 — execution ladders + Annotator. All plain counts; the rule
  // stays blind to what they measure. Trade-fact reading is walled in
  // electron/badges/execution-facts.ts; annotation + risk-respected are ledger
  // counts assembled in mint.ts.
  /** Profitable trading days (daily_summary total_pnl > 0). */
  greenDays: number
  /** Winning trades (net_pnl above the scratch epsilon). */
  winningTrades: number
  /** Days the trader stayed within max-loss (maxloss_respected ledger events). */
  maxLossRespectedDays: number
  /** Trades on sub-20M-float runners. */
  lowFloatTrades: number
  /** Longest run of consecutive profitable days. */
  greenStreakLongest: number
  /** Fully-annotated trades (trade_fully_annotated ledger events). */
  annotationCount: number
  /** Arc 3 — the profit peak: the high-water mark of cumulative net P&L
   *  over non-sim, non-deleted trades, floored at zero (the walled read
   *  lives in electron/badges/money-facts.ts). */
  profitPeak: number
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
  // Arc 1 Beat 1 — execution ladders + Annotator.
  green_days: (s) => s.greenDays,
  winners: (s) => s.winningTrades,
  risk_respected: (s) => s.maxLossRespectedDays,
  low_float_hunter: (s) => s.lowFloatTrades,
  green_streak: (s) => s.greenStreakLongest,
  annotator: (s) => s.annotationCount,
  // Arc 3 — the money milestone rungs all read the profit peak; each rung's
  // gold grade threshold IS the dollar mark. Mint-all-tiers cascades a peak
  // that crosses several rungs at once.
  'money-100': (s) => s.profitPeak,
  'money-1k': (s) => s.profitPeak,
  'money-10k': (s) => s.profitPeak,
  'money-100k': (s) => s.profitPeak,
  'money-1m': (s) => s.profitPeak,
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
