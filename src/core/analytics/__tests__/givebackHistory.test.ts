import { describe, it, expect } from 'vitest'
import {
  computeGiveback,
  resolveDailyTargets,
  EPOCH_EFFECTIVE_FROM,
  type TargetHistoryPoint,
} from '../giveback'

// Dave #9 — gave-back point-in-time (schema 48). The giveback walk's semantics
// are FROZEN (the founder-locked header in giveback.ts); only the target SOURCE
// changes: current-value scalar -> the per-day target in force THAT day,
// resolved from the append-only profit_target_history. This suite pins:
//   - the resolution walk (mid-day rule included),
//   - the retroactivity FIX (raising the goal no longer un-counts old days),
//   - epoch equivalence (a single epoch seed row == today's behavior).
// History rows arrive sorted ascending (the SQL ORDER BY effective_from, id);
// the pure fn trusts input order, like the rest of src/core.

const day = (...pnls: number[]) => pnls.map((net_pnl) => ({ net_pnl }))

const point = (effective_from: string, value: number): TargetHistoryPoint => ({
  effective_from,
  value,
})

/** Epoch-only history — the seeded shape every upgraded DB starts with. */
const hist = (value: number): TargetHistoryPoint[] => [point(EPOCH_EFFECTIVE_FROM, value)]

// ═══ (2) POINT-IN-TIME resolution + the MID-DAY RULE ═══
describe('resolveDailyTargets — point-in-time lookup', () => {
  const HISTORY = [point(EPOCH_EFFECTIVE_FROM, 200), point('2026-07-10T15:00:00.000Z', 500)]

  it('a day before the change resolves the OLD target', () => {
    const r = resolveDailyTargets(['2026-07-05'], HISTORY)
    expect(r.get('2026-07-05')).toBe(200)
  })

  it('a day after the change resolves the NEW target', () => {
    const r = resolveDailyTargets(['2026-07-12'], HISTORY)
    expect(r.get('2026-07-12')).toBe(500)
  })

  it('MID-DAY RULE: the change day ITSELF resolves the NEW target (effective_from <= day-end)', () => {
    const r = resolveDailyTargets(['2026-07-10'], HISTORY)
    expect(r.get('2026-07-10')).toBe(500)
  })

  it('all three at once, dates given OUT of order (resolution is order-independent)', () => {
    const r = resolveDailyTargets(['2026-07-12', '2026-07-05', '2026-07-10'], HISTORY)
    expect(r.get('2026-07-05')).toBe(200)
    expect(r.get('2026-07-10')).toBe(500)
    expect(r.get('2026-07-12')).toBe(500)
  })

  it('two changes with the same effective_from: the later row (append order) wins', () => {
    const r = resolveDailyTargets(
      ['2026-07-12'],
      [point(EPOCH_EFFECTIVE_FROM, 200), point('2026-07-10T15:00:00.000Z', 500), point('2026-07-10T15:00:00.000Z', 300)],
    )
    expect(r.get('2026-07-12')).toBe(300)
  })

  it('empty history resolves 0 (no goal) for every day', () => {
    const r = resolveDailyTargets(['2026-07-05'], [])
    expect(r.get('2026-07-05')).toBe(0)
  })
})

// ═══ (3) THE RETROACTIVITY FIX ═══
describe('computeGiveback — per-day targets (the retroactivity fix)', () => {
  it('raising the target no longer un-counts the pre-change day; the post-change day evaluates against the NEW one', () => {
    // Same trades both days: cumulative [250, 150].
    //   Under target 200 (in force Jul-5): crossed at 250, peak 250, final 150 → giveback 100.
    //   Under target 500 (in force Jul-12): never crossed → not counted.
    // Today's single-current-value compute counts NEITHER once the target is 500 —
    // exactly Dave's reopened defect.
    const r = computeGiveback(
      new Map([
        ['2026-07-05', day(250, -100)],
        ['2026-07-12', day(250, -100)],
      ]),
      [point(EPOCH_EFFECTIVE_FROM, 200), point('2026-07-10T15:00:00.000Z', 500)],
    )
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(100, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(100 / 250, 6)
    expect(r.goal_set).toBe(true)
  })

  it('zeroing the goal later does not erase history: pre-change days still count, post-change days skip', () => {
    const r = computeGiveback(
      new Map([
        ['2026-07-05', day(600, -200)], // target 500 that day: crossed, giveback 200
        ['2026-07-12', day(600, -200)], // target 0 that day: no goal — skipped
      ]),
      [point(EPOCH_EFFECTIVE_FROM, 500), point('2026-07-10T15:00:00.000Z', 0)],
    )
    expect(r.days).toBe(1)
    expect(r.total_giveback).toBeCloseTo(200, 6)
    expect(r.goal_set).toBe(true) // a goal WAS set — history is data, not an empty state
  })
})

// ═══ (4) EPOCH EQUIVALENCE — single-seed history == today's behavior ═══
describe('computeGiveback — epoch-only history reproduces the scalar behavior byte-for-byte', () => {
  it('clean giveback day (target 500, [+200,+200,+200,-150])', () => {
    const r = computeGiveback(new Map([['2026-05-01', day(200, 200, 200, -150)]]), hist(500))
    expect(r).toEqual({
      days: 1,
      total_giveback: 150,
      avg_pct_off_top: 0.25,
      goal_set: true,
    })
  })

  it('rode it to the close — not counted (target 500, [+300,+300])', () => {
    const r = computeGiveback(new Map([['d', day(300, 300)]]), hist(500))
    expect(r).toEqual({ days: 0, total_giveback: 0, avg_pct_off_top: null, goal_set: true })
  })

  it('aggregation across days (target 500)', () => {
    const r = computeGiveback(
      new Map([
        ['2026-05-01', day(200, 200, 200, -150)],
        ['2026-05-02', day(1000, -350)],
      ]),
      hist(500),
    )
    expect(r.days).toBe(2)
    expect(r.total_giveback).toBeCloseTo(500, 6)
    expect(r.avg_pct_off_top).toBeCloseTo(0.3, 6)
  })

  it('goal unset (epoch value 0) → goal_set false, zero days — the "set a goal" empty state', () => {
    const r = computeGiveback(new Map([['d', day(600, -200)]]), hist(0))
    expect(r).toEqual({ days: 0, total_giveback: 0, avg_pct_off_top: null, goal_set: false })
  })

  it('empty input with a set goal → goal_set true, zero days, null avg', () => {
    const r = computeGiveback(new Map(), hist(500))
    expect(r).toEqual({ days: 0, total_giveback: 0, avg_pct_off_top: null, goal_set: true })
  })
})
