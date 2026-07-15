// LEFT % redefinition — money-fraction, not price-gap.
//
//   pct_left_on_table = bestNet > 0 ? delta / bestNet : null
//
// "What fraction of the achievable money did you leave." The old
// |best − avg| / best price-gap read as a %-of-money because it sits beside the
// dollar LEFT ON TABLE column (djsevans87, 2026-07-15). The guard is EXPLICIT
// logic: bestNet < 0 yields a FINITE wrong-signed number the '—' formatter
// cannot catch (only null/non-finite do), and a losing trade whose best exit
// still loses can pass the delta > 0 filter.
//
// Fixtures only — the dev book is structurally empty here (every trade
// single-exit), so the shapes come from Dave's screenshot rows.
import { describe, expect, it } from 'vitest'
import type { RoundTripExecution } from '@shared/import-types'
import { computeExitDeltas, type ExitDeltaInput } from '../exit-quality'
import { percent } from '@/lib/format'

function exec(side: 'B' | 'S', qty: number, price: number): RoundTripExecution {
  return { trade_id: 't', order_id: 'o', side, qty, price, time: '2026-05-15T09:30:00Z' }
}

function input(over: Partial<ExitDeltaInput>): ExitDeltaInput {
  return {
    id: 1,
    date: '2026-07-15',
    symbol: 'TEST',
    side: 'long',
    net_pnl: 0,
    total_fees: 0,
    executions: [],
    ...over,
  }
}

describe('LEFT % = delta / best_exit_net_pnl (money-fraction of the achievable)', () => {
  it('(1) THE VRAX ROW: actual +58.09, bestNet +217.50, delta 159.41 → 73%, not the price-gap', () => {
    // Entry 100 @ 10.00; exits 60 @ 12.175 + 40 @ 11.00 → best 12.175,
    // best-exit gross = 100 × 12.175 − 1000 = 217.50 (fees 0 → bestNet 217.50).
    const [row] = computeExitDeltas([
      input({
        symbol: 'VRAX',
        net_pnl: 58.09,
        executions: [exec('B', 100, 10.0), exec('S', 60, 12.175), exec('S', 40, 11.0)],
      }),
    ])
    expect(row.best_exit_net_pnl).toBeCloseTo(217.5, 5)
    expect(row.delta).toBeCloseTo(159.41, 5)
    expect(row.pct_left_on_table).toBeCloseTo(159.41 / 217.5, 5) // ≈ 0.7329
    expect(percent(row.pct_left_on_table, 0)).toBe('73%')
  })

  it('(2) NEGATIVE-BEST GUARD: a loser whose best exit still loses (delta > 0 passes the filter) → NULL, never −300%', () => {
    // Entry 100 @ 10.00; exits 50 @ 9.95 + 50 @ 9.50 → bestNet = −5.
    // actual −20 → delta +15 → the row IS shown; the % must be the em-dash.
    const [row] = computeExitDeltas([
      input({
        net_pnl: -20,
        executions: [exec('B', 100, 10.0), exec('S', 50, 9.95), exec('S', 50, 9.5)],
      }),
    ])
    expect(row).toBeDefined()
    expect(row.delta).toBeCloseTo(15, 5)
    expect(row.best_exit_net_pnl).toBeCloseTo(-5, 5)
    expect(row.pct_left_on_table).toBeNull()
    expect(percent(row.pct_left_on_table, 0)).toBe('—')
  })

  it('(3) ZERO-BEST: bestNet == 0 → NULL by the guard, not by Infinity', () => {
    // Entry 100 @ 10.00; exits 50 @ 10.00 + 50 @ 9.60 → bestNet = 0 exactly.
    const [row] = computeExitDeltas([
      input({
        net_pnl: -10,
        executions: [exec('B', 100, 10.0), exec('S', 50, 10.0), exec('S', 50, 9.6)],
      }),
    ])
    expect(row).toBeDefined()
    expect(row.delta).toBeCloseTo(10, 5)
    expect(row.pct_left_on_table).toBeNull()
    expect(row.pct_left_on_table).not.toBe(Infinity)
  })

  it('(4) THE VEEE ROW: actual −3.00, bestNet +72.80 → 104% — over-100 is meaningful and renders as a number', () => {
    // Entry 100 @ 10.00; exits 50 @ 10.728 + 50 @ 10.20 → bestNet 72.80.
    const [row] = computeExitDeltas([
      input({
        symbol: 'VEEE',
        net_pnl: -3,
        executions: [exec('B', 100, 10.0), exec('S', 50, 10.728), exec('S', 50, 10.2)],
      }),
    ])
    expect(row.best_exit_net_pnl).toBeCloseTo(72.8, 5)
    expect(row.delta).toBeCloseTo(75.8, 5)
    expect(row.pct_left_on_table).toBeCloseTo(75.8 / 72.8, 5) // ≈ 1.0412 — left MORE than the achievable
    expect(row.pct_left_on_table!).toBeGreaterThan(1)
    expect(percent(row.pct_left_on_table, 0)).toBe('104%')
  })

  it('(5) SHORT: positive fraction with NO abs — sign safety is structural (delta > 0 by filter, bestNet > 0 by guard)', () => {
    // Short 100 @ 10.00; covers 50 @ 9.00 + 50 @ 9.60 → best cover = 9.00 (MIN),
    // bestNet = 1000 − 900 = 100; actual +40 → delta 60 → pct 0.60.
    const [row] = computeExitDeltas([
      input({
        side: 'short',
        net_pnl: 40,
        executions: [exec('S', 100, 10.0), exec('B', 50, 9.0), exec('B', 50, 9.6)],
      }),
    ])
    expect(row.side).toBe('short')
    expect(row.best_exit_price).toBeCloseTo(9.0, 5)
    expect(row.best_exit_net_pnl).toBeCloseTo(100, 5)
    expect(row.delta).toBeCloseTo(60, 5)
    expect(row.pct_left_on_table).toBeCloseTo(0.6, 5)
    expect(row.pct_left_on_table!).toBeGreaterThan(0)
  })

  it('(6) NO-REGRESS: delta, the dollar columns, the sort, and the filter are untouched', () => {
    const small = input({
      id: 1,
      net_pnl: 58.09,
      executions: [exec('B', 100, 10.0), exec('S', 60, 12.175), exec('S', 40, 11.0)], // delta 159.41
    })
    const big = input({
      id: 2,
      net_pnl: 0,
      executions: [exec('B', 100, 10.0), exec('S', 50, 12.0), exec('S', 50, 14.0)], // bestNet 400, delta 400
    })
    const flat = input({
      id: 3,
      net_pnl: 50,
      executions: [exec('B', 100, 10.0), exec('S', 50, 10.5), exec('S', 50, 10.5)], // delta 0 → excluded
    })
    const rows = computeExitDeltas([small, big, flat])
    expect(rows.map((r) => r.trade_id)).toEqual([2, 1]) // delta desc; flat excluded
    expect(rows[0].delta).toBeCloseTo(400, 5)
    expect(rows[0].best_exit_net_pnl).toBeCloseTo(400, 5)
    expect(rows[1].delta).toBeCloseTo(159.41, 5)
    expect(rows[1].actual_net_pnl).toBeCloseTo(58.09, 5)
  })
})
