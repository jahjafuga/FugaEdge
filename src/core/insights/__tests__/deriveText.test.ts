import { describe, it, expect } from 'vitest'
import { deriveAction, deriveFinding, splitSentences } from '../heroCards'

// Regression for the EdgeIQ Trading Coach decimal-split bug (2026-06-14): the
// sentence splitter broke on the '.' inside a number, so
// deriveFinding('+0.16R per trade across 14 trades. ...') returned "+0." instead
// of the full finding (visible in the coach as "Positive expectancy +0.16R —
// +0."). The shared splitter must treat a terminator as a boundary ONLY when
// followed by whitespace/end — decimals ($1.5M, +0.16R, 47.5%, 1.3×) are never
// boundaries. The same splitter backs deriveAction, so the fix is one place.

describe('splitSentences / deriveFinding / deriveAction — decimals are not sentence ends', () => {
  it('deriveFinding keeps a leading decimal intact (the exact bug)', () => {
    expect(
      deriveFinding('+0.16R per trade across 14 trades. The math is in your favor.'),
    ).toBe('+0.16R per trade across 14 trades.')
  })

  it('handles $1.5M / 47.5% / 1.3× mid-sentence decimals', () => {
    expect(deriveFinding('Float $1.5M names win 47.5% at 1.3× R. Size up here.')).toBe(
      'Float $1.5M names win 47.5% at 1.3× R.',
    )
  })

  it('deriveAction returns the trailing directive, unchanged on normal bodies', () => {
    expect(
      deriveAction('+0.16R per trade across 14 trades. The math is in your favor.'),
    ).toBe('The math is in your favor.')
    expect(deriveAction('Best: X — 18t, 61% win, $420. Worth a review or removal.')).toBe(
      'Worth a review or removal.',
    )
  })

  it('splitSentences does not split a decimal; splits real sentence ends', () => {
    expect(splitSentences('Win 47.5% on $1.5M floats. Avoid 1.3× setups.')).toEqual([
      'Win 47.5% on $1.5M floats.',
      'Avoid 1.3× setups.',
    ])
  })

  it('single-sentence body: finding empty (no duplicate), action is the sentence', () => {
    expect(deriveFinding('One sentence finding here.')).toBe('')
    expect(deriveAction('One sentence finding here.')).toBe('One sentence finding here.')
  })
})
