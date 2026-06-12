import { describe, expect, it } from 'vitest'
import { LEVEL_CAP, levelForXp, levelProgress, totalXpForLevel } from '../curve'

// v0.2.5 Phase A Session 2 — level curve (spec §A1).
// totalXp(L) = 16·(L−1)²; cost of level L = 16·(2L−3) (a +32/level ramp);
// levelForXp = min(99, floor(1 + sqrt(xp/16))).

// All 13 rows of the §A1 milestone table, verbatim.
const A1_MILESTONES: Array<[level: number, totalXp: number]> = [
  [1, 0],
  [5, 256],
  [10, 1_296],
  [20, 5_776],
  [30, 13_456],
  [40, 24_336],
  [50, 38_416],
  [60, 55_696],
  [70, 76_176],
  [80, 99_856],
  [90, 126_736],
  [95, 141_376],
  [99, 153_664],
]

describe('totalXpForLevel', () => {
  it.each(A1_MILESTONES)(
    'level %i requires %i total XP (§A1 milestone table)',
    (level, xp) => {
      expect(totalXpForLevel(level)).toBe(xp)
    },
  )

  it('cost identity: totalXp(L) − totalXp(L−1) = 16·(2L−3) for every L in 2..99', () => {
    for (let L = 2; L <= LEVEL_CAP; L++) {
      expect(totalXpForLevel(L) - totalXpForLevel(L - 1)).toBe(16 * (2 * L - 3))
    }
  })
})

describe('levelForXp', () => {
  it('xp = 0 → level 1', () => {
    expect(levelForXp(0)).toBe(1)
  })

  it('255/256 boundary: 255 XP is still level 4, 256 reaches level 5', () => {
    expect(levelForXp(255)).toBe(4)
    expect(levelForXp(256)).toBe(5)
  })

  it.each(A1_MILESTONES)(
    'the exact level-%i threshold (%i XP) maps to that level',
    (level, xp) => {
      expect(levelForXp(xp)).toBe(level)
    },
  )

  it('clamps to 99 at and beyond 153,664', () => {
    expect(levelForXp(153_664)).toBe(99)
    expect(levelForXp(153_665)).toBe(99)
    expect(levelForXp(10_000_000)).toBe(99)
  })
})

describe('levelProgress', () => {
  it('mid-level: 300 XP → level 5, 44 into it, 100 needed for level 6', () => {
    // totalXp(5) = 256, totalXp(6) = 400.
    expect(levelProgress(300)).toEqual({
      level: 5,
      intoLevel: 44,
      neededForNext: 100,
    })
  })

  it('at an exact threshold: intoLevel 0, neededForNext = the full bracket', () => {
    // totalXp(10) = 1,296; cost of level 11 = 16·19 = 304.
    expect(levelProgress(1_296)).toEqual({
      level: 10,
      intoLevel: 0,
      neededForNext: 304,
    })
  })

  it('at the cap neededForNext is 0, even with surplus XP', () => {
    expect(levelProgress(153_664)).toEqual({
      level: 99,
      intoLevel: 0,
      neededForNext: 0,
    })
    expect(levelProgress(200_000)).toEqual({
      level: 99,
      intoLevel: 46_336,
      neededForNext: 0,
    })
  })
})

describe('LEVEL_CAP', () => {
  it('is 99', () => {
    expect(LEVEL_CAP).toBe(99)
  })
})
