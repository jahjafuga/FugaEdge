import { describe, it, expect } from 'vitest'
import { suggestTierForPlaybookName } from '../tierSeed'

describe('suggestTierForPlaybookName', () => {
  it('Micro Pullback variants → A+', () => {
    expect(suggestTierForPlaybookName('Micro Pullback')).toBe('A+')
    expect(suggestTierForPlaybookName('Micro Pullback on Breaking News')).toBe('A+')
    expect(suggestTierForPlaybookName('micro pullback')).toBe('A+')
  })

  it('Bull Flag 1-min variants → A+', () => {
    expect(suggestTierForPlaybookName('Bull Flag 1min Setup')).toBe('A+')
    expect(suggestTierForPlaybookName('Bull Flag 1-min')).toBe('A+')
    expect(suggestTierForPlaybookName('Bull Flag 1 min Setup')).toBe('A+')
  })

  it('Bull Flag 5-min variants → A', () => {
    expect(suggestTierForPlaybookName('Bull Flag 5min Setup')).toBe('A')
    expect(suggestTierForPlaybookName('Bull Flag 5-min')).toBe('A')
  })

  it('plain "Bull Flag" without timeframe → A', () => {
    expect(suggestTierForPlaybookName('Bull Flag')).toBe('A')
  })

  it('1-min Pullback (project default) → A+', () => {
    expect(suggestTierForPlaybookName('1-min Pullback')).toBe('A+')
  })

  it('5-min Pullback (project default) → A', () => {
    expect(suggestTierForPlaybookName('5-min Pullback')).toBe('A')
  })

  it('VWAP Break / First Pullback to VWAP / 9EMA dip → B', () => {
    expect(suggestTierForPlaybookName('VWAP Break')).toBe('B')
    expect(suggestTierForPlaybookName('First Pullback to VWAP')).toBe('B')
    expect(suggestTierForPlaybookName('Dip Trade on 9EMA')).toBe('B')
  })

  it('returns null for unknown names (caller leaves them at default B)', () => {
    expect(suggestTierForPlaybookName('ABCD')).toBeNull()
    expect(suggestTierForPlaybookName('Parabolic Short')).toBeNull()
    expect(suggestTierForPlaybookName('Halt Resume Long')).toBeNull()
    expect(suggestTierForPlaybookName('Something Random')).toBeNull()
  })

  it('priority order: Micro Pullback beats Bull Flag, 1m variant beats generic', () => {
    // A name containing both phrases routes through the most specific
    // match first; the seed should pick A+ here, not A.
    expect(
      suggestTierForPlaybookName('Bull Flag 1min Micro Pullback Combo'),
    ).toBe('A+')
  })
})
