import { describe, expect, it } from 'vitest'

// v0.2.7 — MAKE THE RUN LEGIBLE: the measured half.
//
// A full cold-book run rendered its duration as "3276.0s". The plumbing behind
// the progress bar has been complete since the channel landed; what was missing
// was arithmetic anyone could read.
//
// THE ESTIMATE IS MEASURED, NEVER PREDICTED. Pace is elapsed divided by
// completed — what this run has actually managed — and never the inter-call
// spacing. Two independent reasons, and either alone would settle it:
//
//   1. The shared budget makes real pace variable. A chart open spends from the
//      same ceiling, so a theoretical estimate is wrong exactly when the user is
//      also using the app, which is most of the time.
//   2. The spacing derives from a constant named for a service this code does
//      not call. An estimate built on it would inherit that wrongness silently.
//
// So RP2 does not merely check that some number comes out. It feeds a pace that
// DISAGREES with the derived spacing and asserts the answer follows what was
// observed. Without that disagreement the guard could not tell a measured
// estimate from a theoretical one, which is the only distinction it exists for.
//
// NO FABRICATED DATA. Before the first progress event there is no pace, and at
// completion there is nothing left to wait for. Both return null so the caller
// renders an em-dash. Never a zero, never "calculating…", never a guess — the
// house law for money, applied to time.

import { estimateRemainingMs } from '../refreshEta'
import { duration } from '@/lib/format'

// The spacing a theoretical estimate would have used. Imported nowhere in the
// module under test — it appears ONLY here, as the wrong answer RP2 rules out.
const DERIVED_SPACING_MS = 12_000

// ─── RP1 : DURATION IN HUMAN UNITS ───────────────────────────────────────────

describe('RP1 a run duration renders in human units', () => {
  // Characterizes the formatter Settings now shares with the rest of the app
  // rather than a second one written for this screen. A second formatter is how
  // two of them drift.
  it('under a minute renders seconds', () => {
    expect(duration(0)).toBe('0s')
    expect(duration(9)).toBe('9s')
    expect(duration(59)).toBe('59s')
  })

  it('the boundary EXACTLY at sixty seconds crosses over to minutes', () => {
    expect(
      duration(60),
      'sixty seconds still rendered as seconds — the crossover is off by one',
    ).toBe('1m')
  })

  it('above a minute renders minutes and seconds', () => {
    expect(duration(61)).toBe('1m 1s')
    expect(duration(150)).toBe('2m 30s')
  })

  it('and the cold-book run that started this beat reads as time, not a float', () => {
    // The measured case: a full run rendered "3276.0s" and told the user nothing.
    expect(duration(3276)).toBe('54m 36s')
  })

  it('a missing duration is an em-dash, never a zero', () => {
    expect(duration(null)).toBe('—')
    expect(duration(undefined)).toBe('—')
  })
})

// ─── RP2 : THE ESTIMATE IS MEASURED, NOT PREDICTED ───────────────────────────

describe('RP2 the estimate follows OBSERVED pace, not the spacing constant', () => {
  it('a pace that disagrees with the spacing is believed', () => {
    // Five done in ten seconds is two seconds each — six times faster than the
    // derived spacing. A theoretical estimate would say five remaining times the
    // spacing; a measured one says five times the pace actually achieved.
    const elapsedMs = 10_000
    const completed = 5
    const total = 10

    const measured = estimateRemainingMs(elapsedMs, completed, total)
    const theoretical = (total - completed) * DERIVED_SPACING_MS

    expect(measured, 'the estimate is not (elapsed / completed) x remaining').toBe(10_000)
    expect(
      measured,
      'the estimate matched the spacing constant — it is predicted, not measured, ' +
        'and will be wrong whenever anything else is spending from the budget',
    ).not.toBe(theoretical)
  })

  it('and a SLOWER-than-spacing pace is believed too, in the other direction', () => {
    // The disagreement has to cut both ways or the guard would pass for an
    // implementation that merely clamped to the spacing.
    const measured = estimateRemainingMs(100_000, 2, 6)
    expect(measured, 'fifty seconds each, four remaining').toBe(200_000)
    expect(measured).toBeGreaterThan((6 - 2) * DERIVED_SPACING_MS)
  })

  it('scales with what is left, not with what is done', () => {
    // Same pace, different remainder.
    expect(estimateRemainingMs(10_000, 5, 10)).toBe(10_000)
    expect(estimateRemainingMs(10_000, 5, 15)).toBe(20_000)
  })
})

// ─── RP3 : NO FABRICATED DATA BEFORE THE FIRST EVENT ─────────────────────────

describe('RP3 before the first progress event there is no estimate', () => {
  it('nothing completed yet is null, not zero', () => {
    expect(
      estimateRemainingMs(5_000, 0, 40),
      'a zero here renders as "0s left" and promises an instant finish',
    ).toBeNull()
  })

  it('and no total yet is null too', () => {
    expect(estimateRemainingMs(5_000, 0, 0)).toBeNull()
  })
})

// ─── RP4 : THE DISCRIMINATOR ─────────────────────────────────────────────────

describe('RP4 at completion the estimate is absent, not zero', () => {
  // Without this, every case above passes for a function that returns zero
  // whenever it is unsure.
  it('completed equal to total is null', () => {
    expect(
      estimateRemainingMs(60_000, 40, 40),
      'the estimate rendered a zero at the finish line instead of going away',
    ).toBeNull()
  })

  it('and completed somehow past total is null as well', () => {
    expect(estimateRemainingMs(60_000, 41, 40)).toBeNull()
  })

  it('but one short of the total still estimates', () => {
    // The companion: RP4 must not pass for a function that always returns null.
    expect(estimateRemainingMs(39_000, 39, 40)).toBe(1_000)
  })
})

// ─── RP4b : NONSENSE IN, NULL OUT ────────────────────────────────────────────

describe('RP4b unusable inputs yield no estimate', () => {
  it('a negative or non-finite elapsed is null', () => {
    expect(estimateRemainingMs(-1, 5, 10)).toBeNull()
    expect(estimateRemainingMs(Number.NaN, 5, 10)).toBeNull()
    expect(estimateRemainingMs(Number.POSITIVE_INFINITY, 5, 10)).toBeNull()
  })
})
