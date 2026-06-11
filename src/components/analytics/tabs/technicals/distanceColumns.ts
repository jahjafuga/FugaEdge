// Section-supplied third-column descriptors for BucketTradeTable (F6). MACD State
// (Section 2) reads the MACD line; the future VWAP (Section 3) and EMA (Section 4)
// sections will add their signed-distance columns here. Each is a DistanceColumn:
// a label, a value extractor off the active-timeframe snapshot, and a formatter.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from '@/core/technicals/headerStrip'
import type { DistanceColumn } from './BucketTradeTable'

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
