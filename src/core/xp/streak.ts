// v0.2.5 Phase B Session 4 — the journaling streak engine (L19/A2, spec D9
// + D24). Pure module: no electron, no DB, no clock — `today` is an input
// (the house machine-local todayDateISO convention; this module does plain
// string/UTC-component date math only).
//
// THE DESIGN LOCK (L19): journaledDates are the dates holding a
// streak:{date} ledger key — the PAID bonus is the journaled-day record.
// Editing old data can never un-journal a paid day (D18); the ledger is the
// source of truth, never a recomputed D9.
//
// STATELESS BY CONSTRUCTION (A2): nothing about streaks or freezes is
// persisted — every call re-derives current/longest/freezesBanked from its
// inputs. A midnight-boundary "missed" before the user journals is
// transient, and journaling the day later yields output IDENTICAL to
// never-missed, freeze bank included (the repair property, tested).
//
// RETROACTIVITY (accepted): importing old untagged trades converts past
// NEUTRAL days to MISSED, which can lower current/longest on recompute —
// and journaling those days afterward (tag + sentiment → sweep pays → key
// exists) REPAIRS the streak. Self-healing by doing the work, never by
// deleting data.

export const FREEZE_EARN_EVERY = 30
export const FREEZE_BANK_CAP = 2

export interface StreakInput {
  /** Dates holding a streak:{date} ledger key (prefix already stripped). */
  journaledDates: readonly string[]
  /** Dates with ≥1 non-deleted trade. */
  tradeDates: readonly string[]
  /** The machine-local trading date (todayDateISO convention). */
  today: string
}

export interface StreakResult {
  current: number
  longest: number
  freezesBanked: number
}

const ZERO: StreakResult = { current: 0, longest: 0, freezesBanked: 0 }

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/**
 * Walk the calendar from the earliest journaled date to today, classifying
 * each day: JOURNALED (key exists) | MISSED (traded, unjournaled, before
 * today) | NEUTRAL (neither — weekends, vacations; never breaks). TODAY
 * without a key is PENDING — never missed, never breaks, doesn't extend.
 *
 * Freezes: every FREEZE_EARN_EVERY journaled days within the current run
 * bank one (cap FREEZE_BANK_CAP). A MISSED day consumes one freeze and is
 * bridged — the run continues, the bridged day counting toward neither the
 * streak length nor the freeze cadence (both pause). Consecutive misses
 * consume one each until the bank empties, then the run resets to 0; the
 * cadence counter resets with the run. (The run length IS the cadence
 * counter: bridges pause both, and both reset together.)
 */
export function computeStreak(input: StreakInput): StreakResult {
  const journaled = new Set(input.journaledDates)
  if (journaled.size === 0) return { ...ZERO }
  const traded = new Set(input.tradeDates)

  let start = ''
  for (const d of journaled) {
    if (start === '' || d < start) start = d
  }
  // Defensive: a future-dated key cannot anchor a walk to today.
  if (start > input.today) return { ...ZERO }

  let run = 0
  let longest = 0
  let bank = 0

  for (let day = start; day <= input.today; day = nextDay(day)) {
    if (journaled.has(day)) {
      run += 1
      if (run % FREEZE_EARN_EVERY === 0) bank = Math.min(FREEZE_BANK_CAP, bank + 1)
      if (run > longest) longest = run
    } else if (day !== input.today && traded.has(day)) {
      // MISSED — bridge if a freeze is banked, else the run dies.
      if (bank > 0) {
        bank -= 1
      } else {
        run = 0
      }
    }
    // NEUTRAL day or PENDING today: skip — no break, no extend, no consume.
  }

  return { current: run, longest, freezesBanked: bank }
}
