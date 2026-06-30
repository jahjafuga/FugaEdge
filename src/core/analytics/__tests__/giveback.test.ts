import { describe, it, expect } from 'vitest'
import { computeGiveback } from '../giveback'

// "Gave back profits" rollup (djsevans87) — goal-TRIGGERED. A day counts ONLY
// when the day's ordered cumulative net P&L crossed the configured daily target
// AND then gave some back (peak-after-cross > final). giveback = peak − final;
// pct_off_top = giveback / peak. The backend orders each day's CLOSED trades by
// close_time before grouping; this pure fn trusts input order.

// One day's trades, already in (close_time) order.
const day = (...pnls: number[]) => pnls.map((net_pnl) => ({ net_pnl }))

describe('computeGiveback — single-day mechanics', () => {
  it('clean giveback day: cross then decline (target 500, [+200,+200,+200,-150])', () => {
    // cumulative [200,400,600,450] — cross at idx2 (600>=500), peak 600, final 450
    const r = computeGiveback(new Map([['2026-05-01', day(200, 200, 200, -150)]]), 500)
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(150, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(0.25, 6) // 150 / 600
    expect(r.goal_set).toBe(true)
  })

  it('hit goal but RODE IT TO THE CLOSE — giveback 0, NOT counted (target 500, [+300,+300])', () => {
    // cumulative [300,600] — peak 600 == final 600 → giveback 0
    const r = computeGiveback(new Map([['d', day(300, 300)]]), 500)
    expect(r.days).toBe(0)
    expect(r.total_giveback).toBe(0)
    expect(r.avg_pct_off_top).toBeNull()
    expect(r.goal_set).toBe(true)
  })

  it('ended ABOVE the goal but below peak — still counts (target 500, [+600,+300,-200])', () => {
    // cumulative [600,900,700] — cross idx0, peak 900, final 700 (>500), giveback 200
    const r = computeGiveback(new Map([['d', day(600, 300, -200)]]), 500)
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(200, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(200 / 900, 6)
  })

  it('NEVER hit the goal — excluded (target 500, [+100,+100,-50])', () => {
    // max cumulative 200 < 500 → never crossed
    const r = computeGiveback(new Map([['d', day(100, 100, -50)]]), 500)
    expect(r.days).toBe(0)
    expect(r.avg_pct_off_top).toBeNull()
  })

  it('peak forms AFTER the crossing (target 500, [+500,-100,+400,-300])', () => {
    // cumulative [500,400,800,500] — cross idx0, peak 800 (idx2), final 500, giveback 300
    const r = computeGiveback(new Map([['d', day(500, -100, 400, -300)]]), 500)
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(300, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(300 / 800, 6)
  })
})

describe('computeGiveback — aggregation across days', () => {
  it('averages pct_off_top over giveback days, sums total', () => {
    // day A: [+200,+200,+200,-150] → giveback 150, pct 0.25
    // day B: [+1000,-350]          → cum [1000,650], giveback 350, pct 0.35
    const r = computeGiveback(
      new Map([
        ['2026-05-01', day(200, 200, 200, -150)],
        ['2026-05-02', day(1000, -350)],
      ]),
      500,
    )
    expect(r.days).toBe(2)
    expect(r.total_giveback).toBeCloseTo(500, 6) // 150 + 350
    expect(r.avg_pct_off_top).toBeCloseTo(0.3, 6) // (0.25 + 0.35) / 2
  })

  it('mixes counted + uncounted days (only giveback days aggregate)', () => {
    const r = computeGiveback(
      new Map([
        ['a', day(200, 200, 200, -150)], // giveback 150 (counted)
        ['b', day(300, 300)], //            rode to close (giveback 0, not counted)
        ['c', day(100, 100)], //            never hit goal (not counted)
      ]),
      500,
    )
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(150, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(0.25, 6)
  })
})

describe('computeGiveback — goal-not-set + empty', () => {
  it('target <= 0 → goal_set false, zero days, null avg (the empty state)', () => {
    for (const target of [0, -100]) {
      const r = computeGiveback(new Map([['d', day(600, -200)]]), target)
      expect(r.goal_set).toBe(false)
      expect(r.days).toBe(0)
      expect(r.total_giveback).toBe(0)
      expect(r.avg_pct_off_top).toBeNull()
    }
  })

  it('empty input with a set goal → goal_set true, zero days, null avg (no fabricated zeros)', () => {
    const r = computeGiveback(new Map(), 500)
    expect(r.goal_set).toBe(true)
    expect(r.days).toBe(0)
    expect(r.total_giveback).toBe(0)
    expect(r.avg_pct_off_top).toBeNull()
  })
})
