import { describe, expect, it } from 'vitest'
import {
  FREEZE_BANK_CAP,
  FREEZE_EARN_EVERY,
  computeStreak,
} from '../streak'

// v0.2.5 Phase B Session 4 — the journaling streak engine (L19/A2, spec
// D9 + D24). Ledger-derived and STATELESS: every call re-derives
// current/longest/freezesBanked from (journaledDates, tradeDates, today);
// nothing is persisted, which is what makes the repair property hold.

// Build N consecutive YYYY-MM-DD dates starting at `start`.
function days(start: string, n: number): string[] {
  const [y, m, d] = start.split('-').map(Number)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.push(new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
  }
  return out
}

const D = days('2026-01-05', 120) // a long runway of consecutive dates

describe('constants', () => {
  it('freeze cadence 30, bank cap 2 (D9)', () => {
    expect(FREEZE_EARN_EVERY).toBe(30)
    expect(FREEZE_BANK_CAP).toBe(2)
  })
})

describe('classification walk (L19)', () => {
  it('all-journaled run: current = longest = n, no freezes below 30', () => {
    const journaled = D.slice(0, 5)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: journaled, today: D[4] }),
    ).toEqual({ current: 5, longest: 5, freezesBanked: 0 })
  })

  it('a traded-but-unjournaled past day with an empty bank resets the run', () => {
    // J J M J J  (M = traded, no streak key, bank empty)
    const journaled = [D[0], D[1], D[3], D[4]]
    const trades = D.slice(0, 5)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[4] }),
    ).toEqual({ current: 2, longest: 2, freezesBanked: 0 })
  })

  it('neutral days (no trades, no key) never break and never extend', () => {
    // J J [3 neutral] J J — trades only on journaled days
    const journaled = [D[0], D[1], D[5], D[6]]
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: journaled, today: D[6] }),
    ).toEqual({ current: 4, longest: 4, freezesBanked: 0 })
  })

  it('neutral gaps of any length are bridged for free', () => {
    const journaled = [D[0], D[50]]
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: journaled, today: D[50] }),
    ).toEqual({ current: 2, longest: 2, freezesBanked: 0 })
  })

  it('misses BEFORE the earliest journaled date are outside the walk', () => {
    // trades on D0,D1 never journaled; first key on D2
    const journaled = [D[2], D[3]]
    const trades = D.slice(0, 4)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[3] }),
    ).toEqual({ current: 2, longest: 2, freezesBanked: 0 })
  })
})

describe('today handling (L19 — PENDING, never missed)', () => {
  it('today traded but not yet journaled → pending: run survives, does not extend', () => {
    const journaled = D.slice(0, 4) // D0..D3
    const trades = D.slice(0, 5) // D4 = today, traded, no key yet
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[4] }),
    ).toEqual({ current: 4, longest: 4, freezesBanked: 0 })
  })

  it('today journaled → extends the run', () => {
    const journaled = D.slice(0, 5)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: journaled, today: D[4] }),
    ).toEqual({ current: 5, longest: 5, freezesBanked: 0 })
  })

  it('today pending never consumes a freeze', () => {
    const journaled = D.slice(0, 30) // exactly 30 → bank 1
    const trades = [...D.slice(0, 30), D[30]] // today traded, unjournaled
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[30] }),
    ).toEqual({ current: 30, longest: 30, freezesBanked: 1 })
  })
})

describe('freeze mechanics (D9: earn each 30 consecutive, bank cap 2)', () => {
  it('29 journaled days → no freeze; the 30th earns one', () => {
    const j29 = D.slice(0, 29)
    expect(
      computeStreak({ journaledDates: j29, tradeDates: j29, today: D[28] })
        .freezesBanked,
    ).toBe(0)
    const j30 = D.slice(0, 30)
    expect(
      computeStreak({ journaledDates: j30, tradeDates: j30, today: D[29] })
        .freezesBanked,
    ).toBe(1)
  })

  it('bank caps at 2 — 90+ consecutive days still bank only 2', () => {
    const j90 = D.slice(0, 90)
    expect(
      computeStreak({ journaledDates: j90, tradeDates: j90, today: D[89] }),
    ).toEqual({ current: 90, longest: 90, freezesBanked: 2 })
  })

  it('single bridge: a miss consumes the freeze, the run continues', () => {
    // 30 J (bank 1), 1 M (bridged), 5 J → current 35 (bridge day counts
    // toward nothing), bank back to 0.
    const journaled = [...D.slice(0, 30), ...D.slice(31, 36)]
    const trades = D.slice(0, 36)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[35] }),
    ).toEqual({ current: 35, longest: 35, freezesBanked: 0 })
  })

  it('bridged days are excluded from the 30-counter: the 2nd freeze lands on the 60th JOURNALED day', () => {
    // 30 J (bank 1) + M (bridged, bank 0) + 29 J → 59 journaled: no freeze yet
    const j59 = [...D.slice(0, 30), ...D.slice(31, 60)]
    const t59 = D.slice(0, 60)
    expect(
      computeStreak({ journaledDates: j59, tradeDates: t59, today: D[59] }),
    ).toEqual({ current: 59, longest: 59, freezesBanked: 0 })
    // +1 more J → 60 journaled within the run → freeze #2 earned
    const j60 = [...j59, D[60]]
    const t60 = D.slice(0, 61)
    expect(
      computeStreak({ journaledDates: j60, tradeDates: t60, today: D[60] }),
    ).toEqual({ current: 60, longest: 60, freezesBanked: 1 })
  })

  it('consecutive misses drain the bank one each, then the run resets', () => {
    // 60 J (bank 2), M M (bridged ×2, bank 0), M (reset), 3 J
    const journaled = [...D.slice(0, 60), ...D.slice(63, 66)]
    const trades = D.slice(0, 66)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[65] }),
    ).toEqual({ current: 3, longest: 60, freezesBanked: 0 })
  })

  it('the 30-counter resets with the run — no freeze carry from a dead run', () => {
    // 29 J, M (bank 0 → reset), 30 J → the new run banks its own freeze at 30
    const journaled = [...D.slice(0, 29), ...D.slice(30, 60)]
    const trades = D.slice(0, 60)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[59] }),
    ).toEqual({ current: 30, longest: 30, freezesBanked: 1 })
  })
})

describe('retroactivity + repair (L19/A2 — the design lock)', () => {
  it('importing old untagged trades converts neutral → missed and can lower the streak', () => {
    const journaled = [D[0], D[1], D[3], D[4]]
    const before = computeStreak({
      journaledDates: journaled,
      tradeDates: journaled, // D2 neutral
      today: D[4],
    })
    expect(before).toEqual({ current: 4, longest: 4, freezesBanked: 0 })
    const after = computeStreak({
      journaledDates: journaled,
      tradeDates: [...journaled, D[2]], // D2 now a traded, unjournaled day
      today: D[4],
    })
    expect(after).toEqual({ current: 2, longest: 2, freezesBanked: 0 })
  })

  it('A2 repair: journaling the missed day later yields output IDENTICAL to never-missed — freeze bank included', () => {
    const allDays = D.slice(0, 40)
    // Interim state: D[20] traded but unjournaled → bank empty → reset.
    const interim = computeStreak({
      journaledDates: allDays.filter((d) => d !== D[20]),
      tradeDates: allDays,
      today: D[39],
    })
    expect(interim).toEqual({ current: 19, longest: 20, freezesBanked: 0 })
    // Repair: the user tags + rates D[20]; the sweep pays streak:{D[20]} —
    // the key now exists. Nothing was persisted about the "miss".
    const repaired = computeStreak({
      journaledDates: allDays,
      tradeDates: allDays,
      today: D[39],
    })
    const neverMissed = computeStreak({
      journaledDates: allDays,
      tradeDates: allDays,
      today: D[39],
    })
    expect(repaired).toEqual(neverMissed)
    expect(repaired).toEqual({ current: 40, longest: 40, freezesBanked: 1 })
  })
})

describe('edges', () => {
  it('empty inputs → zeros', () => {
    expect(
      computeStreak({ journaledDates: [], tradeDates: [], today: D[0] }),
    ).toEqual({ current: 0, longest: 0, freezesBanked: 0 })
    expect(
      computeStreak({ journaledDates: [], tradeDates: D.slice(0, 5), today: D[4] }),
    ).toEqual({ current: 0, longest: 0, freezesBanked: 0 })
  })

  it('single journaled day, today → current 1', () => {
    expect(
      computeStreak({ journaledDates: [D[0]], tradeDates: [D[0]], today: D[0] }),
    ).toEqual({ current: 1, longest: 1, freezesBanked: 0 })
  })

  it('longest survives a reset that current does not', () => {
    // 10 J, M (reset), 2 J
    const journaled = [...D.slice(0, 10), ...D.slice(11, 13)]
    const trades = D.slice(0, 13)
    expect(
      computeStreak({ journaledDates: journaled, tradeDates: trades, today: D[12] }),
    ).toEqual({ current: 2, longest: 10, freezesBanked: 0 })
  })

  it('defensive: earliest journaled date after today → zeros', () => {
    expect(
      computeStreak({ journaledDates: [D[5]], tradeDates: [D[5]], today: D[0] }),
    ).toEqual({ current: 0, longest: 0, freezesBanked: 0 })
  })
})
