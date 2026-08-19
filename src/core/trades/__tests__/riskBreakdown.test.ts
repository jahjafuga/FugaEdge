// v0.2.7 — R and its denominator, moved into core.
//
// This file was written as a CHARACTERISATION of the behaviour as it stands, so
// the move that carries it out of electron/lib can be proven to change nothing.
// The numbers in T3 are the ones measured on the live book during the auto-stop
// verify, and they are wrong on purpose: they record what the code does today,
// which is the only way the next commit's change is visible as a change.

import { describe, expect, it } from 'vitest'
import {
  computeRMultiple,
  computeRiskBreakdown,
  type RiskParams,
} from '../riskBreakdown'

const base: RiskParams = {
  side: 'long',
  stop_source: null,
  first_entry_price: null,
  avg_buy_price: 10,
  avg_sell_price: 11,
  shares_bought: 100,
  shares_sold: 100,
  planned_risk: null,
  planned_stop_loss_price: null,
}
const p = (over: Partial<RiskParams>): RiskParams => ({ ...base, ...over })

describe('T1 the legacy dollar path', () => {
  it('divides by the planned risk when one is set', () => {
    expect(computeRMultiple(200, 100)).toBe(2)
  })

  it('and refuses a zero, a negative or an absent one rather than dividing', () => {
    expect(computeRMultiple(200, 0)).toBeNull()
    expect(computeRMultiple(200, -50)).toBeNull()
    expect(computeRMultiple(200, null)).toBeNull()
    expect(computeRMultiple(200, undefined)).toBeNull()
    expect(computeRMultiple(200, Number.NaN)).toBeNull()
  })
})

describe('T2 the stop-price path wins when a stop is set', () => {
  it('risk per share is the gap from the entry to the stop', () => {
    const r = computeRiskBreakdown(200, p({ planned_stop_loss_price: 9.5 }))
    expect(r.risk_per_share).toBeCloseTo(0.5, 10)
    expect(r.total_risk).toBeCloseTo(50, 10)
    expect(r.r_multiple).toBeCloseTo(4, 10)
  })

  it('a short measures from its sell side', () => {
    const r = computeRiskBreakdown(
      100,
      p({ side: 'short', avg_sell_price: 10, avg_buy_price: 9, planned_stop_loss_price: 10.5 }),
    )
    expect(r.risk_per_share).toBeCloseTo(0.5, 10)
  })

  it('falls back to the legacy dollar risk when there is no stop', () => {
    const r = computeRiskBreakdown(200, p({ planned_risk: 100 }))
    expect(r.risk_per_share).toBeNull()
    expect(r.total_risk).toBe(100)
    expect(r.r_multiple).toBe(2)
  })

  it('and reports nothing rather than dividing by zero', () => {
    // A stop exactly at the entry: risk per share is zero and R would be infinite.
    const r = computeRiskBreakdown(200, p({ planned_stop_loss_price: 10 }))
    expect(r.risk_per_share).toBeNull()
    expect(r.r_multiple).toBeNull()
  })
})

describe('T4 the denominator follows the stop PROVENANCE', () => {
  // NCRA id 4 from the live book, 2026-07-29. First entry 2.70, average 3.0533,
  // and a stop the auto-fill derived as 3% off the FIRST entry: 2.619.
  //
  // Measured during the auto-stop verify, this trade read 14.22% risk against a
  // setting that said 3.00% — nearly five times over — because the risk was taken
  // from the average while the stop was taken from the first fill. A derived stop
  // now measures against the price it was derived FROM.
  const NCRA = p({
    avg_buy_price: 3.0533,
    avg_sell_price: 0,
    shares_bought: 100,
    shares_sold: 100,
    planned_stop_loss_price: 2.619,
    first_entry_price: 2.7,
  })

  it('a DERIVED stop measures from the first entry — 14.22% becomes 3.00%', () => {
    const r = computeRiskBreakdown(0, { ...NCRA, stop_source: 'auto' })
    // 2.70 - 2.619 = 0.081 per share, which is exactly the 3.00% it was derived at.
    expect(r.risk_per_share).toBeCloseTo(0.081, 10)
    const pct = ((r.risk_per_share as number) / 2.7) * 100
    expect(pct).toBeCloseTo(3.0, 6)
  })

  it('a TYPED stop still measures from the average — that behaviour is unchanged', () => {
    const r = computeRiskBreakdown(0, { ...NCRA, stop_source: 'manual' })
    expect(r.risk_per_share).toBeCloseTo(0.4343, 4)
    const pct = ((r.risk_per_share as number) / NCRA.avg_buy_price) * 100
    expect(pct).toBeCloseTo(14.22, 1)
  })

  it('and so does a stop with no provenance at all', () => {
    // Every trade in the book before the provenance column existed.
    const r = computeRiskBreakdown(0, { ...NCRA, stop_source: null })
    expect(r.risk_per_share).toBeCloseTo(0.4343, 4)
  })

  it('a derived stop with NO first entry falls back rather than inventing one', () => {
    const r = computeRiskBreakdown(0, {
      ...NCRA,
      stop_source: 'auto',
      first_entry_price: null,
    })
    // It cannot know the price it was derived from, so it reports the average
    // reading rather than a fabricated one.
    expect(r.risk_per_share).toBeCloseTo(0.4343, 4)
  })

  it('the total and the R follow the same denominator', () => {
    const auto = computeRiskBreakdown(810, { ...NCRA, stop_source: 'auto' })
    expect(auto.total_risk).toBeCloseTo(8.1, 8)   // 0.081 x 100 shares
    expect(auto.r_multiple).toBeCloseTo(100, 6)
    const manual = computeRiskBreakdown(810, { ...NCRA, stop_source: 'manual' })
    expect(manual.total_risk).toBeCloseTo(43.43, 6)
    expect(manual.r_multiple).not.toBeCloseTo(100, 6)
  })
})
