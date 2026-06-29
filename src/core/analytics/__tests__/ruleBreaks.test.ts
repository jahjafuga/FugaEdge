import { describe, it, expect } from 'vitest'
import { computeRuleBreaks } from '../ruleBreaks'

// Phase 3 — the PER-DAY rule-break rollup (the day-level sibling of
// computeMistakes' per-trade rollup). Pure: inputs are a (date -> breaks[]) map
// and a (date -> net P&L) map; output is the byRuleBreak table + clean-vs-flawed
// BY DAY. Universe = trading days ∪ broke-a-rule days; a day's net defaults to 0
// when it has breaks but no trades.
//
// Scenario:
//   d1  breaks [A,B]  net +100  (green, traded)
//   d2  breaks [A]    net  -50  (red,   traded)
//   d3  breaks [B]    net  +30  (green, traded)
//   d4  no breaks     net +200  (green, traded — CLEAN day)
//   d5  no breaks     net  -20  (red,   traded — CLEAN day)
//   d6  breaks [A]    NO TRADES (net 0 — flawed, not green)
const RB = new Map<string, string[]>([
  ['2026-05-01', ['A', 'B']],
  ['2026-05-02', ['A']],
  ['2026-05-03', ['B']],
  ['2026-05-06', ['A']], // no-trade day with a break
])
const NET = new Map<string, number>([
  ['2026-05-01', 100],
  ['2026-05-02', -50],
  ['2026-05-03', 30],
  ['2026-05-04', 200], // clean day
  ['2026-05-05', -20], // clean day
  // 2026-05-06 absent -> net 0 via ?? 0
])

describe('computeRuleBreaks — per-label rollup', () => {
  const r = computeRuleBreaks(RB, NET)

  it("label A: days d1/d2/d6 -> count 3, net 50, green-rate 1/3", () => {
    const a = r.byRuleBreak.find((x) => x.label === 'A')!
    expect(a.day_count).toBe(3)
    expect(a.net_pnl).toBe(50) // 100 - 50 + 0
    expect(a.avg_pnl_per_day).toBeCloseTo(50 / 3, 6)
    expect(a.green_day_rate).toBeCloseTo(1 / 3, 6) // only d1 is net>0
  })

  it("label B: days d1/d3 -> count 2, net 130, green-rate 1", () => {
    const b = r.byRuleBreak.find((x) => x.label === 'B')!
    expect(b.day_count).toBe(2)
    expect(b.net_pnl).toBe(130) // 100 + 30
    expect(b.avg_pnl_per_day).toBeCloseTo(65, 6)
    expect(b.green_day_rate).toBe(1) // both green
  })

  it('sorted worst-net-first (A 50 before B 130)', () => {
    expect(r.byRuleBreak.map((x) => x.label)).toEqual(['A', 'B'])
  })
})

describe('computeRuleBreaks — clean-vs-flawed BY DAY', () => {
  const r = computeRuleBreaks(RB, NET)

  it('flawed days = 4 (d1,d2,d3,d6); a day with 2 breaks counts ONCE', () => {
    expect(r.days_with_any_break).toBe(4) // NOT 5 — d1 counts once despite [A,B]
    expect(r.flawed_day_net_pnl).toBe(80) // 100 - 50 + 30 + 0 (d1 once)
    expect(r.flawed_green_rate).toBeCloseTo(0.5, 6) // d1,d3 green of 4
  })

  it('clean days = 2 (d4,d5)', () => {
    expect(r.clean_days).toBe(2)
    expect(r.clean_day_net_pnl).toBe(180) // 200 - 20
    expect(r.clean_green_rate).toBeCloseTo(0.5, 6) // d4 green of 2
  })
})

describe('computeRuleBreaks — edges', () => {
  it('no-trade day with a break is flawed with net 0 (sane)', () => {
    const r = computeRuleBreaks(
      new Map([['2026-05-06', ['A']]]),
      new Map(), // no trades at all
    )
    const a = r.byRuleBreak.find((x) => x.label === 'A')!
    expect(a.day_count).toBe(1)
    expect(a.net_pnl).toBe(0)
    expect(a.green_day_rate).toBe(0) // 0 of 1 green
    expect(r.days_with_any_break).toBe(1)
    expect(r.clean_days).toBe(0)
  })

  it('per-day label dedup: [A,A] on one day counts that day ONCE for A', () => {
    const r = computeRuleBreaks(
      new Map([['2026-05-01', ['A', 'A']]]),
      new Map([['2026-05-01', 100]]),
    )
    const a = r.byRuleBreak.find((x) => x.label === 'A')!
    expect(a.day_count).toBe(1)
    expect(a.net_pnl).toBe(100)
  })

  it('empty -> [] + null rates (never 0/NaN)', () => {
    const r = computeRuleBreaks(new Map(), new Map())
    expect(r.byRuleBreak).toEqual([])
    expect(r.days_with_any_break).toBe(0)
    expect(r.clean_days).toBe(0)
    expect(r.flawed_day_net_pnl).toBe(0)
    expect(r.clean_day_net_pnl).toBe(0)
    expect(r.flawed_green_rate).toBeNull()
    expect(r.clean_green_rate).toBeNull()
  })

  it('a date with an EMPTY breaks array is treated as clean (not flawed)', () => {
    const r = computeRuleBreaks(
      new Map([['2026-05-01', []]]),
      new Map([['2026-05-01', 100]]),
    )
    expect(r.byRuleBreak).toEqual([])
    expect(r.days_with_any_break).toBe(0)
    expect(r.clean_days).toBe(1)
    expect(r.clean_day_net_pnl).toBe(100)
  })
})
