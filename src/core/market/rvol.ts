// v0.2.5 EdgeIQ Trader DNA — relative volume (RVOL) derivation. FULL-DAY RVOL:
// the trade day's total volume ÷ the symbol's ~30-day average volume — the
// existing Reports definition (reports/get.ts). Both inputs come from CACHED
// market_data (daily_volumes[date] + avg_volume), so this is a ZERO-API
// re-derive — unlike daily % change, no fetch. PURE per ARCHITECTURE #1: zero
// electron/fs/sqlite/React imports.
//
// Params accept null/undefined so the cache reads (a missing daily_volumes[date]
// key, or a null avg_volume) flow straight in and resolve to null = uncomputable,
// never a fabricated number (the no-fake law). Guards: avg > 0 AND day > 0.

export function rvolFor(
  dayVolume: number | null | undefined,
  avgVolume: number | null | undefined,
): number | null {
  if (
    typeof dayVolume !== 'number' ||
    typeof avgVolume !== 'number' ||
    !Number.isFinite(dayVolume) ||
    !Number.isFinite(avgVolume) ||
    avgVolume <= 0 ||
    dayVolume <= 0
  ) {
    return null
  }
  return dayVolume / avgVolume
}
