import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock-contract tests (capturing-shim pattern — see settings repo.test.ts).
// The shim emulates the (badge_id, IFNULL(tier,'')) identity index so the
// INSERT OR IGNORE contract — including the NULL-tier case (P2) — is
// asserted here; SQLite's REAL NULL semantics are proven by the Session 1
// sandbox smoke against the actual driver (the mock cannot prove those).
const { store } = vi.hoisted(() => ({
  store: { rows: [] as Record<string, unknown>[] },
}))

const identity = (badge_id: string, tier: string | null) =>
  `${badge_id}|${tier ?? ''}`

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      if (/INSERT OR IGNORE INTO badge_awards/i.test(sql)) {
        return {
          run: (
            id: string,
            badge_id: string,
            tier: string | null,
            awarded_at: string,
            source_ref: string | null,
          ) => {
            const key = identity(badge_id, tier)
            const exists = store.rows.some(
              (r) => identity(r.badge_id as string, r.tier as string | null) === key,
            )
            if (exists) return { changes: 0 }
            store.rows.push({ id, badge_id, tier, awarded_at, source_ref })
            return { changes: 1 }
          },
        }
      }
      if (/SELECT .* FROM badge_awards/i.test(sql)) {
        return { all: () => [...store.rows] }
      }
      throw new Error(`badges shim: unexpected SQL: ${sql}`)
    },
  }),
}))

import { awardBadge, listBadgeAwards } from '../repo'

beforeEach(() => {
  store.rows = []
})

describe('badges repo', () => {
  it('awards a tiered badge once; the duplicate pair is ignored', () => {
    expect(
      awardBadge({ badge_id: 'journaler', tier: 'copper', source_ref: 'sweep' }),
    ).toEqual({ inserted: true })
    expect(
      awardBadge({ badge_id: 'journaler', tier: 'copper' }),
    ).toEqual({ inserted: false })
    expect(listBadgeAwards()).toHaveLength(1)
  })

  it('a different tier of the same badge is a distinct award', () => {
    awardBadge({ badge_id: 'journaler', tier: 'copper' })
    expect(awardBadge({ badge_id: 'journaler', tier: 'silver' })).toEqual({
      inserted: true,
    })
    expect(listBadgeAwards()).toHaveLength(2)
  })

  it('P2: the same untiered (NULL-tier) badge twice → second is ignored', () => {
    expect(
      awardBadge({ badge_id: 'goal:01ABC', tier: null, source_ref: 'goal' }),
    ).toEqual({ inserted: true })
    expect(awardBadge({ badge_id: 'goal:01ABC', tier: null })).toEqual({
      inserted: false,
    })
    expect(listBadgeAwards()).toHaveLength(1)
  })

  it('listBadgeAwards returns persisted shape (tier null preserved)', () => {
    awardBadge({ badge_id: 'goal:01ABC', tier: null })
    const [row] = listBadgeAwards()
    expect(row.badge_id).toBe('goal:01ABC')
    expect(row.tier).toBeNull()
    expect(row.id).toHaveLength(26)
    expect(row.awarded_at).not.toBe('')
  })
})
