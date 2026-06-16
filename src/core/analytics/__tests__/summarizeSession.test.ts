import { describe, it, expect } from 'vitest'
import { summarizeSession, type SessionTradeRow } from '../summarizeSession'
import { SCRATCH_EPSILON } from '@shared/trade-classification'

// Build a trade row; gross_pnl defaults to net (fees 0) unless overridden so the
// classification tests stay terse.
const t = (net_pnl: number, gross_pnl: number = net_pnl, total_fees = 0): SessionTradeRow => ({
  net_pnl,
  gross_pnl,
  total_fees,
})

describe('summarizeSession', () => {
  it('sums net_pnl, gross_pnl and total_fees', () => {
    const out = summarizeSession([t(100, 110, 10), t(-40, -36, 4)])
    expect(out.net_pnl).toBe(60)
    expect(out.gross_pnl).toBe(74)
    expect(out.total_fees).toBe(14)
  })

  it('counts winners (> +epsilon) and losers (< -epsilon); a scratch is neither', () => {
    // half-epsilon → scratch (counts toward neither winners nor losers)
    const out = summarizeSession([t(50), t(-30), t(SCRATCH_EPSILON / 2)])
    expect(out.winners).toBe(1)
    expect(out.losers).toBe(1)
  })

  it('treats the inclusive epsilon boundary as scratch (== epsilon is NOT a win/loss)', () => {
    expect(summarizeSession([t(SCRATCH_EPSILON)]).winners).toBe(0) // == +epsilon → scratch
    expect(summarizeSession([t(-SCRATCH_EPSILON)]).losers).toBe(0) // == -epsilon → scratch
    expect(summarizeSession([t(SCRATCH_EPSILON * 2)]).winners).toBe(1) // above → winner
    expect(summarizeSession([t(-SCRATCH_EPSILON * 2)]).losers).toBe(1) // below → loser
  })

  it('returns all zeros for an empty array (no NaN)', () => {
    expect(summarizeSession([])).toEqual({
      net_pnl: 0,
      gross_pnl: 0,
      total_fees: 0,
      winners: 0,
      losers: 0,
    })
  })

  it('summarizes the 8-trade fixture shape (5 winners, 3 losers, net 175)', () => {
    const fixture = [120, 85, -110, 95, -50, 60, -70, 45].map((n) => t(n))
    const out = summarizeSession(fixture)
    expect(out.net_pnl).toBe(175)
    expect(out.winners).toBe(5)
    expect(out.losers).toBe(3)
  })
})
