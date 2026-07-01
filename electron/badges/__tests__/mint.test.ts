import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the electron-side deps mintEarnedBadges reads (the reconcile-test
// pattern). earnedGrades / computeStreak / todayDateISO are pure core — they run.
const { store } = vi.hoisted(() => ({
  store: {
    events: [] as { event_type: string }[],
    streakKeys: [] as string[],
    tradeDates: [] as string[],
    level: 0,
    awardInserted: true,
    awarded: [] as { badge_id: string; tier: string | null }[],
  },
}))

vi.mock('../../xp/repo', () => ({
  listXpEvents: () => store.events,
  listIdempotencyKeys: (prefix?: string) =>
    prefix === 'streak:' ? store.streakKeys : [],
}))
vi.mock('../../xp/facts', () => ({ listTradeDates: () => store.tradeDates }))
vi.mock('../../xp/level', () => ({
  displayedLevel: () => ({
    totalXp: 0,
    level: store.level,
    intoLevel: 0,
    neededForNext: 0,
  }),
}))
vi.mock('../execution-facts', () => ({
  countGreenDays: () => 0,
  countWinningTrades: () => 0,
  countLowFloatTrades: () => 0,
  longestGreenStreak: () => 0,
}))
vi.mock('../repo', () => ({
  awardBadge: (input: { badge_id: string; tier: string | null }) => {
    store.awarded.push({ badge_id: input.badge_id, tier: input.tier })
    return { inserted: store.awardInserted }
  },
}))

import { mintEarnedBadges } from '../mint'

beforeEach(() => {
  store.events = []
  store.streakKeys = []
  store.tradeDates = []
  store.level = 0
  store.awardInserted = true
  store.awarded = []
})

describe('mintEarnedBadges — the newly-minted signal', () => {
  it('returns the newly-inserted grades on a fresh mint', () => {
    // 10 session_journaled -> Journaler copper (threshold 10); nothing else earned.
    store.events = Array.from({ length: 10 }, () => ({ event_type: 'session_journaled' }))
    store.awardInserted = true
    const minted = mintEarnedBadges()
    expect(minted).toEqual([{ badge_id: 'journaler', tier: 'copper' }])
  })

  it('returns [] on a second run — everything already present (inserted:false)', () => {
    store.events = Array.from({ length: 10 }, () => ({ event_type: 'session_journaled' }))
    store.awardInserted = false
    expect(mintEarnedBadges()).toEqual([])
    // still ATTEMPTED the award (idempotent INSERT OR IGNORE), just nothing new
    expect(store.awarded).toContainEqual({ badge_id: 'journaler', tier: 'copper' })
  })
})
