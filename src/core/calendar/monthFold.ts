// Pure per ARCHITECTURE rule 1: no electron / fs / db imports, and nothing from
// the drawing layer. Every function here is arithmetic over the week rollups the
// card already holds.
//
// THE MONTH FOLD (v0.2.7 Feature 5, beat 17). When the week rail is starved —
// measured on the judging book at 51px short in wide and 43px in portrait — the
// cards drop to one line and the space that frees carries facts about the MONTH
// rather than a sixth repetition of the week.
//
// WHAT THE CARD CAN ACTUALLY SEE, stated plainly because it bounds every claim
// below: a CalendarCardWeek carries ONE mistake — that week's winner, from
// core/calendar/topMistake — and not the week's full tally. So the month's
// "dominant" mistake here is dominant AMONG THE WEEKLY WINNERS, not among all
// tagged trades. A name that came second in all five weeks is invisible to this
// function, and no rearrangement of this file can change that; it would need
// trade_mistake rows the card is never given. The wording the card draws says
// "across N of M weeks" for exactly that reason — it claims what it measured.

import type { CalendarCardWeek } from '@/lib/calendarCard'

export interface DominantMistake {
  name: string
  /** Occurrences summed over the weeks this name topped. */
  count: number
  /** How many weeks it topped. */
  weeks: number
  /** How many weeks were in the rail at all. */
  ofWeeks: number
}

/**
 * THE DOMINANCE GATE, and why these two numbers.
 *
 * Modelled on standsOut, the card's existing "is this worth calling out" test:
 * twice the next best AND a real share of the whole. A month fold that crowns
 * whichever name happened to come first is worse than no line, because the
 * reader cannot tell a pattern from a coin toss.
 *
 *   MIN_WEEKS 2  — a mistake that topped ONE week is that week's mistake, and
 *                  the week's own tier already says so. The fold has to claim
 *                  something the weeks do not.
 *   MIN_SHARE .4 — with the four or five names a real month carries, an even
 *                  split is 20-25%. Forty per cent is roughly twice an even
 *                  share, and unlike "twice the runner-up" it stays meaningful
 *                  when the runner-up count is tiny.
 *
 * Measured against three synthetic distributions before being chosen: strong
 * (92% of counted occurrences, 4 of 5 weeks) draws; moderate (57%, 2 of 5, 3.56x
 * the next) draws; weak (22%, 1 of 5, 1.10x the next) draws NOTHING — rejected
 * independently by BOTH gates, which is the property that matters.
 */
export const DOMINANCE_MIN_WEEKS = 2
export const DOMINANCE_MIN_SHARE = 0.4

/**
 * THE OCCURRENCE FLOOR — beat 18, and the reason it exists.
 *
 * MEASURED: May headlined "OVERSIZED · 3x ACROSS 2 OF 5 WEEKS" with the same
 * weight as March's 54x. Every gate above is RELATIVE, and May's entire pool of
 * weekly-winner counts is FOUR — so three of them is 75% of the pool and 3.00x
 * the runner-up. Both gates passed on a sample of four. Nothing anywhere was
 * measured against the size of the month.
 *
 *              count  trades  perTrade   tradedDays  PER DAY
 *   2026-03      54     260     20.8%        20       2.70
 *   2026-05       3      70      4.3%        12       0.25
 *
 * PER TRADED DAY, not a bare constant and not a share of trades:
 *   - a bare constant cannot serve both a 14-trade month and a 260-trade one;
 *     10 would silence the small month permanently and wave through a 10x noise
 *     pattern in a big one.
 *   - a share of TRADES is unstable exactly where the noise is: at 10% of
 *     trades, June's 14-trade month crowns a name on TWO occurrences (14.3%),
 *     because the denominator shrinks faster than the signal does.
 *   - per traded day separates the two cases by 10.8x, against 4.8x for share
 *     of trades, and it is a sentence a trader can check: the mistake showed up
 *     about as often as you traded.
 *
 * HALF a day, not one. At 1.0/day a genuine pattern — 15 occurrences over 20
 * trading days — would be silenced at 0.75. At 0.5 March clears by 5.4x and May
 * fails by 2.0x, which is margin on both sides rather than a line drawn against
 * one month.
 *
 * The floor of 3 stops a month with one or two trading days crowning a single
 * tag: half of two days is one, and one occurrence is not a pattern.
 */
export const DOMINANCE_MIN_PER_DAY = 0.5
export const DOMINANCE_MIN_COUNT = 3

export function dominantMistake(
  weeks: readonly CalendarCardWeek[],
  minWeeks: number = DOMINANCE_MIN_WEEKS,
  minShare: number = DOMINANCE_MIN_SHARE,
  minPerDay: number = DOMINANCE_MIN_PER_DAY,
): DominantMistake | null {
  const agg = new Map<string, { count: number; weeks: number }>()
  for (const w of weeks) {
    if (!w.topMistake) continue
    const a = agg.get(w.topMistake.name) ?? { count: 0, weeks: 0 }
    a.count += w.topMistake.count
    a.weeks += 1
    agg.set(w.topMistake.name, a)
  }
  if (agg.size === 0) return null
  // Deterministic, the same order topMistake settles on: count desc, then the
  // wider evidence, then the name. Never Map-insertion order.
  const ranked = [...agg.entries()]
    .map(([name, a]) => ({ name, count: a.count, weeks: a.weeks }))
    .sort((x, y) => y.count - x.count || y.weeks - x.weeks || (x.name < y.name ? -1 : 1))
  const top = ranked[0]
  const total = ranked.reduce((a, r) => a + r.count, 0)
  if (top.weeks < minWeeks) return null
  if (ranked.length > 1 && top.count < ranked[1].count * 2) return null
  if (top.count < total * minShare) return null
  // THE ABSOLUTE GATE. Every test above this line is relative to the other
  // weekly winners, and on a four-count pool that is a coin toss with a
  // percentage sign on it. This one is relative to the month.
  const tradedDays = weeks.reduce((a, w) => a + w.daysTraded, 0)
  if (top.count < Math.max(DOMINANCE_MIN_COUNT, tradedDays * minPerDay)) return null
  return { name: top.name, count: top.count, weeks: top.weeks, ofWeeks: weeks.length }
}

/**
 * Journalling coverage for the month, from the week rollups.
 *
 * Summed off the weeks rather than the days because a re-totalled straddling
 * week deliberately zeroes its own daysJournaled (scopeWeeksToMonth drops the
 * week-scoped lines rather than showing them unscoped), and the fold must
 * inherit that honesty rather than route around it.
 */
export function journalCoverage(
  weeks: readonly CalendarCardWeek[],
): { journaled: number; traded: number } {
  let journaled = 0
  let traded = 0
  for (const w of weeks) {
    journaled += w.daysJournaled
    traded += w.daysTraded
  }
  return { journaled, traded }
}

/**
 * Fees as a share of the month's net, as a percentage — or NULL when the month
 * has no net for them to be a share of.
 *
 * BEAT 18. This divided by Math.abs(net), so a month that lost $1,650 reported
 * "FEES 25.1% OF NET". The sign was discarded before the divide and the wording
 * then implied fees had eaten a quarter of something earned. They had not; they
 * were added to the loss. A negative month now returns null and the card says
 * what actually happened instead of quoting a ratio of a thing that is absent.
 */
export function feeShareOfNet(fees: number, net: number): number | null {
  if (!Number.isFinite(fees) || !Number.isFinite(net)) return null
  if (net <= 0) return null
  return (fees / net) * 100
}
