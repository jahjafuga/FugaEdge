import { describe, it, expect } from 'vitest'
import { VWAP_BUCKETS, VWAP_BUCKET_EXTENT } from '../vwapBuckets'
import { EMA_BUCKETS, EMA_BUCKET_EXTENT } from '../emaBuckets'

// Dave #10 — the PARITY LOCK. The VWAP band adopted the canonical signed
// 7-band scheme the EMA band already ships (his own proposal, cc3932a, adopted
// wholesale) — same edges, same barValues, same extent, same descriptor heads,
// same range text. The two bands must read as siblings and can never drift
// apart again: any edge or scheme change to one without the other fails here.
//
// A shared constant was considered and rejected: bucket 2's parenthetical is
// legitimately per-indicator ("ideal pullback zone" for the 9 EMA vs
// "equilibrium" for VWAP — Dave's own wording for each), so a shared descriptor
// table would force artificial uniformity or a per-indicator override layer.
// The lock lives HERE instead, over the two arrays.

/** The canonical descriptor head of each bucket, indicator words removed. */
const DESCRIPTOR_HEADS = [
  'Below',
  'At',
  'Near',
  'Above',
  'Extended',
  'Very extended',
  'Blow-off / parabolic',
] as const

/** The canonical range text each label must end with. */
const RANGE_SUFFIXES = [
  '< -0.5%',
  '-0.5% to +0.5%',
  '+0.5% to +2.0%',
  '+2.0% to +5.0%',
  '+5.0% to +10.0%',
  '+10.0% to +20.0%',
  '> +20.0%',
] as const

describe('VWAP ↔ EMA bucket-scheme parity (the cannot-drift lock)', () => {
  it('both bands carry seven buckets', () => {
    expect(VWAP_BUCKETS).toHaveLength(7)
    expect(EMA_BUCKETS).toHaveLength(7)
  })

  it('edges are identical, bucket for bucket', () => {
    expect(VWAP_BUCKETS.map((b) => [b.lo, b.hi])).toEqual(
      EMA_BUCKETS.map((b) => [b.lo, b.hi]),
    )
  })

  it('barValues and extents are identical (same center, same axis weighting)', () => {
    expect(VWAP_BUCKETS.map((b) => b.barValue)).toEqual(
      EMA_BUCKETS.map((b) => b.barValue),
    )
    expect(VWAP_BUCKET_EXTENT).toBe(EMA_BUCKET_EXTENT)
  })

  it('every label starts with the canonical descriptor head (indicator words aside)', () => {
    for (const [i, head] of DESCRIPTOR_HEADS.entries()) {
      expect(VWAP_BUCKETS[i].label.startsWith(head)).toBe(true)
      expect(EMA_BUCKETS[i].label.startsWith(head)).toBe(true)
    }
  })

  it('every label ends with the canonical range text', () => {
    for (const [i, suffix] of RANGE_SUFFIXES.entries()) {
      expect(VWAP_BUCKETS[i].label.endsWith(suffix)).toBe(true)
      expect(EMA_BUCKETS[i].label.endsWith(suffix)).toBe(true)
    }
  })
})
