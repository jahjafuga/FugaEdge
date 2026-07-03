// Stage 3 beat 3.5 — the allocation-line math: each anchored non-sim
// account's share of the POSITIVE total, as fractions for the segmented
// bar. Presentation math, so it lives in src/lib (not src/core). Rules:
// negative balances clamp to zero width (they stay priced in the breakdown
// — the bar never lies about composition); a non-positive signed total or
// an empty set hides the bar entirely; a single account is one full
// segment.

import { describe, it, expect } from 'vitest'
import { allocationSegments } from '../allocation'

describe('allocationSegments', () => {
  it('two positive balances -> proportional fractions summing to 1', () => {
    const segs = allocationSegments([
      { id: 'A', balance: 1000 },
      { id: 'B', balance: 3000 },
    ])
    expect(segs).toEqual([
      { id: 'A', fraction: 0.25 },
      { id: 'B', fraction: 0.75 },
    ])
    expect(segs.reduce((s, x) => s + x.fraction, 0)).toBeCloseTo(1)
  })

  it('a negative balance clamps to ZERO width; the others re-proportion over the positive sum', () => {
    const segs = allocationSegments([
      { id: 'A', balance: 2000 },
      { id: 'NEG', balance: -500 },
      { id: 'B', balance: 2000 },
    ])
    expect(segs).toEqual([
      { id: 'A', fraction: 0.5 },
      { id: 'NEG', fraction: 0 },
      { id: 'B', fraction: 0.5 },
    ])
  })

  it('a non-positive signed total -> empty (no bar)', () => {
    expect(
      allocationSegments([
        { id: 'A', balance: 100 },
        { id: 'B', balance: -200 },
      ]),
    ).toEqual([])
    expect(allocationSegments([])).toEqual([])
  })

  it('a single account -> one full segment', () => {
    expect(allocationSegments([{ id: 'ONLY', balance: 1037.82 }])).toEqual([
      { id: 'ONLY', fraction: 1 },
    ])
  })
})
