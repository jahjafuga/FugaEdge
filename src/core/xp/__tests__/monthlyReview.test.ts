// THE MONTH GETS ITS OWN KEY, ITS OWN GUARD AND ITS OWN AWARD.
//
// The idempotency key is the ENTIRE dedup mechanism (schema.ts:620-622 --
// idempotency_key TEXT NOT NULL UNIQUE), and it is written once and never
// revoked. That makes two things load-bearing:
//
//   the PREFIX  -- if a month could ever mint a string a week could also mint,
//                  one period would silently consume the other's award, and no
//                  constraint anywhere would notice. AI2 does not reason about
//                  this; it drives every month of a year against every Sunday
//                  those months contain.
//   the GUARD   -- buildWeeklyReviewIntent throws on a non-Sunday because a
//                  wrong anchor would mint a DIFFERENT key for the same logical
//                  week: a double-award idempotency cannot catch (engine.ts
//                  :185-189). A month id has exactly the same failure mode, so
//                  it gets exactly the same treatment.
import { describe, expect, it } from 'vitest'
import { buildMonthlyReviewIntent, buildWeeklyReviewIntent } from '../engine'
import { XP_AWARDS } from '../awards'
import { MONTHLY_REVIEW_XP } from '../awards'

/** Every Sunday of 2026, as bare YYYY-MM-DD. */
function sundaysOf(year: number): string[] {
  const out: string[] = []
  const d = new Date(Date.UTC(year, 0, 1))
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1)
  while (d.getUTCFullYear() === year) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 7)
  }
  return out
}

const pad = (n: number) => (n < 10 ? `0${n}` : String(n))

describe('AI the monthly review', () => {
  it('AI2 the monthly key and the weekly key can never be equal', () => {
    // EVERY month of four years against EVERY Sunday of those years -- not a
    // sampled pair. A collision needs only one.
    const collisions: string[] = []
    let pairs = 0
    for (const year of [2024, 2025, 2026, 2027]) {
      const sundays = sundaysOf(year)
      for (let mo = 1; mo <= 12; mo++) {
        const monthKey = buildMonthlyReviewIntent(`${year}-${pad(mo)}`).idempotency_key
        for (const sun of sundays) {
          pairs += 1
          const weekKey = buildWeeklyReviewIntent(sun).idempotency_key
          if (monthKey === weekKey) collisions.push(`${monthKey} === ${weekKey}`)
        }
      }
    }
    expect(pairs, 'the sweep drove nothing').toBeGreaterThan(2000)
    expect(collisions, collisions.join('\n')).toEqual([])

    // and the prefixes differ BEFORE any date is interpolated, which is what
    // makes the sweep above a demonstration rather than the proof
    const m = buildMonthlyReviewIntent('2026-06').idempotency_key
    const w = buildWeeklyReviewIntent('2026-06-07').idempotency_key
    expect(m.split(':')[0]).not.toBe(w.split(':')[0])
    expect(w.startsWith('weekly_review:')).toBe(true)
    expect(m.startsWith('weekly_review:'), 'the month borrowed the week prefix').toBe(false)
  })

  it('AI3 the monthly intent rejects an id that is not YYYY-MM', () => {
    expect(buildMonthlyReviewIntent('2026-06')).toEqual({
      event_type: 'monthly_review_completed',
      xp: MONTHLY_REVIEW_XP,
      idempotency_key: 'monthly_review:2026-06',
      source_ref: '2026-06',
    })
    // The SAME failure mode the Sunday guard exists for: a caller passing a
    // day, or an unpadded month, would mint a different key for the same
    // logical month -- a double-award idempotency cannot catch.
    for (const bad of [
      '2026-6', // unpadded
      '2026-06-01', // a day, not a month
      '2026-13', // not a real month
      '2026-00',
      '2026', // no month at all
      '',
      '2026-06T00:00:00Z',
    ]) {
      expect(() => buildMonthlyReviewIntent(bad), `${bad} was accepted`).toThrow()
    }
  })

  it('AI4 XP_AWARDS carries the monthly award, and stays exhaustive', () => {
    expect(XP_AWARDS.monthly_review_completed).toEqual({ xp: MONTHLY_REVIEW_XP })
    expect(MONTHLY_REVIEW_XP).toBe(761)
    // The scale it was derived from is unchanged.
    expect(XP_AWARDS.weekly_review_completed.xp, 'the weekly award moved').toBe(175)
    expect(XP_AWARDS.goal_completed.xp).toBe(1000)
    // A month is worth more than one of its weeks and less than a goal.
    expect(MONTHLY_REVIEW_XP).toBeGreaterThan(XP_AWARDS.weekly_review_completed.xp)
    expect(MONTHLY_REVIEW_XP).toBeLessThan(XP_AWARDS.goal_completed.xp)
    // No per-date cap: a month is not a date.
    expect('capPerDate' in XP_AWARDS.monthly_review_completed).toBe(false)
  })

  it('AI9 CONTROL: the weekly Sunday guard is untouched', () => {
    // Byte for byte the case engine.test.ts:432 pins, repeated here because
    // this beat adds a builder BESIDE that one and must not widen it.
    expect(buildWeeklyReviewIntent('2026-06-07')).toEqual({
      event_type: 'weekly_review_completed',
      xp: 175,
      idempotency_key: 'weekly_review:2026-06-07',
      source_ref: '2026-06-07',
    })
    expect(() => buildWeeklyReviewIntent('2026-06-08'), 'a Monday was accepted').toThrow()
    expect(() => buildWeeklyReviewIntent('2026-06'), 'a month id was accepted').toThrow()
    for (const bad of ['2026-6-7', '2026-06-07T00:00:00Z', '2026-02-31', '']) {
      expect(() => buildWeeklyReviewIntent(bad), `${bad} was accepted`).toThrow()
    }
  })
})
