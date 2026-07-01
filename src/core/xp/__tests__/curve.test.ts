import { describe, expect, it } from 'vitest'
import { LEVEL_CAP, levelForXp, levelProgress, totalXpForLevel } from '../curve'

// v0.2.5 Phase A Session 2 — level curve (spec §A1); gentled to k=11.
// totalXp(L) = 11·(L−1)²; cost of level L = 11·(2L−3) (a +22/level ramp);
// levelForXp = min(99, floor(1 + sqrt(xp/11))). ~31% faster than the old k=16
// (level 10 ≈ 2 weeks, level 99 ≈ 3.6 years for a dedicated daily user).

// The §A1 milestone table under k=11 (totalXp = 11·(L−1)²), verbatim.
const A1_MILESTONES: Array<[level: number, totalXp: number]> = [
  [1, 0],
  [5, 176],
  [10, 891],
  [20, 3_971],
  [30, 9_251],
  [40, 16_731],
  [50, 26_411],
  [60, 38_291],
  [70, 52_371],
  [80, 68_651],
  [90, 87_131],
  [95, 97_196],
  [99, 105_644],
]

describe('totalXpForLevel', () => {
  it.each(A1_MILESTONES)(
    'level %i requires %i total XP (§A1 milestone table)',
    (level, xp) => {
      expect(totalXpForLevel(level)).toBe(xp)
    },
  )

  it('cost identity: totalXp(L) − totalXp(L−1) = 11·(2L−3) for every L in 2..99', () => {
    for (let L = 2; L <= LEVEL_CAP; L++) {
      expect(totalXpForLevel(L) - totalXpForLevel(L - 1)).toBe(11 * (2 * L - 3))
    }
  })
})

describe('levelForXp', () => {
  it('xp = 0 → level 1', () => {
    expect(levelForXp(0)).toBe(1)
  })

  it('175/176 boundary: 175 XP is still level 4, 176 reaches level 5', () => {
    // totalXp(5) = 176.
    expect(levelForXp(175)).toBe(4)
    expect(levelForXp(176)).toBe(5)
  })

  it.each(A1_MILESTONES)(
    'the exact level-%i threshold (%i XP) maps to that level',
    (level, xp) => {
      expect(levelForXp(xp)).toBe(level)
    },
  )

  it('is the exact inverse of totalXpForLevel at every level 1..99', () => {
    // The quadratic form keeps thresholds exact: xp/11 recovers (L−1)² and
    // sqrt lands on the integer with no epsilon drift.
    for (let L = 1; L <= LEVEL_CAP; L++) {
      expect(levelForXp(totalXpForLevel(L))).toBe(L)
    }
  })

  it('clamps to 99 at and beyond 105,644', () => {
    expect(levelForXp(105_644)).toBe(99)
    expect(levelForXp(105_645)).toBe(99)
    expect(levelForXp(10_000_000)).toBe(99)
  })
})

describe('levelProgress', () => {
  it('mid-level: 1,440 XP → level 12, 109 into it, 144 needed for level 13', () => {
    // The current user's day-one state under k=11.
    // totalXp(12) = 1,331; totalXp(13) = 1,584.
    expect(levelProgress(1_440)).toEqual({
      level: 12,
      intoLevel: 109,
      neededForNext: 144,
    })
  })

  it('at an exact threshold: intoLevel 0, neededForNext = the full bracket', () => {
    // totalXp(10) = 891; cost of level 11 = 11·19 = 209.
    expect(levelProgress(891)).toEqual({
      level: 10,
      intoLevel: 0,
      neededForNext: 209,
    })
  })

  it('at the cap neededForNext is 0, even with surplus XP', () => {
    expect(levelProgress(105_644)).toEqual({
      level: 99,
      intoLevel: 0,
      neededForNext: 0,
    })
    expect(levelProgress(200_000)).toEqual({
      level: 99,
      intoLevel: 94_356,
      neededForNext: 0,
    })
  })
})

describe('LEVEL_CAP', () => {
  it('is 99', () => {
    expect(LEVEL_CAP).toBe(99)
  })
})
