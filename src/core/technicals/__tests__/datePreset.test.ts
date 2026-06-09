import { describe, it, expect } from 'vitest'
import { rangeForDatePreset } from '../datePreset'

// Fixed reference date: June 9 2026 at local midnight (month is 0-indexed
// → 5). The helper mirrors rangeForQuick's days-1-back convention
// (src/core/performance/dateUtils.ts:89-95): 'today' is zero days back,
// 'ytd' runs from startOfYear(now), and 'custom' yields null so the caller
// drives the from/to fields directly.
const NOW = new Date(2026, 5, 9)

describe('rangeForDatePreset', () => {
  it("'today' → single-day range [now, now]", () => {
    expect(rangeForDatePreset('today', NOW)).toEqual({
      from: '2026-06-09',
      to: '2026-06-09',
    })
  })

  it("'7d' → 6 days back through now (7 inclusive)", () => {
    expect(rangeForDatePreset('7d', NOW)).toEqual({
      from: '2026-06-03',
      to: '2026-06-09',
    })
  })

  it("'30d' → 29 days back through now (30 inclusive, crosses into May)", () => {
    expect(rangeForDatePreset('30d', NOW)).toEqual({
      from: '2026-05-11',
      to: '2026-06-09',
    })
  })

  it("'90d' → 89 days back through now (90 inclusive, crosses into March)", () => {
    expect(rangeForDatePreset('90d', NOW)).toEqual({
      from: '2026-03-12',
      to: '2026-06-09',
    })
  })

  it("'ytd' → startOfYear(now) through now", () => {
    expect(rangeForDatePreset('ytd', NOW)).toEqual({
      from: '2026-01-01',
      to: '2026-06-09',
    })
  })

  it("'custom' → null (caller drives from/to directly)", () => {
    expect(rangeForDatePreset('custom', NOW)).toBeNull()
  })
})
