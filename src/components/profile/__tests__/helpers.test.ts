import { describe, expect, it } from 'vitest'
import { fmtDollars, initialsFrom, ringFraction } from '../helpers'

// v0.2.5 Phase B Session 4 — pure display helpers for the profile page
// (L23 ring math incl. the level-99 guard; L21 initials fallback).
// Session 5 (2026-06-13): fmtDollars, the shared equity-dollar formatter.

describe('fmtDollars (equity dollar display — D25/L28 surfaces)', () => {
  it('formats whole dollars with comma grouping and no decimals', () => {
    expect(fmtDollars(1_000_000)).toBe('$1,000,000')
    expect(fmtDollars(25_000)).toBe('$25,000')
    expect(fmtDollars(1_000)).toBe('$1,000')
    expect(fmtDollars(0)).toBe('$0')
  })

  it('rounds to the nearest dollar', () => {
    expect(fmtDollars(1234.7)).toBe('$1,235')
    expect(fmtDollars(1234.2)).toBe('$1,234')
  })
})

describe('ringFraction (L23)', () => {
  it('mid-level: intoLevel / (intoLevel + neededForNext)', () => {
    expect(ringFraction(44, 100, 5)).toBeCloseTo(44 / 144, 10)
  })

  it('fresh threshold: 0 into the level → 0', () => {
    expect(ringFraction(0, 304, 10)).toBe(0)
  })

  it('level cap: ring is full regardless of surplus (neededForNext 0)', () => {
    expect(ringFraction(0, 0, 99)).toBe(1)
    expect(ringFraction(46_336, 0, 99)).toBe(1)
  })

  it('defensive zero denominator below the cap → 0, never NaN', () => {
    expect(ringFraction(0, 0, 5)).toBe(0)
  })
})

describe('initialsFrom (L21 fallback)', () => {
  it('two words → two initials, uppercased', () => {
    expect(initialsFrom('lao fuga')).toBe('LF')
  })

  it('one word → one initial', () => {
    expect(initialsFrom('Trader')).toBe('T')
  })

  it('three words → first two initials only', () => {
    expect(initialsFrom('Jah Ja Fuga')).toBe('JJ')
  })

  it('null / empty / whitespace → null (caller renders the icon disc)', () => {
    expect(initialsFrom(null)).toBeNull()
    expect(initialsFrom('')).toBeNull()
    expect(initialsFrom('   ')).toBeNull()
  })
})
