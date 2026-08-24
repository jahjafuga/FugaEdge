// v0.2.7 — THE MACD SECOND AXIS BECOMES OPEN/CLOSED.
//
// FOUNDER-RULED (Dave's request, both posts): the MACD State grid's second
// axis stops asking "is the histogram rising" and starts asking "is the line
// above its signal" — open versus closed. The alignment card tightens to
// POSITIVE + OPEN with it.
//
// WHY THIS IS A CONSUMER-SIDE BEAT: macd_open has been stored per timeframe
// since schema 26, derived at capture as `macd_line > signal_line`
// (computeTradeTechnicals.ts). Nothing about capture, schema, migration or
// backfill changes here — only which stored fact the classifier and the
// alignment predicate read.
//
// THE LAWS THESE GUARDS PIN:
//   R1  the axis reads the STORED macd_open, never re-derives it from line
//       and signal (a null operand would silently compare false and mislabel
//       an unsettled-signal entry as "closed" instead of unclassifiable).
//   R8  a null open stays UNCLASSIFIED — never coerced to false.
//   R4  alignment gains the open conjunct, and the discipline leg moves with
//       it through the shared predicate — no second edit.

import { describe, expect, it } from 'vitest'
import {
  classifyMacdBucket,
  computeMacdBuckets,
  rowsForBucket,
  type BucketKey,
} from '../macdBuckets'
import { computeHeaderStrip } from '../headerStrip'
import { isFullyAligned } from '../alignment'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'

/** A row whose 1m snapshot carries exactly the axis values under test. */
const row = (
  id: number,
  macd_positive: boolean | null,
  macd_open: boolean | null,
  extra: Parameters<typeof makeRow>[0] = {},
) =>
  makeRow({
    id,
    technicals: makeCompleteSnapshot({ macd_positive, macd_open }),
    ...extra,
  })

// ─── G1 ──────────────────────────────────────────────────────────────────────

describe('G1 the classifier buckets by the stored OPEN, not by rising', () => {
  it('all four combinations land by (positive, open)', () => {
    expect(classifyMacdBucket(row(1, true, true), '1m')).toBe('posOpen')
    expect(classifyMacdBucket(row(2, true, false), '1m')).toBe('posClosed')
    expect(classifyMacdBucket(row(3, false, true), '1m')).toBe('negOpen')
    expect(classifyMacdBucket(row(4, false, false), '1m')).toBe('negClosed')
  })

  it('macd_rising is IGNORED — a rising-false trade still buckets open', () => {
    const r = makeRow({
      id: 9,
      technicals: makeCompleteSnapshot({
        macd_positive: true,
        macd_open: true,
        macd_rising: false,
      }),
    })
    expect(classifyMacdBucket(r, '1m'), 'the classifier still reads rising').toBe('posOpen')
  })

  it('and the mirror: rising-true with open-false is CLOSED', () => {
    const r = makeRow({
      id: 10,
      technicals: makeCompleteSnapshot({
        macd_positive: true,
        macd_open: false,
        macd_rising: true,
      }),
    })
    expect(classifyMacdBucket(r, '1m')).toBe('posClosed')
  })

  it('rowsForBucket resolves through the same classifier', () => {
    const rows = [row(1, true, true), row(2, true, false), row(3, false, true)]
    expect(rowsForBucket(rows, '1m', 'posOpen').map((r) => r.id)).toEqual([1])
    expect(rowsForBucket(rows, '1m', 'negOpen').map((r) => r.id)).toEqual([3])
  })
})

// ─── G2 ──────────────────────────────────────────────────────────────────────

describe('G2 the four keys are exhaustive and the tiers account for every row', () => {
  const rows = [
    row(1, true, true),
    row(2, true, false),
    row(3, false, true),
    row(4, false, false),
    row(5, true, null), // unclassified — open unknown
    row(6, null, true), // unclassified — positive unknown
    makeRow({ id: 7, technicals: null }), // excluded — gate fail
  ]
  const stats = computeMacdBuckets(rows, '1m')

  it('denominator equals the sum of the four buckets', () => {
    expect(stats.denominator).toBe(
      stats.posOpen.n + stats.posClosed.n + stats.negOpen.n + stats.negClosed.n,
    )
    expect(stats.denominator).toBe(4)
  })

  it('every row lands in exactly one tier', () => {
    expect(stats.denominator + stats.unclassified + stats.excluded).toBe(rows.length)
    expect(stats.unclassified).toBe(2)
    expect(stats.excluded).toBe(1)
  })

  it('the key union is exactly the four', () => {
    const keys: BucketKey[] = ['posOpen', 'posClosed', 'negOpen', 'negClosed']
    for (const k of keys) expect(stats[k], `${k} missing from the stats shape`).toBeDefined()
  })
})

// ─── G3 ──────────────────────────────────────────────────────────────────────

describe('G3 a null open is UNCLASSIFIED, never coerced false', () => {
  it('classifier returns null rather than a closed bucket', () => {
    expect(
      classifyMacdBucket(row(1, true, null), '1m'),
      'a null open was coerced to closed',
    ).toBeNull()
    expect(classifyMacdBucket(row(2, false, null), '1m')).toBeNull()
  })

  it('and it counts as unclassified, not as a bucket member', () => {
    const stats = computeMacdBuckets([row(1, true, null)], '1m')
    expect(stats.unclassified).toBe(1)
    expect(stats.denominator).toBe(0)
    expect(stats.posClosed.n, 'the null-open row was bucketed as closed').toBe(0)
  })

  it('a null POSITIVE is unclassified too — both axes are required', () => {
    expect(classifyMacdBucket(row(1, null, true), '1m')).toBeNull()
  })
})

// ─── G4 ──────────────────────────────────────────────────────────────────────

describe('G4 the tie law: line equal to signal reads CLOSED', () => {
  it('capture stores open=false on the tie, and the classifier honours it', () => {
    // computeTradeTechnicals derives macd_open as `macd_line > signal_line`,
    // strictly — so line === signal is stored false, i.e. CLOSED. This pins
    // the consumer end of that contract.
    const tie = makeRow({
      id: 1,
      technicals: makeCompleteSnapshot({
        macd_line: 0.42,
        signal_line: 0.42,
        macd_positive: true,
        macd_open: false,
      }),
    })
    expect(classifyMacdBucket(tie, '1m')).toBe('posClosed')
  })
})

// ─── G6 ──────────────────────────────────────────────────────────────────────

describe('G6 a positive-but-closed trade FAILS alignment', () => {
  it('the open conjunct is load-bearing in regular hours', () => {
    expect(isFullyAligned(true, true, 1, 1, false), 'positive + open + above both should align').toBe(true)
    expect(
      isFullyAligned(true, false, 1, 1, false),
      'a positive-but-CLOSED trade still aligned',
    ).toBe(false)
  })

  it('and pre-market, where VWAP is dropped but open is not', () => {
    expect(isFullyAligned(true, true, null, 1, true)).toBe(true)
    expect(
      isFullyAligned(true, false, null, 1, true),
      'a positive-but-closed pre-market trade still aligned',
    ).toBe(false)
  })

  it('a null open never aligns — the null-fails-safe convention', () => {
    expect(isFullyAligned(true, null, 1, 1, false)).toBe(false)
  })
})

// ─── G7 ──────────────────────────────────────────────────────────────────────

describe('G7 the discipline leg moves with alignment — one predicate, no divergence', () => {
  // DEFAULT_TF sits BELOW both VWAP and the 9EMA, so the other legs are
  // overridden here — this guard is about the MACD half only.
  const above = { vwap_dist_pct: 1, ema9_dist_pct: 1 }
  const aligned = makeRow({
    id: 1,
    net_pnl: 100,
    technicals: makeCompleteSnapshot({ macd_positive: true, macd_open: true, ...above }),
  })
  const closed = makeRow({
    id: 2,
    net_pnl: 100,
    technicals: makeCompleteSnapshot({ macd_positive: true, macd_open: false, ...above }),
  })

  it('the header strip full-alignment card counts only the open one', () => {
    const hs = computeHeaderStrip([aligned, closed], '1m')
    expect(hs.denominator).toBe(2)
    expect(hs.fullAlignment.n, 'the closed trade was credited as disciplined').toBe(1)
    expect(hs.fullAlignment.percent).toBe(50)
  })

  it('and the MACD card is now positive+open, not positive alone', () => {
    const hs = computeHeaderStrip([aligned, closed], '1m')
    expect(
      hs.macdPositive.n,
      'the MACD card still counts positive-but-closed trades',
    ).toBe(1)
  })

  it('the two agree by construction when the other legs are satisfied', () => {
    // Same rows, both above VWAP and 9EMA: the MACD card and the discipline
    // card must report the identical subset — proof they share the predicate's
    // MACD half rather than each testing their own idea of it.
    const hs = computeHeaderStrip([aligned, closed], '1m')
    expect(hs.macdPositive.n).toBe(hs.fullAlignment.n)
  })
})
