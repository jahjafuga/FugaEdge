import { describe, it, expect } from 'vitest'
import { ema9DistanceLabel, isExtendedEntry } from '../ema9DistanceBuckets'

// Bug C — the Momentum 9-EMA surfaces now share emaBuckets' canonical SIGNED
// 7-band scheme. djsevans's key argument: +2% is still a good pullback, so
// "extended" must not start until +5%. And signed means a NEGATIVE distance is
// "below the 9 EMA / broken trend", NOT "extended" (the absolute -> signed fix).

describe('ema9DistanceLabel (signed, canonical 7-band)', () => {
  it('+2.5% -> Above EMA (trending), NOT extended (the core djsevans fix)', () => {
    expect(ema9DistanceLabel(2.5)).toBe('Above EMA (trending) +2.0% to +5.0%')
  })
  it('+5.0% -> Extended (left-inclusive boundary)', () => {
    expect(ema9DistanceLabel(5.0)).toBe('Extended +5.0% to +10.0%')
  })
  it('+4.99% -> Above EMA (trending) (right-exclusive boundary)', () => {
    expect(ema9DistanceLabel(4.99)).toBe('Above EMA (trending) +2.0% to +5.0%')
  })
  it('-5.0% -> Below 9 EMA / broken trend (signed: negative is below, not extended)', () => {
    expect(ema9DistanceLabel(-5.0)).toBe('Below 9 EMA / broken trend < -0.5%')
  })
  it('+10.0% -> Very extended; +20.0% -> Blow-off / parabolic', () => {
    expect(ema9DistanceLabel(10.0)).toBe('Very extended +10.0% to +20.0%')
    expect(ema9DistanceLabel(20.0)).toBe('Blow-off / parabolic > +20.0%')
  })
  it('null distance -> null (caller skips it)', () => {
    expect(ema9DistanceLabel(null)).toBeNull()
  })
})

describe('isExtendedEntry (signed, >= +5% per the EXTENDED band edge)', () => {
  it('+6% -> extended', () => {
    expect(isExtendedEntry(6)).toBe(true)
  })
  it('-6% -> NOT extended (below the 9 EMA — the signed conversion)', () => {
    expect(isExtendedEntry(-6)).toBe(false)
  })
  it('+3% -> not extended (clean side)', () => {
    expect(isExtendedEntry(3)).toBe(false)
  })
  it('+5% -> extended (left-inclusive boundary)', () => {
    expect(isExtendedEntry(5)).toBe(true)
  })
  it('null -> not extended', () => {
    expect(isExtendedEntry(null)).toBe(false)
  })
})
