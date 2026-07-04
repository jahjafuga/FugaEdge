import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the electron-side deps mintEarnedBadges reads (the reconcile-test
// pattern). earnedGrades / computeStreak / todayDateISO are pure core — they run.
const { store, insertXpEvents } = vi.hoisted(() => ({
  store: {
    events: [] as { event_type: string }[],
    streakKeys: [] as string[],
    tradeDates: [] as string[],
    level: 0,
    awardInserted: true,
    awarded: [] as { badge_id: string; tier: string | null }[],
    profitPeak: 0,
  },
  // THE XP FENCE SPY (Arc 3): minting must NEVER write XP — the mock makes
  // any such call visible instead of silently undefined.
  insertXpEvents: vi.fn(),
}))

vi.mock('../../xp/repo', () => ({
  listXpEvents: () => store.events,
  listIdempotencyKeys: (prefix?: string) =>
    prefix === 'streak:' ? store.streakKeys : [],
  insertXpEvents,
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
vi.mock('../money-facts', () => ({
  profitPeak: () => store.profitPeak,
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
  store.profitPeak = 0
  insertXpEvents.mockClear()
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

// Arc 3 Beat 1 — the money milestones through the mint path: the profit
// peak feeds the rungs, the multi-earn cascade mints every crossed rung in
// one sweep, and THE XP FENCE holds — a milestone mint writes ZERO XP.
describe('mintEarnedBadges — the money milestones + THE XP FENCE (Arc 3)', () => {
  it('peak 150 mints exactly the $100 rung (gold)', () => {
    store.profitPeak = 150
    const minted = mintEarnedBadges()
    expect(minted).toContainEqual({ badge_id: 'money-100', tier: 'gold' })
    expect(minted.filter((m) => m.badge_id.startsWith('money-'))).toHaveLength(1)
  })

  it('peak 1,000,000 mints ALL FIVE rungs in one call (the cascade)', () => {
    store.profitPeak = 1_000_000
    const minted = mintEarnedBadges()
    for (const id of ['money-100', 'money-1k', 'money-10k', 'money-100k', 'money-1m']) {
      expect(minted).toContainEqual({ badge_id: id, tier: 'gold' })
    }
  })

  it("THE XP FENCE: a milestone mint calls insertXpEvents EXACTLY ZERO times — the beat's cornerstone", () => {
    store.profitPeak = 1_000_000
    const minted = mintEarnedBadges()
    expect(minted.length).toBeGreaterThan(0)
    expect(insertXpEvents).not.toHaveBeenCalled()
  })
})
