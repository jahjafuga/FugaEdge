import { describe, it, expect } from 'vitest'
import { classifyVwapBucket } from '../vwapBuckets'
import { classifyEmaBucket } from '../emaBuckets'
import { computeHeaderStrip } from '../headerStrip'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

/**
 * Spec §J invariant audit map (Session 6 acceptance criteria & implementation
 * invariants, docs/plans/v0.2.4-technical-analysis.md). Each numbered invariant
 * maps to the test that covers it — the spec-to-test traceability index for
 * Sections 3 (VWAP) and 4 (EMA):
 *
 *   1.  vwapBuckets.test.ts        :: (C2) left-inclusive edge      +0.25% -> v4
 *   2.  vwapBuckets.test.ts        :: (C2) inclusive lower edge      -0.25% -> v3
 *   3.  emaBuckets.test.ts         :: (C2) left-inclusive edge       +0.5%  -> e3
 *   4.  THIS FILE                  :: bucket membership != strict above_* binary
 *   5.  BucketRow.test.tsx         :: renders the four visible stats
 *   6.  DEFERRED (visual)          :: deferral comment in Vwap/EmaDistanceBand.tsx;
 *                                     position-weight half is covered via DivergingBar
 *                                     geometry (BucketRow.test.tsx :: composes DivergingBar)
 *   7.  BucketRow.test.tsx         :: empty state renders '0'   + EmaDistanceBand (CR2)
 *   8.  BucketRow.test.tsx         :: Low-sample badge only when 0 < n < 5
 *   9.  vwap/emaBuckets.test.ts    :: (T7) expectancy null at n<5
 *                                     + BucketRow.test.tsx :: LOW render (this commit)
 *   10. BucketRow.test.tsx         :: LOW render — win rate flagged not hidden (this commit)
 *   11. BucketRow.test.tsx         :: empty case '0' / '$0.00'  + EmaDistanceBand (CR2)
 *   12. useBucketBand.test.ts      :: state machine (single-open, 210ms close lag)
 *                                     + AccordionPanel CSS (grid-rows duration-200 ease-out)
 *   13. BucketTradeTable.test.tsx + BucketTradeTable.wiring.test.tsx
 *                                     + TechnicalsTab.integration + MacdStateGrid.integration
 *   14. TechnicalsTab.integration.test.tsx :: (inv 14) filter preserved (this commit)
 *
 * This file houses invariant #4 — the one assertion with no natural single-module
 * home, because it is cross-module by nature: the bucket classifier and the
 * header-strip above_* binary are computed in separate pure modules, and the
 * invariant is precisely that the two do NOT depend on each other.
 */

// Invariant #4: "Bucket membership != the above_* binary." The at-the-level
// buckets straddle zero (both bands share the canonical [-0.5, +0.5) At bucket
// since Dave #10 — VWAP bucket v2, 9-EMA bucket e2), so two trades in the SAME
// bucket can carry DIFFERENT strict
// above_* values. computeHeaderStrip derives above_vwap / above_9ema as a strict
// `dist > 0` straight off the snapshot — never from a bucket index — which is
// exactly why the two CAN disagree. Asserting that disagreement within one bucket
// functionally proves the binary is not bucket-derived: a bucket-index derivation
// would force every same-bucket trade to share one value, which these do not.

function vwapRow(dist: number): TradeWithTechnicalsRow {
  return makeRow({ technicals: makeCompleteSnapshot({ vwap_dist_pct: dist }) })
}
function emaRow(dist: number): TradeWithTechnicalsRow {
  return makeRow({ technicals: makeCompleteSnapshot({ ema9_dist_pct: dist }) })
}

describe('Spec §J invariant 4 — bucket membership vs strict above_* binary', () => {
  it('VWAP bucket v2 (At VWAP) straddles zero: same bucket, different above_vwap', () => {
    // All three land in bucket v2 — membership is range-based, zero-inclusive.
    for (const dist of [-0.1, 0, 0.1]) {
      expect(classifyVwapBucket(vwapRow(dist), '1m')).toBe('v2')
    }
    // ...yet above_vwap is the strict (> 0) binary off the snapshot, so it splits
    // the same bucket by sign — and exactly 0 is NOT above.
    expect(computeHeaderStrip([vwapRow(-0.1)], '1m').aboveVwap.n).toBe(0)
    expect(computeHeaderStrip([vwapRow(0.1)], '1m').aboveVwap.n).toBe(1)
    expect(computeHeaderStrip([vwapRow(0)], '1m').aboveVwap.n).toBe(0)
  })

  it('9-EMA bucket 2 (At 9 EMA) straddles zero: same bucket, different above_9ema', () => {
    for (const dist of [-0.2, 0, 0.2]) {
      expect(classifyEmaBucket(emaRow(dist), '1m')).toBe('e2')
    }
    expect(computeHeaderStrip([emaRow(-0.2)], '1m').aboveEma9.n).toBe(0)
    expect(computeHeaderStrip([emaRow(0.2)], '1m').aboveEma9.n).toBe(1)
    expect(computeHeaderStrip([emaRow(0)], '1m').aboveEma9.n).toBe(0)
  })
})
