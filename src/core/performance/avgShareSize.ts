// Avg Share Size (djsevans87) — mean over trades of position size, where position
// size = Math.max(shares_bought, shares_sold) (the established convention, same as
// r-multiple.ts and the per-share / position-size stats in fullStats). Equals
// Dave's "shares traded / trades / 2" on every CLOSED trade: the round-trip
// builder closes a trip only at flat position (build-round-trips.ts), so
// shares_bought == shares_sold there, making max(legs) and (bought+sold)/2
// identical; they diverge only on transient open/partial trips.
//
// Zero-position rows (max legs == 0) are excluded so a malformed empty row can't
// drag the mean. Empty input → null (renders as an em-dash downstream, never
// 0/NaN). The null/mean semantics match fullStats' meanOrNull exactly, so
// extracting the inline here is behaviour-preserving for the Compare metric.
//
// Pure — no electron / fs / React imports — so the electron analytics/reports
// layer and the renderer day/week computes all share ONE definition.
export function avgShareSize(
  trades: { shares_bought: number; shares_sold: number }[],
): number | null {
  const sizes = trades
    .map((t) => Math.max(t.shares_bought, t.shares_sold))
    .filter((pos) => pos > 0)
  if (sizes.length === 0) return null
  let sum = 0
  for (const pos of sizes) sum += pos
  return sum / sizes.length
}
