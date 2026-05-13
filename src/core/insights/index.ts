// Insights engine entry point — pure registry + runner. Composes the
// individual rule functions, runs each over the same input, concatenates
// their outputs, sorts by priority. Caller (the renderer hook) handles
// truncation for the dashboard surface.
//
// No electron/fs/sqlite imports — this module compiles inside any web
// target per the project architecture rules.

import type { InsightInput, InsightResult } from './types'
import {
  runCatalystStrength,
  runCatalystWeakness,
  runConfidenceCorrelation,
  runDayOfWeek,
  runDisciplineStreakMilestone,
  runEma9Chasing,
  runExpectancy,
  runFirstThirtyMinutes,
  runFloatSweetSpot,
  runHoldTimeFlipped,
  runMistakeInLosers,
  runMistakePattern,
  runPlaybookPerformance,
  runRevengeTrading,
  runRewardRiskRatio,
  runSentimentEdge,
  runSymbolExtremes,
  runTimeOfDay,
} from './rules'

type SingleRule = (input: InsightInput) => InsightResult | null
type MultiRule = (input: InsightInput) => InsightResult[]

// Mix of single-emit and multi-emit rules. The runner normalizes both.
const SINGLE_RULES: SingleRule[] = [
  runSentimentEdge,
  runConfidenceCorrelation,
  runEma9Chasing,
  runPlaybookPerformance,
  runTimeOfDay,
  runMistakePattern,
  runFloatSweetSpot,
  runDisciplineStreakMilestone,
  runDayOfWeek,
  runExpectancy,
  runRewardRiskRatio,
  runHoldTimeFlipped,
  runRevengeTrading,
  runFirstThirtyMinutes,
]

const MULTI_RULES: MultiRule[] = [
  runCatalystStrength,
  runCatalystWeakness,
  runSymbolExtremes,
  runMistakeInLosers,
]

/** Run every registered rule over the input and return the union of their
 *  outputs sorted by priority (highest first). The caller is responsible
 *  for truncating to the visible window — the runner returns everything. */
export function runAllInsightRules(input: InsightInput): InsightResult[] {
  const out: InsightResult[] = []
  for (const rule of SINGLE_RULES) {
    const r = rule(input)
    if (r) out.push(r)
  }
  for (const rule of MULTI_RULES) {
    out.push(...rule(input))
  }
  out.sort((a, b) => b.priority - a.priority)
  return out
}

export type { InsightInput, InsightResult, InsightTone } from './types'
