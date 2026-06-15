// v0.2.5 EdgeIQ daily-debrief — pure EdgeScore → named-tier mapping. PURE
// (ARCHITECTURE #1): zero electron / fs / DB / React; runs identically in a
// future Next.js port. Maps the 0–100 EdgeScore composite (edgeScore.ts) to a
// human tier name + its band, shared by the daily-debrief card AND the existing
// ScoreCard label so the two can never drift.
//
// Bands are CONTIGUOUS over 0–100 and LEFT-INCLUSIVE on `min` (a score of 40 is
// Leaking, not Critical). Guards: ≥ 100 clamps to Elite, ≤ 0 to Critical, and a
// non-finite score (NaN / ±Infinity — never produced by computeEdgeScore, which
// returns a rounded finite number or null) falls back to Critical: a score we
// can't trust is treated as worst, never silently promoted to Elite.

export interface ScoreTier {
  name: string
  /** Inclusive lower bound of the band (0–100). */
  min: number
  /** Inclusive upper bound of the band (0–100). */
  max: number
}

/** The nine tiers, highest-first. Contiguous and left-inclusive on `min`. */
export const SCORE_TIERS: readonly ScoreTier[] = [
  { name: 'Elite',       min: 95, max: 100 },
  { name: 'Exceptional', min: 90, max: 94 },
  { name: 'Advanced',    min: 85, max: 89 },
  { name: 'Consistent',  min: 80, max: 84 },
  { name: 'Developing',  min: 70, max: 79 },
  { name: 'Improving',   min: 60, max: 69 },
  { name: 'Unstable',    min: 50, max: 59 },
  { name: 'Leaking',     min: 40, max: 49 },
  { name: 'Critical',    min: 0,  max: 39 },
] as const

const ELITE = SCORE_TIERS[0]
const CRITICAL = SCORE_TIERS[SCORE_TIERS.length - 1]

export function tierForScore(score: number): ScoreTier {
  if (!Number.isFinite(score)) return CRITICAL
  if (score >= 100) return ELITE
  if (score <= 0) return CRITICAL
  // Highest-first scan: the first band whose `min` the score clears wins
  // (left-inclusive). Always matches for a finite 0 < score < 100; the `??`
  // is a defensive floor, never reached in practice.
  return SCORE_TIERS.find((t) => score >= t.min) ?? CRITICAL
}
