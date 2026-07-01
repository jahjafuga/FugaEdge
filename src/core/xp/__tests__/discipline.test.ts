import { describe, expect, it } from 'vitest'
import { respectedMaxLoss, computeMaxLossIntents } from '../discipline'

// v0.2.5 — the maxloss_respected discipline award (the documented §A2 exception).
// PURE rules only: respectedMaxLoss is the boundary check; computeMaxLossIntents
// gates which days earn the award. No electron/db here — the P&L reading lives
// in electron/xp/pnl-facts.ts.

describe('respectedMaxLoss', () => {
  it('respected: a loss smaller than the limit', () => {
    expect(respectedMaxLoss(-15, 20)).toBe(true)
  })
  it('breached: a loss larger than the limit', () => {
    expect(respectedMaxLoss(-25, 20)).toBe(false)
  })
  it('exactly at the limit is respected (inclusive >= -limit)', () => {
    expect(respectedMaxLoss(-20, 20)).toBe(true)
  })
  it('no limit set (<= 0) is never respected', () => {
    expect(respectedMaxLoss(-15, 0)).toBe(false)
    expect(respectedMaxLoss(50, 0)).toBe(false)
  })
  it('a profit day is within the limit', () => {
    expect(respectedMaxLoss(120, 20)).toBe(true)
  })
})

describe('computeMaxLossIntents', () => {
  const NOW = '2026-06-30T12:00:00.000Z' // "today" = 2026-06-30
  const LIMIT = 20
  const run = (
    pnl: Map<string, { netPnl: number; tradeCount: number }>,
    existing: Set<string> = new Set(),
  ) => computeMaxLossIntents(pnl, LIMIT, existing, NOW)

  it('awards a past day with trades that stayed within the limit', () => {
    const pnl = new Map([['2026-06-29', { netPnl: -10, tradeCount: 3 }]])
    expect(run(pnl)).toEqual([
      {
        event_type: 'maxloss_respected',
        xp: 25,
        idempotency_key: 'maxloss_respected:2026-06-29',
        source_ref: '2026-06-29',
      },
    ])
  })

  it("skips today's date (not yet closed)", () => {
    const pnl = new Map([['2026-06-30', { netPnl: -5, tradeCount: 2 }]])
    expect(run(pnl)).toEqual([])
  })

  it('skips a no-trade day (no discipline exercised)', () => {
    const pnl = new Map([['2026-06-28', { netPnl: 0, tradeCount: 0 }]])
    expect(run(pnl)).toEqual([])
  })

  it('skips a day that breached the limit', () => {
    const pnl = new Map([['2026-06-28', { netPnl: -50, tradeCount: 4 }]])
    expect(run(pnl)).toEqual([])
  })

  it('skips an already-keyed date (idempotent)', () => {
    const pnl = new Map([['2026-06-29', { netPnl: -10, tradeCount: 3 }]])
    expect(run(pnl, new Set(['maxloss_respected:2026-06-29']))).toEqual([])
  })
})
