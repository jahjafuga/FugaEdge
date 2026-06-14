import { describe, it, expect } from 'vitest'
import { isFullyAligned, isPreMarketEntry } from '../alignment'

// The disciplined-entry / full-alignment predicate (§A6/D7 + the v0.2.5
// pre-market amendment). Single source of truth for XP + the Edge Score
// discipline axis + the Technicals tab band.

describe('isFullyAligned — regular-hours entry (the full triple)', () => {
  it('macd + above-VWAP + above-9EMA → aligned', () => {
    expect(isFullyAligned(true, 1.0, 1.0, false)).toBe(true)
  })
  it('VWAP null → NOT aligned (session VWAP required in regular hours)', () => {
    expect(isFullyAligned(true, null, 1.0, false)).toBe(false)
  })
  it('VWAP ≤ 0 → not aligned', () => {
    expect(isFullyAligned(true, -0.5, 1.0, false)).toBe(false)
  })
  it('macd not positive → not aligned', () => {
    expect(isFullyAligned(false, 1.0, 1.0, false)).toBe(false)
    expect(isFullyAligned(null, 1.0, 1.0, false)).toBe(false)
  })
  it('below the 9EMA (null or ≤ 0) → not aligned', () => {
    expect(isFullyAligned(true, 1.0, null, false)).toBe(false)
    expect(isFullyAligned(true, 1.0, -0.3, false)).toBe(false)
  })
})

describe('isFullyAligned — pre-market entry (VWAP is N/A, dropped)', () => {
  it('macd + above-9EMA with VWAP null → ALIGNED (the fix)', () => {
    expect(isFullyAligned(true, null, 1.0, true)).toBe(true)
  })
  it('macd + above-9EMA regardless of VWAP value → aligned', () => {
    expect(isFullyAligned(true, 5.0, 1.0, true)).toBe(true)
    expect(isFullyAligned(true, -2.0, 1.0, true)).toBe(true) // VWAP ignored pre-market
  })
  it('macd not positive → not aligned (MACD still required)', () => {
    expect(isFullyAligned(false, null, 1.0, true)).toBe(false)
    expect(isFullyAligned(null, null, 1.0, true)).toBe(false)
  })
  it('below the 9EMA → not aligned (9EMA still required)', () => {
    expect(isFullyAligned(true, null, null, true)).toBe(false)
    expect(isFullyAligned(true, null, -0.1, true)).toBe(false)
  })
})

describe('isPreMarketEntry — before 09:30 ET', () => {
  it('09:00 ET (EDT 13:00Z) → pre-market', () => {
    expect(isPreMarketEntry('2026-05-15T13:00:00.000Z')).toBe(true)
  })
  it('09:29 ET → pre-market', () => {
    expect(isPreMarketEntry('2026-05-15T13:29:00.000Z')).toBe(true)
  })
  it('09:30 ET exactly → NOT pre-market (the open)', () => {
    expect(isPreMarketEntry('2026-05-15T13:30:00.000Z')).toBe(false)
  })
  it('09:45 ET (the fixture default) → not pre-market', () => {
    expect(isPreMarketEntry('2026-05-15T13:45:00.000Z')).toBe(false)
  })
  it('unparseable → false (regular hours; under-credit direction)', () => {
    expect(isPreMarketEntry('not-a-time')).toBe(false)
  })
})
