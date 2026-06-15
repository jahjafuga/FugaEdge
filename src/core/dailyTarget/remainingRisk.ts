// v0.2.5 — remaining daily loss budget. PURE per ARCHITECTURE #1: zero
// electron/DB/React imports. The risk-side companion to dailyTargetProgress.

/** How much more the trader can lose today before hitting the max-daily-loss
 *  cap. Returns null when the cap is NOT SET — maxDailyLoss <= 0 or non-finite
 *  (mirrors MaxLossBanner bailing). A green or flat day leaves the full budget
 *  intact; a drawdown eats into it; the result is floored at 0 (never negative,
 *  even once the cap is breached). */
export function remainingRisk(todayPnl: number, maxDailyLoss: number): number | null {
  if (!Number.isFinite(maxDailyLoss) || maxDailyLoss <= 0) return null
  if (todayPnl >= 0) return maxDailyLoss
  return Math.max(0, maxDailyLoss - Math.abs(todayPnl))
}
