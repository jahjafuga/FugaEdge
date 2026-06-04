import { describe, it, expect } from 'vitest'
// RED: module not implemented yet — this is the only unresolved import.
import { computePriceRange } from '../computePriceRange'

// GXAI trade.id=61 fills (unsorted, as stored): min 2.07, max 2.19, band 0.12,
// fillMid 2.13 — measured live.
const GXAI = [2.14, 2.11, 2.07, 2.14, 2.19, 2.12]

describe('computePriceRange', () => {
  it('frames the GXAI fills with proportional padding (padRatio 1.0 → band each side)', () => {
    const r = computePriceRange(GXAI, { padRatio: 1.0, minPadFraction: 0.01 })
    expect(r).not.toBeNull()
    // band 0.12, pad = max(0.12 * 1.0, 2.13 * 0.01 = 0.0213) = 0.12 → [1.95, 2.31]
    expect(r!.minValue).toBeCloseTo(1.95, 4)
    expect(r!.maxValue).toBeCloseTo(2.31, 4)
  })

  it('leaves the fills occupying ~1/3 of the framed height at padRatio 1.0', () => {
    const r = computePriceRange(GXAI, { padRatio: 1.0, minPadFraction: 0.01 })!
    const height = r.maxValue - r.minValue
    expect(height).toBeCloseTo(0.36, 4) // band 0.12 + 2 * 0.12
    expect(0.12 / height).toBeCloseTo(1 / 3, 2) // fills ≈ 33% of the view
  })

  it('uses the proportional pad when fillBand * padRatio exceeds the floor', () => {
    // band 0.4 * 1.0 = 0.4; floor 2.2 * 0.01 = 0.022 → proportional wins
    const r = computePriceRange([2.0, 2.4], { padRatio: 1.0, minPadFraction: 0.01 })!
    expect(r.minValue).toBeCloseTo(1.6, 4)
    expect(r.maxValue).toBeCloseTo(2.8, 4)
  })

  it('falls back to the floor pad for near-coincident fills (no sliver)', () => {
    // band 0.004 * 1.0 = 0.004; floor 2.132 * 0.01 = 0.02132 → floor wins
    const r = computePriceRange([2.13, 2.134], { padRatio: 1.0, minPadFraction: 0.01 })!
    const pad = 2.132 * 0.01
    expect(r.minValue).toBeCloseTo(2.13 - pad, 5)
    expect(r.maxValue).toBeCloseTo(2.134 + pad, 5)
    expect(r.maxValue - r.minValue).toBeGreaterThan(0.004) // wider than the raw band
  })

  it('handles a single fill with a symmetric floor window centered on the fill', () => {
    // band 0, floor 2.14 * 0.01 = 0.0214 → [2.1186, 2.1614], midpoint 2.14
    const r = computePriceRange([2.14], { padRatio: 1.0, minPadFraction: 0.01 })!
    expect(r.minValue).toBeCloseTo(2.1186, 5)
    expect(r.maxValue).toBeCloseTo(2.1614, 5)
    expect((r.minValue + r.maxValue) / 2).toBeCloseTo(2.14, 6)
  })

  it('returns null for an empty fills array', () => {
    expect(computePriceRange([])).toBeNull()
  })

  it('honors a padRatio override', () => {
    // band 0.2 * 0.5 = 0.1; floor 2.1 * 0.01 = 0.021 → proportional wins
    const r = computePriceRange([2.0, 2.2], { padRatio: 0.5, minPadFraction: 0.01 })!
    expect(r.minValue).toBeCloseTo(1.9, 4)
    expect(r.maxValue).toBeCloseTo(2.3, 4)
  })

  it('honors a minPadFraction override (floor) for coincident fills', () => {
    // band 0, minPadFraction 0.05 → floor 2.0 * 0.05 = 0.1 → [1.9, 2.1]
    const r = computePriceRange([2.0, 2.0], { padRatio: 1.0, minPadFraction: 0.05 })!
    expect(r.minValue).toBeCloseTo(1.9, 4)
    expect(r.maxValue).toBeCloseTo(2.1, 4)
  })

  it('is order-independent (true min/max regardless of input order)', () => {
    const a = computePriceRange([2.07, 2.19, 2.12], { padRatio: 1.0, minPadFraction: 0.01 })!
    const b = computePriceRange([2.19, 2.12, 2.07], { padRatio: 1.0, minPadFraction: 0.01 })!
    expect(a.minValue).toBeCloseTo(b.minValue, 6)
    expect(a.maxValue).toBeCloseTo(b.maxValue, 6)
  })

  it('applies the defaults (padRatio 1.0, minPadFraction 0.01) when opts are omitted', () => {
    const withDefaults = computePriceRange(GXAI)
    const explicit = computePriceRange(GXAI, { padRatio: 1.0, minPadFraction: 0.01 })
    expect(withDefaults).toEqual(explicit)
  })
})
