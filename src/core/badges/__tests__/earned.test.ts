import { describe, expect, it } from 'vitest'
import { earnedGrades, type BadgeStats } from '../earned'

// v0.2.5 — the pure badge earn-rule (auto-minting). Given a stat-set, return
// every badge GRADE earned: mint-all-tiers (each grade whose threshold is met),
// milestones read the FLOORED level, and the two condition badges (Locked-In,
// Sharpening) + the challenge badges are NEVER auto-minted here.

const ZERO: BadgeStats = {
  sessionCount: 0,
  archiveCount: 0,
  reviewCount: 0,
  disciplinedCount: 0,
  longestStreak: 0,
  flooredLevel: 0,
}
const has = (
  g: ReturnType<typeof earnedGrades>,
  badge_id: string,
  tier: string | null,
) => g.some((x) => x.badge_id === badge_id && x.tier === tier)

describe('earnedGrades', () => {
  it('Journaler: 16 sessions earns copper only (mint-all-tiers)', () => {
    const g = earnedGrades({ ...ZERO, sessionCount: 16 })
    expect(has(g, 'journaler', 'copper')).toBe(true)
    expect(has(g, 'journaler', 'silver')).toBe(false)
    expect(has(g, 'journaler', 'gold')).toBe(false)
  })

  it('Journaler: 50 sessions earns copper + silver', () => {
    const g = earnedGrades({ ...ZERO, sessionCount: 50 })
    expect(has(g, 'journaler', 'copper')).toBe(true)
    expect(has(g, 'journaler', 'silver')).toBe(true)
    expect(has(g, 'journaler', 'gold')).toBe(false)
  })

  it('Journaler: 9 sessions earns nothing', () => {
    const g = earnedGrades({ ...ZERO, sessionCount: 9 })
    expect(g.filter((x) => x.badge_id === 'journaler')).toHaveLength(0)
  })

  it('Streak: longest 17 earns copper (>=7), not silver', () => {
    const g = earnedGrades({ ...ZERO, longestStreak: 17 })
    expect(has(g, 'streak', 'copper')).toBe(true)
    expect(has(g, 'streak', 'silver')).toBe(false)
  })

  it('Streak: longest 30 earns copper + silver', () => {
    const g = earnedGrades({ ...ZERO, longestStreak: 30 })
    expect(has(g, 'streak', 'copper')).toBe(true)
    expect(has(g, 'streak', 'silver')).toBe(true)
  })

  it('Streak: longest 6 earns nothing', () => {
    const g = earnedGrades({ ...ZERO, longestStreak: 6 })
    expect(g.filter((x) => x.badge_id === 'streak')).toHaveLength(0)
  })

  it('Milestone: floored level 12 earns Level-10, not Level-25', () => {
    const g = earnedGrades({ ...ZERO, flooredLevel: 12 })
    expect(has(g, 'level-10', null)).toBe(true)
    expect(has(g, 'level-25', null)).toBe(false)
  })

  it('Milestone: floored level 25 earns Level-10 and Level-25, not Level-50', () => {
    const g = earnedGrades({ ...ZERO, flooredLevel: 25 })
    expect(has(g, 'level-10', null)).toBe(true)
    expect(has(g, 'level-25', null)).toBe(true)
    expect(has(g, 'level-50', null)).toBe(false)
  })

  it('condition + challenge badges are never auto-minted (even at max stats)', () => {
    const g = earnedGrades({
      sessionCount: 999,
      archiveCount: 999,
      reviewCount: 999,
      disciplinedCount: 999,
      longestStreak: 999,
      flooredLevel: 99,
    })
    expect(g.some((x) => x.badge_id === 'locked-in')).toBe(false)
    expect(g.some((x) => x.badge_id === 'sharpening')).toBe(false)
    expect(g.some((x) => x.badge_id.startsWith('challenge-'))).toBe(false)
  })

  it('zero stats earn nothing', () => {
    expect(earnedGrades(ZERO)).toEqual([])
  })
})
