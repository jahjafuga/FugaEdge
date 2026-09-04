// BEAT 306 -- the three band facets, RE-EXPORTED from where the bands already
// live. This module authors NO boundary and NO label. It exists so the filter
// layer and the bar have one import site, and so a guard can prove by
// reference identity that nothing was copied.
//
//   time of day  TIME_OF_DAY_BUCKETS  core/technicals/timeOfDay.ts:60-66
//                Five buckets, US/Eastern, left-inclusive edges. The module
//                converts with utcToEasternParts (pure Intl, DST-aware), the
//                same converter charts/vwap.ts uses.
//   price        PRICE_BUCKETS        core/performance/comparison.ts:358-365
//                Six bands on the ENTRY price, which is the side-aware pick
//                comparison.ts:372-375 already makes (buy for longs, sell for
//                shorts, each falling back to the other leg).
//   float        floatBucket          core/insights/helpers.ts:119-133
//                Four bands plus 'unset'. THE RULED SOURCE. A second, finer
//                float list exists at comparison.ts:389-397 (seven bands, en
//                dash labels) mirroring electron/reports/get.ts; this beat
//                uses the ruled one and leaves both others untouched.
//
// PURITY: every source module imports only shared types, other core modules
// and @/lib/format (which imports nothing at all). No React, no electron, no
// fs anywhere in the graph, so core/performance may import all three without
// breaking ARCHITECTURE rule 1.
import { TIME_OF_DAY_BUCKETS } from '@/core/technicals/timeOfDay'
import { floatBucket, FLOAT_BUCKET_LABEL, type FloatBucket } from '@/core/insights/helpers'
import { PRICE_BUCKETS, priceBucketLabel, entryPrice } from './comparison'
import { utcToEasternParts } from '@/lib/format'
import type { TradeListRow } from '@shared/trades-types'

/** The five time buckets, the SAME array the technicals matrix renders. */
export const TIME_OF_DAY_FACET_BUCKETS = TIME_OF_DAY_BUCKETS

/** The six price bands, the SAME array Compare buckets price with. */
export const PRICE_FACET_BUCKETS = PRICE_BUCKETS

/** The four measurable float bands, in order, labelled by the shared map.
 *  'unset' is deliberately not offered: it is not a band a trader picks, it
 *  is the absence of data, and the coverage line names it instead. */
export const FLOAT_FACET_ORDER: readonly FloatBucket[] = ['nano', 'micro', 'small', 'mid']
export const FLOAT_FACET_LABELS: readonly string[] = FLOAT_FACET_ORDER.map(
  (k) => FLOAT_BUCKET_LABEL[k],
)

/** The bucket key for a trade's entry time, or null when open_time cannot be
 *  parsed. Left-inclusive, right-exclusive, exactly as the bucket meta says. */
export function timeOfDayKeyOf(t: TradeListRow): string | null {
  const parts = utcToEasternParts(t.open_time)
  if (!parts) return null
  const min = parts.hour * 60 + parts.minute
  const meta = TIME_OF_DAY_BUCKETS.find((b) => min >= b.loMin && min < b.hiMin)
  return meta ? meta.key : null
}

/** The price band label for a trade, through the shared entry-price pick and
 *  the shared classifier. Null when no band contains it. */
export function priceBandOf(t: TradeListRow): string | null {
  return priceBucketLabel(entryPrice(t))
}

/** The float band label for a trade, or null when the row carries no float.
 *  Null is the honest answer for an unmeasurable row, and callers exclude it
 *  rather than guessing a band. */
export function floatBandOf(t: TradeListRow): string | null {
  if (t.float_shares == null || !Number.isFinite(t.float_shares)) return null
  const key = floatBucket(t.float_shares)
  return key === 'unset' ? null : FLOAT_BUCKET_LABEL[key]
}

/** How many of these rows carry a float at all. The coverage line reports it
 *  so the excluded rows are visible rather than silently dropped. */
export function floatCoverage(rows: readonly TradeListRow[]): number {
  let n = 0
  for (const t of rows) if (floatBandOf(t) != null) n++
  return n
}
