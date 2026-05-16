import { describe, expect, it } from 'vitest'
import { parseFilenameDate } from '../parse-filename'

const NOW = new Date('2026-05-16T12:00:00Z')

describe('parseFilenameDate — existing patterns (regression)', () => {
  it('parses "11thmaytrades.csv"', () => {
    const r = parseFilenameDate('11thmaytrades.csv', NOW)
    expect(r).toEqual({ date: '2026-05-11', parsed: true })
  })

  it('parses "may11.csv"', () => {
    expect(parseFilenameDate('may11.csv', NOW)).toEqual({ date: '2026-05-11', parsed: true })
  })

  it('parses ISO "2026-05-11.csv"', () => {
    expect(parseFilenameDate('trades_2026-05-11.csv', NOW)).toEqual({
      date: '2026-05-11',
      parsed: true,
    })
  })

  it('parses compact ISO "20260511"', () => {
    expect(parseFilenameDate('trades20260511.csv', NOW)).toEqual({
      date: '2026-05-11',
      parsed: true,
    })
  })

  it('returns parsed=false on garbage', () => {
    expect(parseFilenameDate('random-export.csv', NOW)).toEqual({ date: '', parsed: false })
  })
})

describe('parseFilenameDate — Day 2 additions', () => {
  it('parses MM-DD-YYYY ("05-15-2026.csv")', () => {
    expect(parseFilenameDate('05-15-2026.csv', NOW)).toEqual({
      date: '2026-05-15',
      parsed: true,
    })
  })

  it('parses MM_DD_YYYY ("05_15_2026.csv")', () => {
    expect(parseFilenameDate('05_15_2026.csv', NOW)).toEqual({
      date: '2026-05-15',
      parsed: true,
    })
  })

  it('parses MM/DD/YYYY embedded in filename', () => {
    expect(parseFilenameDate('trades 05/15/2026.csv', NOW)).toEqual({
      date: '2026-05-15',
      parsed: true,
    })
  })

  it('parses single-digit M-D-YYYY ("5-1-2026.csv")', () => {
    expect(parseFilenameDate('5-1-2026.csv', NOW)).toEqual({
      date: '2026-05-01',
      parsed: true,
    })
  })

  it('rejects out-of-range month/day', () => {
    expect(parseFilenameDate('13-15-2026.csv', NOW)).toEqual({ date: '', parsed: false })
    expect(parseFilenameDate('05-32-2026.csv', NOW)).toEqual({ date: '', parsed: false })
  })

  it('does not match without a 4-digit year (avoids 2-digit-year ambiguity)', () => {
    // "05-15-26" is ambiguous; we require a 4-digit year for this pattern.
    expect(parseFilenameDate('05-15-26.csv', NOW)).toEqual({ date: '', parsed: false })
  })

  it('prefers the ISO YYYY-MM-DD pattern when both could match', () => {
    // "2026-05-15" matches the ISO pattern first; we should never read it as
    // "20-26-0515" or similar nonsense.
    expect(parseFilenameDate('2026-05-15.csv', NOW)).toEqual({
      date: '2026-05-15',
      parsed: true,
    })
  })
})
