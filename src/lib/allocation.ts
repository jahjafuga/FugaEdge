// Stage 3 beat 3.5 — the allocation-line math: each account's share of
// the POSITIVE total, as fractions for the segmented balance bar.
// Presentation math (src/lib, not src/core). Rules, pinned in test:
// - fractions are balance / positive-sum; negatives clamp to ZERO width
//   (the account stays priced in the breakdown — the bar never fakes
//   composition, it just cannot draw a negative width);
// - a non-positive SIGNED total (or an empty set) hides the bar: [];
// - a single positive account is one full segment.
// Sim never reaches this helper — the reader walls it upstream.

export interface AllocationSegment {
  id: string
  /** 0..1 share of the positive total (0 for non-positive balances). */
  fraction: number
}

export function allocationSegments(
  rows: { id: string; balance: number }[],
): AllocationSegment[] {
  if (rows.length === 0) return []
  const signedTotal = rows.reduce((s, r) => s + r.balance, 0)
  if (signedTotal <= 0) return []
  const positiveSum = rows.reduce((s, r) => s + Math.max(0, r.balance), 0)
  if (positiveSum <= 0) return []
  return rows.map((r) => ({
    id: r.id,
    fraction: r.balance > 0 ? r.balance / positiveSum : 0,
  }))
}
