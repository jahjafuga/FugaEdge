// Pure types for the Insights engine. No imports from electron/fs/sqlite —
// these compile cleanly inside a Next.js page or any other web target per
// the architecture rules in /ARCHITECTURE.md.

import type { TradeListRow } from '@shared/trades-types'

export type InsightTone = 'positive' | 'neutral' | 'negative'

export interface InsightResult {
  /** Stable id within a run — caller uses for React keys. Composed by the
   *  rule (e.g. "sentiment-edge", "catalyst-strength:halt-resume"). */
  id: string
  /** Rule slug — useful for telemetry / filtering and matches a folder
   *  convention if rules ever grow into separate files. */
  rule: string
  tone: InsightTone
  /** One-line headline. Bolded in the card. */
  title: string
  /** Descriptive sentence with the specific numbers. Plain text — no JSX. */
  body: string
  /** Optional right-aligned metric chip (e.g. "+$1,240" or "62%"). */
  metric?: string
  /** Higher = more important. Used by the runner to sort + truncate to the
   *  top N for the Dashboard card. Magnitude × sample size is the typical
   *  shape, but each rule decides what "important" means for it. */
  priority: number
  /** Sample size — the number of trades the card's claim is computed over
   *  (e.g. hot+cold for sentiment-edge, the bucket size for a dimension rule).
   *  0 for non-trade cards (discipline-streak). Drives the visible n-count and
   *  Beat 2's confidence chips / n<5 suppression. ADDITIVE: no rule's detection,
   *  tone, priority, or body depends on it. */
  n: number
}

/** Inputs to the rule registry. All rules take the same object so the
 *  runner can call them uniformly; each rule reads only what it needs. */
export interface InsightInput {
  /** Trades already filtered by the caller (typically last 90 days). The
   *  rules don't re-filter — they trust the upstream window. */
  trades: TradeListRow[]
  /** Date (YYYY-MM-DD) → sentiment level 1..5. Sourced from session_meta. */
  sentimentByDate: Map<string, number>
  /** Current consecutive-market-day streak of trading-or-journaling. */
  disciplineStreak: number
}
