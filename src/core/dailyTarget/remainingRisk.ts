// v0.2.5 — remaining daily loss budget. PURE per ARCHITECTURE #1: zero
// electron/DB/React imports. The risk-side companion to dailyTargetProgress.

/** How much more the trader can lose from their CURRENT P&L before hitting the
 *  max-daily-loss floor (-maxDailyLoss). Returns null when the cap is NOT SET —
 *  maxDailyLoss <= 0 or non-finite (mirrors MaxLossBanner bailing). Profit is
 *  CREDITED as buffer: distance from today's P&L down to the floor is
 *  `todayPnl - (-maxDailyLoss) = todayPnl + maxDailyLoss`, so a green day GROWS
 *  the buffer, unbounded above the cap (+16/50 -> 66, +100/50 -> 150); flat
 *  leaves the full cap (0/50 -> 50); a drawdown shrinks it (-8/50 -> 42). The
 *  result is floored at 0 (never negative, even once the floor is breached). */
export function remainingRisk(todayPnl: number, maxDailyLoss: number): number | null {
  if (!Number.isFinite(maxDailyLoss) || maxDailyLoss <= 0) return null
  return Math.max(0, todayPnl + maxDailyLoss)
}
