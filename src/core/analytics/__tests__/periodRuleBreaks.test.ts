// A WINDOW ASKS WHAT RULES WERE BROKEN INSIDE IT.
//
// THE VACUITY TRAP, NAMED SO IT CANNOT BE WALKED INTO. Both maps reach this
// code WHOLE BOOK -- the daily P&L map is unbounded on purpose (the streak
// reaches back before the window) and readRuleBreaksByDate has no WHERE clause
// at all. A fixture whose rule breaks all fall inside the window would pass
// every case below WITH NO FILTER WHATSOEVER.
//
// So the fixture carries breaks on BOTH SIDES, with net P&L values chosen so
// that an unfiltered roll-up is visible in the ARITHMETIC and not merely in
// the membership: the out-of-window days carry +500, -200, +999 and -777,
// none of which can hide inside a window total of +100.
//
//   BEFORE the window : 2026-06-01, 2026-06-03      (2 days)
//   INSIDE            : 2026-06-07 .. 2026-06-13    (6 days, 5 with a break)
//   AFTER             : 2026-06-20, 2026-06-25      (2 days)
//
// computeRuleBreaks ITSELF IS NOT RE-PINNED HERE. Its nine cases live in
// ruleBreaks.test.ts and it is untouched by this beat; what these cases pin is
// that the window's INPUTS are restricted before it ever sees them.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { restrictMapsToWindow } from '../periodRuleBreaks'
import { computeRuleBreaks } from '../ruleBreaks'

const FROM = '2026-06-07'
const TO = '2026-06-13'

/** date -> the rules broken that day. Whole book, as the reader returns it. */
const BREAKS = new Map<string, string[]>([
  ['2026-06-01', ['A']], // BEFORE
  ['2026-06-03', ['B']], // BEFORE
  ['2026-06-07', ['A']], // the FROM boundary, inclusive
  ['2026-06-08', ['A', 'B']], // two on one day
  ['2026-06-10', ['A']],
  ['2026-06-12', ['C']], // a break on a day with NO trade
  ['2026-06-13', ['B']], // the TO boundary, inclusive
  ['2026-06-20', ['A']], // AFTER
  ['2026-06-25', ['C']], // AFTER
])

/** date -> that day's net. Whole book. 2026-06-12 is deliberately absent. */
const NET = new Map<string, number>([
  ['2026-06-01', 500],
  ['2026-06-03', -200],
  ['2026-06-07', 11],
  ['2026-06-08', 100],
  ['2026-06-09', 7], // a CLEAN in-window day: traded, no break
  ['2026-06-10', -40],
  ['2026-06-13', 29],
  ['2026-06-20', 999],
  ['2026-06-25', -777],
])

/** Computed FROM THE FIXTURE, never typed as a literal: the net of in-window
 *  days that carry at least one break. */
const IN_WINDOW_FLAWED_NET = [...BREAKS.keys()]
  .filter((d) => d >= FROM && d <= TO)
  .reduce((a, d) => a + (NET.get(d) ?? 0), 0)

const roll = (from = FROM, to = TO) => {
  const r = restrictMapsToWindow(BREAKS, NET, from, to)
  return computeRuleBreaks(r.ruleBreaksByDate, r.netPnlByDate)
}

const labelOf = (res: ReturnType<typeof roll>, label: string) =>
  res.byRuleBreak.find((x) => x.label === label)

describe('AO the window restricts the rollup', () => {
  it('AO1 a break dated BEFORE the window is excluded', () => {
    const r = roll()
    // 2026-06-01 carries A at +500 and 2026-06-03 carries B at -200.
    expect(r.days_with_any_break, 'a day before the window was counted').toBe(5)
    expect(r.flawed_day_net_pnl, 'the +500 before the window leaked in').toBe(
      IN_WINDOW_FLAWED_NET,
    )
    // and the restricted map itself does not hold them
    const restricted = restrictMapsToWindow(BREAKS, NET, FROM, TO)
    expect([...restricted.ruleBreaksByDate.keys()].some((d) => d < FROM)).toBe(false)
    expect([...restricted.netPnlByDate.keys()].some((d) => d < FROM)).toBe(false)
  })

  it('AO2 a break dated AFTER the window is excluded', () => {
    const r = roll()
    // 2026-06-20 carries A at +999 and 2026-06-25 carries C at -777.
    const a = labelOf(r, 'A')
    expect(a?.day_count, 'a day after the window was counted for A').toBe(3)
    expect(r.flawed_day_net_pnl).toBe(IN_WINDOW_FLAWED_NET)
    const restricted = restrictMapsToWindow(BREAKS, NET, FROM, TO)
    expect([...restricted.ruleBreaksByDate.keys()].some((d) => d > TO)).toBe(false)
    expect([...restricted.netPnlByDate.keys()].some((d) => d > TO)).toBe(false)
    // THE UNFILTERED NUMBER, spelled out so the case cannot pass by accident:
    const unfiltered = computeRuleBreaks(BREAKS, NET)
    expect(unfiltered.days_with_any_break, 'the fixture cannot tell filtered from not').toBe(9)
    expect(unfiltered.flawed_day_net_pnl).not.toBe(IN_WINDOW_FLAWED_NET)
  })

  it('AO3 a day with TWO breaks counts ONCE in the headline', () => {
    const r = roll()
    // 2026-06-08 carries A and B. Five in-window days carry a break; the
    // headline is 5, not 6. (ruleBreaks.test.ts:60 pins this for the book;
    // this pins it through the WINDOW path.)
    expect(r.days_with_any_break).toBe(5)
  })

  it('AO4 the per-label day counts SUM HIGHER than the headline', () => {
    const r = roll()
    const sum = r.byRuleBreak.reduce((a, x) => a + x.day_count, 0)
    // BOTH numbers asserted, so neither can be derived from the other.
    expect(r.days_with_any_break).toBe(5)
    expect(sum, 'the rows do not sum higher -- the fixture has no doubled day').toBe(6)
    expect(sum).toBeGreaterThan(r.days_with_any_break)
    expect(labelOf(r, 'A')?.day_count).toBe(3) // 06-07, 06-08, 06-10
    expect(labelOf(r, 'B')?.day_count).toBe(2) // 06-08, 06-13
    expect(labelOf(r, 'C')?.day_count).toBe(1) // 06-12
  })

  it('AO5 the flawed and CLEAN sides both belong to the window', () => {
    const r = roll()
    expect(r.flawed_day_net_pnl, 'flawed net is not the in-window flawed net').toBe(
      IN_WINDOW_FLAWED_NET,
    )
    // THE CLEAN SIDE IS THE OTHER HALF, and it is the one a half-filter breaks:
    // restricting only the rule-break map would leave every traded day in the
    // BOOK looking clean. 2026-06-09 is the one clean day in this window.
    expect(r.clean_days, 'clean days came from outside the window').toBe(1)
    expect(r.clean_day_net_pnl).toBe(NET.get('2026-06-09'))
  })

  it('AO6 a window with no rule breaks returns an EMPTY rollup', () => {
    // SHAPE: the same object, with an empty row list, zero counts and NULL
    // rates. Not null and not a throw -- the tab needs something to render an
    // absence from, and a null rate is an absence where 0 would be a claim.
    const r = roll('2026-07-01', '2026-07-31')
    expect(r.byRuleBreak).toEqual([])
    expect(r.days_with_any_break).toBe(0)
    expect(r.clean_days).toBe(0)
    expect(r.flawed_day_net_pnl).toBe(0)
    expect(r.clean_day_net_pnl).toBe(0)
    expect(r.flawed_green_rate, 'a rate of zero is a claim; null is an absence').toBe(null)
    expect(r.clean_green_rate).toBe(null)
  })

  it('AO7 a break on a day with NO trades is still in the rollup', () => {
    const r = roll()
    // 2026-06-12 is absent from NET entirely.
    expect(NET.has('2026-06-12'), 'the fixture gave that day a trade').toBe(false)
    const c = labelOf(r, 'C')
    expect(c, 'the no-trade day vanished').toBeTruthy()
    expect(c?.day_count).toBe(1)
    expect(c?.net_pnl).toBe(0)
    expect(c?.green_day_rate).toBe(0)
  })

  it('AO7b the boundary is INCLUSIVE at BOTH ends', () => {
    const r = roll()
    // 2026-06-07 IS `from` and 2026-06-13 IS `to`. Both carry a break.
    const restricted = restrictMapsToWindow(BREAKS, NET, FROM, TO)
    expect(restricted.ruleBreaksByDate.has(FROM), 'the from day was excluded').toBe(true)
    expect(restricted.ruleBreaksByDate.has(TO), 'the to day was excluded').toBe(true)
    expect(restricted.netPnlByDate.has(FROM)).toBe(true)
    expect(restricted.netPnlByDate.has(TO)).toBe(true)
    // and an EXCLUSIVE boundary would drop both, taking the headline to 3
    expect(r.days_with_any_break).toBe(5)
    expect(labelOf(r, 'A')?.day_count).toBe(3)
    expect(labelOf(r, 'B')?.day_count).toBe(2)
    // a one-day window on the boundary date is the sharpest form of the same
    const single = roll(FROM, FROM)
    expect(single.days_with_any_break).toBe(1)
    expect(single.flawed_day_net_pnl).toBe(NET.get(FROM))
  })

  it('AO8 CONTROL: computeRuleBreaks is untouched, by md5', () => {
    const src = readFileSync(join(process.cwd(), 'src/core/analytics/ruleBreaks.ts'))
    expect(
      createHash('md5').update(src).digest('hex'),
      'src/core/analytics/ruleBreaks.ts was modified -- this beat must only restrict its inputs',
    ).toBe('a94b7aceda7a4ee1f69f8ebbfcf5d426')
  })
})
