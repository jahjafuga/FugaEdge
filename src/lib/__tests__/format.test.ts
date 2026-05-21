// Tests for the display helpers in src/lib/format.ts.
//
// compactShares coverage targets the Day 8 number-formatting spec
// (docs/plans/v0.2.0-universal-import.md): the bucket boundaries and the
// 2-decimal M format — "1.47M", not the old lossy "1.5M". The parseInput
// round-trip block guards FloatEditor, whose editable field is seeded with
// int(value): a focus+blur with no edit must return the float unchanged —
// the old compactShares seed silently rounded it on commit.

import { describe, expect, it } from 'vitest'
import { compactShares, int } from '../format'
import { parseInput } from '@/components/trades/FloatEditor'

describe('compactShares — bucket boundaries and decimals', () => {
  it('formats the 1M–99.99M bucket with 2 decimals', () => {
    expect(compactShares(1_470_000)).toBe('1.47M') // headline — was "1.5M"
    expect(compactShares(5_200_000)).toBe('5.20M')
  })

  it('treats exactly 1,000,000 as the start of the M bucket', () => {
    expect(compactShares(1_000_000)).toBe('1.00M')
  })

  it('switches to whole M at exactly 100,000,000', () => {
    expect(compactShares(100_000_000)).toBe('100M')
    expect(compactShares(150_000_000)).toBe('150M')
  })

  it('switches to 2-decimal B at exactly 1,000,000,000', () => {
    expect(compactShares(1_000_000_000)).toBe('1.00B')
    expect(compactShares(2_300_000_000)).toBe('2.30B')
  })

  it('formats the K bucket as whole numbers', () => {
    expect(compactShares(450_000)).toBe('450K')
  })

  it('shows sub-1,000 counts as a plain integer', () => {
    expect(compactShares(850)).toBe('850')
  })

  it('rounds honestly at the top of a bucket (accepted edge per spec)', () => {
    // toFixed rounds up within the bucket the raw magnitude selected. These
    // inputs never occur in real float data; the assertions pin which bucket
    // branch ran (the ".00" / absence of decimals proves it).
    expect(compactShares(999_999)).toBe('1000K') // just below 1M → K bucket
    expect(compactShares(99_999_999)).toBe('100.00M') // just below 100M → 2-dec M
    expect(compactShares(999_999_999)).toBe('1000M') // just below 1B → whole M
  })

  it('returns the em-dash sentinel for null, zero, and invalid input', () => {
    expect(compactShares(null)).toBe('—')
    expect(compactShares(undefined)).toBe('—')
    expect(compactShares(0)).toBe('—')
    expect(compactShares(-5)).toBe('—')
    expect(compactShares(Number.NaN)).toBe('—')
    expect(compactShares(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('FloatEditor parseInput — round-trips the int() seed exactly', () => {
  // FloatEditor seeds its editable field with int(value); commit() parses the
  // draft back. A focus+blur with no edit must yield the original value, or
  // onChange fires and silently corrupts the saved float.
  it('parses int()-formatted values back to the exact integer', () => {
    for (const v of [1_470_000, 14_700_000, 523_000_000, 999, 2_300_000_000]) {
      expect(parseInput(int(v))).toBe(v)
    }
  })

  it('still accepts shorthand suffixes (K / M / B, any case)', () => {
    expect(parseInput('1.2M')).toBe(1_200_000)
    expect(parseInput('450k')).toBe(450_000)
    expect(parseInput('1.5B')).toBe(1_500_000_000)
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseInput('')).toBeNull()
    expect(parseInput('   ')).toBeNull()
    expect(parseInput('abc')).toBeNull()
    expect(parseInput('—')).toBeNull()
  })
})
