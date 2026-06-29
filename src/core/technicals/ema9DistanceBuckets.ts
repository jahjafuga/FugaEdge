// Momentum-tab 9-EMA distance bucketing — the pure home for the Momentum
// "by entry distance from 9EMA" table and the clean-vs-extended split. Shares
// emaBuckets.ts's canonical SIGNED 7-band scheme (the same edges + classifier the
// Technicals EMA band uses) so the "extended" definition can no longer drift
// between the two surfaces (Bug C). Adds only the Momentum-specific wrappers: the
// ordered table labels and the clean-vs-extended predicate.
//
// NB: this aligns the DEFINITION (signed edges) only. The Momentum surfaces still
// read trades.entry_ema9_distance_pct (all-time) while the Technicals band reads
// trade_technicals.*_ema9_dist_pct (date-scoped) — that coverage gap is a separate
// (deferred) concern; this module does not touch which column is read.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import {
  EMA_BUCKETS,
  classifyEma9Distance,
  type EmaBucketKey,
} from './emaBuckets'

/** Ordered bucket labels for the Momentum distance table — the canonical band
 *  labels in §A5 reading order (most-below → most-above). */
export const EMA9_DISTANCE_BUCKET_LABELS: readonly string[] = EMA_BUCKETS.map(
  (b) => b.label,
)

/** The Momentum table bucket label for a SIGNED 9-EMA distance %, or null when
 *  the distance is unknown (so the caller skips it). Shares emaBuckets' canonical
 *  edges via classifyEma9Distance — directional, so a negative distance reads as
 *  "Below 9 EMA", not "extended". */
export function ema9DistanceLabel(distPct: number | null): string | null {
  const key = classifyEma9Distance(distPct)
  if (key === null) return null
  return EMA_BUCKETS.find((b) => b.key === key)!.label
}

// Bands at or beyond the EXTENDED edge (+5.0%): e5 Extended, e6 Very extended,
// e7 Blow-off. Defined off the canonical keys so the clean-vs-extended threshold
// can never drift from the band scheme.
const EXTENDED_BUCKET_KEYS: ReadonlySet<EmaBucketKey> = new Set(['e5', 'e6', 'e7'])

/** Clean-vs-extended split: an entry is "extended" when its SIGNED 9-EMA distance
 *  is at or beyond the EXTENDED band's lower edge (+5.0%). A NEGATIVE distance is
 *  "below the 9 EMA", NOT extended (the absolute→signed fix). Null distance →
 *  not extended (the caller counts missing data separately). */
export function isExtendedEntry(distPct: number | null): boolean {
  const key = classifyEma9Distance(distPct)
  return key !== null && EXTENDED_BUCKET_KEYS.has(key)
}
