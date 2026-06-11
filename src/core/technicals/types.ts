// Co-located pure type for the technicals bucket-stat shape — the per-bucket
// aggregate (count / win rate / net P&L / avg winner / avg loser / expectancy)
// produced by computeMacdBuckets and consumed by the bucket-card / bucket-row
// components. Moved here (F5.5) from macdBuckets.ts so the future VWAP
// (Section 3) and EMA (Section 4) bucket modules can share the shape without
// importing from a MACD-section-specific module. Pure — no electron / fs /
// sqlite imports — so it compiles into the future Next.js + Postgres port per
// ARCHITECTURE.md.
//
// NB: distinct from the unrelated BucketStats in shared/reports-types.ts (the
// reports-feature breakdown shape — 13 snake_case fields). Same name, different
// module; no TS collision. Rename of either is deferred to its own beat.

/**
 * Stats for a single MACD-state bucket cell.
 *
 * - n: trades in the bucket.
 * - winRate: winners / n, as a 0..1 FRACTION (NOT a percent) — null only when
 *   n === 0. The renderer formats it via percent() from @/lib/format, which
 *   takes a fraction; consistent with HeaderStrip CardStats.winRate. Shown for
 *   every non-empty bucket (a low-sample badge is the caveat, not suppression).
 * - netPnl: sum of net_pnl across the bucket (always computed).
 * - avgWinner: mean net_pnl among winners (net_pnl > 0); null when no winners.
 * - avgLoser: mean net_pnl among losers (net_pnl <= 0; breakeven counts as a
 *   loss per §A7); null when no losers. Naturally negative or zero.
 * - expectancy: dollar expectancy = netPnl / n; null when n < 5 (§C:104).
 */
export interface BucketStats {
  n: number
  winRate: number | null
  netPnl: number
  avgWinner: number | null
  avgLoser: number | null
  expectancy: number | null
}
