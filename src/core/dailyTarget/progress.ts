// v0.2.5 — daily profit-target progress. PURE per ARCHITECTURE #1: zero
// electron/DB/React imports, so it runs identically in the renderer today and a
// future web target. The profit-side mirror of the max_daily_loss check.

export interface DailyTargetProgress {
  /** todayPnl / target — UNCLAMPED. A 150% day is real (1.25); a red day is
   *  negative. The caller decides how to render (e.g. floor at 0% in a bar). */
  fraction: number
  /** todayPnl >= target. */
  hit: boolean
}

/** Progress toward the user's daily net-P&L target.
 *  Returns null when the target is NOT SET — target <= 0 or non-finite —
 *  mirroring MaxLossBanner bailing when max_daily_loss <= 0. */
export function dailyTargetProgress(
  todayPnl: number,
  target: number,
): DailyTargetProgress | null {
  if (!Number.isFinite(target) || target <= 0) return null
  return { fraction: todayPnl / target, hit: todayPnl >= target }
}
