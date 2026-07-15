// Section-supplied third-column descriptors for BucketTradeTable (F6). MACD State
// (Section 2) reads the MACD line; VWAP (Section 3) and EMA (Section 4) add their
// signed-distance columns here. Each is a DistanceColumn: a label, a value
// extractor off the active-timeframe snapshot, and a formatter.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { DistanceColumn } from './BucketTradeTable'
import { signedPct } from '@/lib/format'

// The `!` on row.technicals is safe: BucketTradeTable only ever renders
// rowsForBucket output, and rowsForBucket → classifyMacdBucket returns a non-null
// bucket key only when technicals is non-null (passed the data gate) AND
// macd_positive / macd_rising are non-null. So every row reaching the table
// carries a snapshot. macd_line is typed number|null but is non-null whenever
// macd_positive is (both derive from the same MACD line); the `?? 0` satisfies the
// type and is unreachable in practice. Explicit + on positives — the MACD line's
// sign IS the positive/negative axis the column sorts on, so symmetry around zero
// reads at a glance.
export const macdLineColumn: DistanceColumn = {
  label: 'MACD line',
  getValue: (row: TradeWithTechnicalsRow, timeframe: Timeframe) =>
    (timeframe === '1m' ? row.technicals!.tf_1m : row.technicals!.tf_5m)
      .macd_line ?? 0,
  format: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`,
}

// VWAP distance (§A4) — the signed % distance from day VWAP (anchored at the
// day's first bar since the v0.2.5 anchor unification), the Section 3 column.
// Same `!` safety as macdLineColumn (rowsForVwapBucket only yields rows with
// non-null vwap_dist_pct). signedPct renders the +X.X% form (F2.1's
// indicator-distance helper); the column sorts on the signed value.
export const vwapDistanceColumn: DistanceColumn = {
  label: 'VWAP dist',
  getValue: (row: TradeWithTechnicalsRow, timeframe: Timeframe) =>
    (timeframe === '1m' ? row.technicals!.tf_1m : row.technicals!.tf_5m)
      .vwap_dist_pct ?? 0,
  format: (v: number) => signedPct(v),
}

// EMA 9 distance (§A5) — the signed % distance from the 9 EMA, the Section 4
// column. Same `!` safety as vwapDistanceColumn (rowsForEmaBucket only yields rows
// with non-null ema9_dist_pct). "EMA 9" matches the TradeDetailSheet label the row
// click drills into; signedPct renders the +X.X% form and the column sorts on the
// signed value.
export const emaDistanceColumn: DistanceColumn = {
  label: 'EMA 9 dist',
  getValue: (row: TradeWithTechnicalsRow, timeframe: Timeframe) =>
    (timeframe === '1m' ? row.technicals!.tf_1m : row.technicals!.tf_5m)
      .ema9_dist_pct ?? 0,
  format: (v: number) => signedPct(v),
}
