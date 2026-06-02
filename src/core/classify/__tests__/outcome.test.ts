import { describe, it, expect } from 'vitest'
import {
  classifyOutcome,
  isWin,
  isLoss,
  isScratch,
  sqlIsWin,
  sqlIsLoss,
  sqlIsScratch,
} from '../outcome'
import { SCRATCH_EPSILON, type TradeOutcome } from '@shared/trade-classification'

describe('SCRATCH_EPSILON', () => {
  it('is the locked half-cent tolerance', () => {
    expect(SCRATCH_EPSILON).toBe(0.005)
  })
})

describe('classifyOutcome — boundary table', () => {
  // [net_pnl, expected]. The ±0.005 rows pin the INCLUSIVE boundary; the
  // ±0.0051 rows are the first values that tip into win/loss.
  const cases: Array<[number, TradeOutcome]> = [
    [0, 'scratch'],
    [0.004, 'scratch'],
    [-0.004, 'scratch'],
    [0.005, 'scratch'], // inclusive boundary — exact epsilon is scratch
    [-0.005, 'scratch'], // inclusive boundary
    [0.0051, 'win'], // first value past the boundary
    [-0.0051, 'loss'],
    [1, 'win'],
    [-1, 'loss'],
    [9999, 'win'],
    [-9999, 'loss'],
  ]

  for (const [pnl, expected] of cases) {
    it(`net_pnl ${pnl} → ${expected}`, () => {
      expect(classifyOutcome(pnl)).toBe(expected)
    })
  }

  it('treats NaN as scratch (never a win or loss)', () => {
    expect(classifyOutcome(Number.NaN)).toBe('scratch')
  })

  it('treats +0 and -0 as scratch', () => {
    expect(classifyOutcome(0)).toBe('scratch')
    expect(classifyOutcome(-0)).toBe('scratch')
  })
})

describe('predicates agree with classifyOutcome', () => {
  const samples = [
    0, -0, 0.004, -0.004, 0.005, -0.005, 0.0051, -0.0051, 1, -1, 9999, -9999,
    Number.NaN,
  ]

  for (const pnl of samples) {
    it(`exactly one predicate is true for ${pnl}`, () => {
      const outcome = classifyOutcome(pnl)
      expect(isWin(pnl)).toBe(outcome === 'win')
      expect(isLoss(pnl)).toBe(outcome === 'loss')
      expect(isScratch(pnl)).toBe(outcome === 'scratch')
      // Mutually exclusive + exhaustive: exactly one of the three holds.
      expect([isWin(pnl), isLoss(pnl), isScratch(pnl)].filter(Boolean)).toHaveLength(1)
    })
  }
})

describe('SQL snippets', () => {
  it('default to the net_pnl column', () => {
    expect(sqlIsWin()).toBe('net_pnl > ?')
    expect(sqlIsLoss()).toBe('net_pnl < ?') // bind -SCRATCH_EPSILON at call site
    expect(sqlIsScratch()).toBe('ABS(net_pnl) <= ?')
  })

  it('accept a column override', () => {
    expect(sqlIsWin('t.net_pnl')).toBe('t.net_pnl > ?')
    expect(sqlIsLoss('t.net_pnl')).toBe('t.net_pnl < ?')
    expect(sqlIsScratch('t.net_pnl')).toBe('ABS(t.net_pnl) <= ?')
  })

  it('scratch snippet is inclusive (<=) to mirror classifyOutcome', () => {
    // The in-memory path calls 0.005 a scratch; the SQL must use <=, not <,
    // so a stored net_pnl of exactly the epsilon lands in the same bucket.
    expect(sqlIsScratch()).toContain('<=')
  })
})
