// Tests for the display helpers in src/lib/format.ts.
//
// compactShares coverage targets the Day 8 number-formatting spec
// (docs/plans/v0.2.0-universal-import.md): the bucket boundaries and the
// 2-decimal M format — "1.47M", not the old lossy "1.5M". The parseInput
// round-trip block guards FloatEditor, whose editable field is seeded with
// int(value): a focus+blur with no edit must return the float unchanged —
// the old compactShares seed silently rounded it on commit.
//
// The percent block covers percent() — the 0..1-fraction → percent-string
// helper, with the 1-decimal default and the decimals override.
//
// The timezone block covers easternToUtc / localEasternToUtc / formatEastern —
// the Day 8.5 Eastern↔UTC conversion helpers (DST inference, pre-market,
// after-hours date-rollover, and the localEasternToUtc⇄formatEastern round
// trip). No callers are wired yet — the parsers flip in Day 8.5 Commit B.

import { describe, expect, it } from 'vitest'
import {
  compactShares,
  easternToUtc,
  formatEastern,
  formatPnlRatio,
  formatProfitFactor,
  int,
  localEasternToUtc,
  percent,
  utcToEasternParts,
} from '../format'
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

describe('percent — 0..1 fraction to percent string', () => {
  it('formats a fraction with 1 decimal by default', () => {
    expect(percent(0)).toBe('0.0%')
    expect(percent(0.5)).toBe('50.0%')
    expect(percent(0.625)).toBe('62.5%')
    expect(percent(1)).toBe('100.0%')
  })

  it('does not clamp fractions outside 0..1', () => {
    expect(percent(-0.25)).toBe('-25.0%')
    expect(percent(2.5)).toBe('250.0%')
  })

  it('honours the optional decimals override', () => {
    expect(percent(0.6667, 2)).toBe('66.67%')
    expect(percent(0.5, 0)).toBe('50%')
  })

  it('returns the em-dash sentinel for null and invalid input', () => {
    expect(percent(null)).toBe('—')
    expect(percent(undefined)).toBe('—')
    expect(percent(Number.NaN)).toBe('—')
    expect(percent(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('easternToUtc — Eastern wall-clock + explicit offset → UTC ISO', () => {
  it('applies the EDT offset (-240)', () => {
    expect(easternToUtc('2026-07-15', '09:30:00', -240)).toBe('2026-07-15T13:30:00Z')
    expect(easternToUtc('2026-05-14', '06:54:05', -240)).toBe('2026-05-14T10:54:05Z')
  })

  it('applies the EST offset (-300)', () => {
    expect(easternToUtc('2026-12-15', '09:30:00', -300)).toBe('2026-12-15T14:30:00Z')
  })

  it('rolls the date forward when the offset crosses midnight UTC', () => {
    expect(easternToUtc('2026-07-15', '20:00:00', -240)).toBe('2026-07-16T00:00:00Z')
  })
})

describe('localEasternToUtc — Eastern wall-clock → UTC ISO, DST inferred', () => {
  it('converts ordinary market hours (summer EDT / winter EST)', () => {
    expect(localEasternToUtc('2026-07-15', '09:30:00')).toBe('2026-07-15T13:30:00Z')
    expect(localEasternToUtc('2026-01-15', '09:30:00')).toBe('2026-01-15T14:30:00Z')
  })

  it('converts pre-market hours', () => {
    expect(localEasternToUtc('2026-07-15', '04:00:00')).toBe('2026-07-15T08:00:00Z')
    expect(localEasternToUtc('2026-01-15', '04:00:00')).toBe('2026-01-15T09:00:00Z')
  })

  it('rolls the date forward for after-hours times', () => {
    expect(localEasternToUtc('2026-07-15', '20:00:00')).toBe('2026-07-16T00:00:00Z')
  })

  it('picks the correct offset on DST-transition dates', () => {
    // 2026-03-08 spring-forward, 2026-11-01 fall-back — both Sundays (markets
    // closed), so this is correctness hygiene, not a real-data path. 14:00 is
    // unambiguously EDT / EST respectively.
    expect(localEasternToUtc('2026-03-08', '14:00:00')).toBe('2026-03-08T18:00:00Z')
    expect(localEasternToUtc('2026-11-01', '14:00:00')).toBe('2026-11-01T19:00:00Z')
    // Pre-market on spring-forward day: 04:00 ET is already EDT (the 02:00→
    // 03:00 jump is past). The provisional-as-UTC instant lands before the
    // transition — this exercises the two-step offset re-probe.
    expect(localEasternToUtc('2026-03-08', '04:00:00')).toBe('2026-03-08T08:00:00Z')
  })
})

describe('formatEastern — UTC ISO → Eastern wall-clock string', () => {
  it('renders time-only by default', () => {
    expect(formatEastern('2026-07-15T13:30:00Z')).toBe('09:30:00')
    expect(formatEastern('2026-01-15T14:30:00Z')).toBe('09:30:00')
  })

  it('renders date + time with { withDate: true }', () => {
    expect(formatEastern('2026-07-15T13:30:00Z', { withDate: true })).toBe(
      '2026-07-15T09:30:00',
    )
  })

  it('un-wraps a UTC date rollover back to the Eastern day', () => {
    // 00:00 UTC 2026-07-16 is 20:00 EDT 2026-07-15.
    expect(formatEastern('2026-07-16T00:00:00Z', { withDate: true })).toBe(
      '2026-07-15T20:00:00',
    )
  })

  it('round-trips localEasternToUtc', () => {
    const cases = [
      ['2026-07-15', '09:30:00'],
      ['2026-01-15', '14:45:30'],
      ['2026-07-15', '20:00:00'],
      ['2026-03-08', '04:00:00'],
    ] as const
    for (const [date, time] of cases) {
      expect(formatEastern(localEasternToUtc(date, time))).toBe(time)
      expect(
        formatEastern(localEasternToUtc(date, time), { withDate: true }),
      ).toBe(`${date}T${time}`)
    }
  })

  it('returns the em-dash sentinel for unparseable input', () => {
    expect(formatEastern('not-a-timestamp')).toBe('—')
  })
})

describe('utcToEasternParts — UTC ISO → numeric Eastern wall-clock parts', () => {
  it('converts ordinary EDT market hours', () => {
    expect(utcToEasternParts('2026-07-15T13:30:00Z')).toEqual({
      year: 2026, month: 7, day: 15, hour: 9, minute: 30, second: 0,
    })
  })

  it('converts ordinary EST market hours', () => {
    expect(utcToEasternParts('2026-01-15T14:30:00Z')).toEqual({
      year: 2026, month: 1, day: 15, hour: 9, minute: 30, second: 0,
    })
  })

  it('rolls back to the previous Eastern day for an after-hours UTC instant', () => {
    // 00:00 UTC 2026-07-16 is 20:00 EDT 2026-07-15 — the date part must
    // resolve to the Eastern calendar day, not the UTC one.
    expect(utcToEasternParts('2026-07-16T00:00:00Z')).toEqual({
      year: 2026, month: 7, day: 15, hour: 20, minute: 0, second: 0,
    })
  })

  it('returns null for unparseable input', () => {
    expect(utcToEasternParts('not-a-timestamp')).toBeNull()
    expect(utcToEasternParts('')).toBeNull()
  })

  it('agrees with formatEastern (the string wrapper builds on it)', () => {
    const p = utcToEasternParts('2026-07-15T13:30:00Z')!
    expect(formatEastern('2026-07-15T13:30:00Z')).toBe(
      `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')}`,
    )
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

// v0.2.2 — smoke-found 2026-05-30: typing `1.5M` in the Trade Detail Modal's
// Float field, then reopening the modal, showed the field as `2` — not
// `1,500,000`. The bug surface is the parser silently treating a bare
// decimal as a literal share count and rounding it: `Math.round(1.5 * 1) = 2`.
//
// Honest framing — the user case shape: the user reported "1.5M" but the
// Node trace shows that exact string parses correctly to 1,500,000. The
// only inputs that produce 2 are bare decimals (no suffix detected). So
// either the M wasn't typed (or wasn't registered), or some upstream path
// stripped it. Either way, the LOSSY conversion is the failure: any bare
// decimal smaller than the K bucket boundary is almost certainly user
// error (forgot the suffix), and silently rounding to 2 shares corrupts
// data. The integer-only contract should reject bare decimals — null
// leaves the field at its prior value, no silent save, no surprise.
describe('FloatEditor parseInput — bare-decimal honesty (smoke-found 2026-05-30)', () => {
  it('parses suffixed decimal forms to the full magnitude (HONEST suffix application)', () => {
    expect(parseInput('1.5M')).toBe(1_500_000)
    expect(parseInput('1.5m')).toBe(1_500_000)
    expect(parseInput('1.2K')).toBe(1_200)
  })

  it('parses raw integers as-is (no surprise transformation)', () => {
    expect(parseInput('132507')).toBe(132_507)
    expect(parseInput('850')).toBe(850)
    expect(parseInput('1500000')).toBe(1_500_000)
  })

  it('REJECTS bare decimals — must NOT silently round to a nonsense share count', () => {
    // The reported bug: 1.5 → 2 (rounding 1.5 shares to 2). Recommend null
    // (reject) so the field stays at its prior value rather than saving a
    // value the user almost certainly didn't intend. Bare decimals are
    // ambiguous: "1.5" looks more like a forgotten-suffix typo than a
    // genuine "1 or 2 shares" intent. Integers stay legal (850 = 850).
    expect(parseInput('1.5')).toBeNull()
    expect(parseInput('0.5')).toBeNull()
    expect(parseInput('3.14')).toBeNull()
    // Edge: an explicit ".5M" SHOULD still work (suffixed shorthand).
    expect(parseInput('.5M')).toBe(500_000)
  })
})

describe('formatProfitFactor — single render path for Σ wins / |Σ losses|', () => {
  // Day 2 of the v0.2.2 sprint promotes the inline pf() helper from
  // FullStatsTable.tsx into a shared util so the new day-scoped Performance
  // tab and the existing whole-account view render the same string.

  it('formats a finite profit factor to 2 decimal places', () => {
    expect(formatProfitFactor(2.5)).toBe('2.50')
    expect(formatProfitFactor(0)).toBe('0.00') // all-losing day is a real outcome
    expect(formatProfitFactor(1.234)).toBe('1.23')
  })

  it('renders Infinity as "∞" (winners but no losers — a real outcome, not an error)', () => {
    expect(formatProfitFactor(Infinity)).toBe('∞')
  })

  it('renders null as the em-dash placeholder (no decided trades on the day)', () => {
    expect(formatProfitFactor(null)).toBe('—')
  })
})

describe('formatPnlRatio — avg win ÷ |avg loss| (distinct from profit factor)', () => {
  it('formats a finite ratio to 2 decimal places', () => {
    expect(formatPnlRatio(2.5)).toBe('2.50')
    expect(formatPnlRatio(0)).toBe('0.00') // only-losers day is a real outcome
    expect(formatPnlRatio(1.234)).toBe('1.23')
  })

  it('renders Infinity as "∞" (winners but no losers)', () => {
    expect(formatPnlRatio(Infinity)).toBe('∞')
  })

  it('renders null as the em-dash placeholder (no decided trades)', () => {
    expect(formatPnlRatio(null)).toBe('—')
  })
})
