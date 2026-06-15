import { describe, it, expect } from 'vitest'
import { tierForScore } from '../tier'

// v0.2.5 EdgeIQ daily-debrief — pure EdgeScore → named-tier mapping. Bands are
// contiguous over 0–100 and LEFT-INCLUSIVE on their min (a score of 40 is
// Leaking, not Critical). Out-of-range clamps to the nearest end; a non-finite
// score falls back to Critical (an untrustworthy score is never silently
// promoted to Elite).

describe('tierForScore', () => {
  it('maps each band by its left-inclusive boundaries', () => {
    expect(tierForScore(0).name).toBe('Critical')
    expect(tierForScore(39).name).toBe('Critical')
    expect(tierForScore(40).name).toBe('Leaking')
    expect(tierForScore(49).name).toBe('Leaking')
    expect(tierForScore(50).name).toBe('Unstable')
    expect(tierForScore(59).name).toBe('Unstable')
    expect(tierForScore(60).name).toBe('Improving')
    expect(tierForScore(69).name).toBe('Improving')
    expect(tierForScore(70).name).toBe('Developing')
    expect(tierForScore(79).name).toBe('Developing')
    expect(tierForScore(80).name).toBe('Consistent')
    expect(tierForScore(84).name).toBe('Consistent')
    expect(tierForScore(85).name).toBe('Advanced')
    expect(tierForScore(89).name).toBe('Advanced')
    expect(tierForScore(90).name).toBe('Exceptional')
    expect(tierForScore(94).name).toBe('Exceptional')
    expect(tierForScore(95).name).toBe('Elite')
    expect(tierForScore(100).name).toBe('Elite')
  })

  it('returns the band endpoints alongside the name', () => {
    expect(tierForScore(82)).toEqual({ name: 'Consistent', min: 80, max: 84 })
    expect(tierForScore(97)).toEqual({ name: 'Elite', min: 95, max: 100 })
  })

  it('clamps out-of-range scores to the nearest end', () => {
    expect(tierForScore(105).name).toBe('Elite')
    expect(tierForScore(-5).name).toBe('Critical')
  })

  it('returns Critical for non-finite scores (safe default)', () => {
    expect(tierForScore(NaN).name).toBe('Critical')
    expect(tierForScore(Infinity).name).toBe('Critical')
    expect(tierForScore(-Infinity).name).toBe('Critical')
  })
})
