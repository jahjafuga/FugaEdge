// Fixtures for the branded calendar card — the two months that actually exist,
// plus their weeks.
//
// ONE factory, shared by the stand-down suite and the layout suite, because the
// card's day now carries eleven fields and three copies of that literal would
// drift the first time a twelfth arrives.

import type { CalendarCardDay, CalendarCardWeek } from '@/lib/calendarCard'

export function cardDay(
  date: string,
  pnl: number,
  tradeCount: number,
  over: Partial<CalendarCardDay> = {},
): CalendarCardDay {
  return {
    date,
    pnl,
    pct: pnl / 100,
    tradeCount,
    winners: pnl > 0 ? tradeCount : 0,
    losers: pnl < 0 ? tradeCount : 0,
    winRate: tradeCount > 0 ? (pnl > 0 ? 1 : 0) : null,
    plRatio: tradeCount > 0 ? 1.5 : null,
    noTrade: false,
    holiday: false,
    hasJournal: false,
    tags: [],
    fees: tradeCount * 0.27,
    ...over,
  }
}

export function cardWeek(
  weekStart: string,
  weekEnd: string,
  over: Partial<CalendarCardWeek> = {},
): CalendarCardWeek {
  return {
    weekStart,
    weekEnd,
    inMonth: true,
    tradeCount: 0,
    netPnl: 0,
    netPct: null,
    totalFees: 0,
    winners: 0,
    losers: 0,
    winRate: null,
    plRatio: null,
    feesPct: null,
    daysTraded: 0,
    daysJournaled: 0,
    streak: { kind: 'none', days: 0 },
    topMistake: null,
    ...over,
  }
}

/** LIVE 2026-07 — four trading days in thirty-one cells. The hard case. */
export const SPARSE_DAYS: CalendarCardDay[] = [
  cardDay('2026-07-28', -1.84, 1),
  cardDay('2026-07-29', -12.0, 5),
  cardDay('2026-07-30', -4.41, 2),
  cardDay('2026-07-31', 19.24, 8),
]

/**
 * AUGUST 2026 — THE FOUR-STATE FIXTURE.
 *
 * SPARSE_DAYS supplies JULY dates. The story fingerprint composes an AUGUST
 * card, so every one of its thirty-one in-month cells resolves to `undefined`:
 * the frozen poster has been freezing a month in which no day is traded, no day
 * is touched, heatAlpha is never called and the 0.05 touched wash is never
 * painted. A guard over a card with one state cannot notice the other three
 * changing.
 *
 * August 2026 starts on a SATURDAY, so the Sunday-first grid leads with Jul
 * 26-31 and trails with Sep 1-5 — out-of-month cells on both ends, which is the
 * fourth state and needs no fixture entry.
 *
 * THE P&L SPREAD IS CHOSEN, not arbitrary: these five values must land on five
 * DISTINCT alphas, in both tones, with the top one pinned to HEAT_MAX. That is
 * what the dayState and storyFrozen state breakdowns assert.
 *
 * RE-BASELINED IN BEAT 14. heatAlpha stopped dividing by the month's largest day
 * and became two bands (see heatScale): the body spreads linearly to bodyTop
 * against the 90th-percentile day, and whatever exceeds it shares the band up to
 * HEAT_MAX. Here anchor = 192.00, max = 240.00, so bodyTop = 0.385.
 *
 *                       WAS (0.08+0.32*sqrt(x/max))     NOW
 *   +240.00  (win)        0.400  HEAT_MAX               0.400  HEAT_MAX
 *   -120.00  (loss)       0.306                         0.271
 *    +60.00  (win)        0.240                         0.175
 *    -15.00  (loss)       0.160                         0.104
 *     +3.75  (win)        0.120  near floor             0.086  near floor
 *
 * Every assertion over these survived the change untouched, because all of them
 * were about DISTINCTNESS and the pinned ceiling rather than the values — which
 * is the only reason a ramp re-tune did not have to re-baseline a frozen poster.
 */
export const AUGUST_DAYS: CalendarCardDay[] = [
  // TOUCHED — three of the four markedLabel variants
  cardDay('2026-08-03', 0, 0, { noTrade: true }), //            -> "sat out"
  cardDay('2026-08-06', 0, 0, { hasJournal: true }), //         -> "journaled"
  cardDay('2026-08-17', 0, 0, { noTrade: true, holiday: true }), // -> "MARKET CLOSED"
  // TRADED — five days, five alphas, both tones
  cardDay('2026-08-04', 3.75, 2, { winners: 2, losers: 0, winRate: 1, plRatio: 1.5 }),
  cardDay('2026-08-05', 240.0, 35, { winners: 30, losers: 5, winRate: 0.86, plRatio: 4.2 }),
  cardDay('2026-08-12', -15.0, 6, { winners: 2, losers: 4, winRate: 0.33, plRatio: 0.6 }),
  cardDay('2026-08-18', 60.0, 11, { winners: 8, losers: 3, winRate: 0.73, plRatio: 2.1 }),
  cardDay('2026-08-27', -120.0, 20, { winners: 6, losers: 14, winRate: 0.3, plRatio: 0.4 }),
  // the remaining twenty-three in-month days are UNTOUCHED, by omission
]

/** Six weeks aligned to August's own Sunday-first grid. The poster draws no
 *  rail, so these exist to keep the fixture honest rather than to be rendered. */
export const AUGUST_WEEKS: CalendarCardWeek[] = [
  cardWeek('2026-07-26', '2026-08-01'),
  cardWeek('2026-08-02', '2026-08-08', {
    tradeCount: 37, netPnl: 243.75, netPct: 2.44, totalFees: 9.99, feesPct: 0.1,
    winners: 32, losers: 5, winRate: 0.86, plRatio: 4.0, daysTraded: 2, daysJournaled: 2,
    streak: { kind: 'win', days: 2 }, topMistake: { name: 'Chased entry', count: 3 },
  }),
  cardWeek('2026-08-09', '2026-08-15', {
    tradeCount: 6, netPnl: -15.0, netPct: -0.15, totalFees: 1.62, feesPct: 0.02,
    winners: 2, losers: 4, winRate: 0.33, plRatio: 0.6, daysTraded: 1, daysJournaled: 0,
    streak: { kind: 'loss', days: 1 }, topMistake: null,
  }),
  cardWeek('2026-08-16', '2026-08-22', {
    tradeCount: 11, netPnl: 60.0, netPct: 0.6, totalFees: 2.97, feesPct: 0.03,
    winners: 8, losers: 3, winRate: 0.73, plRatio: 2.1, daysTraded: 1, daysJournaled: 1,
    streak: { kind: 'win', days: 1 }, topMistake: null,
  }),
  cardWeek('2026-08-23', '2026-08-29', {
    tradeCount: 20, netPnl: -120.0, netPct: -1.2, totalFees: 5.4, feesPct: 0.05,
    winners: 6, losers: 14, winRate: 0.3, plRatio: 0.4, daysTraded: 1, daysJournaled: 1,
    streak: { kind: 'loss', days: 1 }, topMistake: { name: 'Size too large', count: 5 },
  }),
  cardWeek('2026-08-30', '2026-09-05'),
]

/**
 * PRESET 2026-06 — the dense case, with AT LEAST ONE TRADING DAY IN EVERY GRID
 * ROW (June's five rows end Jun 28–Jul 4, hence the 29th and 30th).
 *
 * That last part is deliberate and load-bearing for the dead-space guard:
 * untouched cells paint nothing by design, so a row with no trades in it is a
 * blank band no matter how well the layout uses its frame. A month that fills
 * every row is the only fixture that can tell layout waste from a quiet week.
 */
export const DENSE_DAYS: CalendarCardDay[] = [
  cardDay('2026-06-01', 3.1, 12), cardDay('2026-06-02', 20.7, 5),
  cardDay('2026-06-03', -6.24, 7), cardDay('2026-06-04', 8.03, 16),
  cardDay('2026-06-05', 2.73, 3), cardDay('2026-06-08', -118.31, 17),
  cardDay('2026-06-09', 28.71, 35), cardDay('2026-06-10', 18.5, 3),
  cardDay('2026-06-11', 6.3, 9), cardDay('2026-06-12', 13.56, 9),
  cardDay('2026-06-15', 9.66, 17), cardDay('2026-06-16', -33.35, 20),
  cardDay('2026-06-17', 39.91, 18), cardDay('2026-06-18', 4.2, 6),
  cardDay('2026-06-19', -2.5, 4), cardDay('2026-06-22', 36.09, 11),
  cardDay('2026-06-23', 35.12, 4), cardDay('2026-06-24', -6.83, 15),
  cardDay('2026-06-25', -58.31, 35), cardDay('2026-06-26', -41.71, 35),
  cardDay('2026-06-29', 12.4, 6), cardDay('2026-06-30', -3.2, 4),
]

/** Six weeks, one per grid row — the shape CalendarMonth.weeks always has.
 *  Carries every element WeeklyPanel draws so the rail can be asserted whole. */
export const SPARSE_WEEKS: CalendarCardWeek[] = [
  cardWeek('2026-06-28', '2026-07-04'),
  cardWeek('2026-07-05', '2026-07-11', { daysJournaled: 2 }),
  cardWeek('2026-07-12', '2026-07-18'),
  cardWeek('2026-07-19', '2026-07-25'),
  cardWeek('2026-07-26', '2026-08-01', {
    tradeCount: 16,
    netPnl: 0.99,
    netPct: 0.0099,
    totalFees: 4.32,
    winners: 8,
    losers: 8,
    winRate: 0.5,
    plRatio: 2.11,
    feesPct: 0.0432,
    daysTraded: 4,
    daysJournaled: 3,
    streak: { kind: 'loss', days: 3 },
    topMistake: { name: 'Chased entry', count: 4 },
  }),
  cardWeek('2026-08-02', '2026-08-08', { inMonth: false }),
]
