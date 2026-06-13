import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock-contract tests per the settings-repo precedent (capturing-shim over
// the openDatabase mock — better-sqlite3 doesn't load under vitest). The
// shim emulates exactly the statements the repo issues; the real-driver
// behavior is separately proven by the Session 1 sandbox smokes.
const { store } = vi.hoisted(() => ({
  store: {
    profileRow: null as Record<string, unknown> | null,
    minTradeDate: null as string | null,
  },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      if (/SELECT \* FROM profile/i.test(sql)) {
        return { get: () => store.profileRow ?? undefined }
      }
      if (/MIN\(date\)/i.test(sql)) {
        return { get: () => ({ d: store.minTradeDate }) }
      }
      if (/INSERT INTO profile/i.test(sql)) {
        return {
          run: (
            id: string,
            member_since: string,
            created_at: string,
            updated_at: string,
          ) => {
            store.profileRow = {
              id,
              display_name: null,
              handle: null,
              avatar_data: null,
              trading_style: null,
              markets: null,
              bio: null,
              featured_badges_json: '[]',
              member_since,
              created_at,
              updated_at,
            }
            return { changes: 1 }
          },
        }
      }
      if (/UPDATE profile SET/i.test(sql)) {
        // The repo builds `SET col = ?, ... , updated_at = ? WHERE id = ?`.
        const cols = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1])
        return {
          run: (...args: unknown[]) => {
            const row = store.profileRow
            if (!row) return { changes: 0 }
            cols.forEach((col, i) => {
              row[col] = args[i]
            })
            return { changes: 1 }
          },
        }
      }
      throw new Error(`profile shim: unexpected SQL: ${sql}`)
    },
  }),
}))

import { getOrCreateProfile, updateProfile } from '../repo'

beforeEach(() => {
  store.profileRow = null
  store.minTradeDate = null
})

describe('profile repo', () => {
  it('seeds the single row on first call — no trades → member_since = today (L2)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const p = getOrCreateProfile()
    expect(p.id).toHaveLength(26)
    expect(p.member_since).toBe(today)
    expect(p.featured_badges).toEqual([])
  })

  it('seeds member_since from the earliest non-deleted trade when trades exist (L2)', () => {
    store.minTradeDate = '2026-01-05'
    const p = getOrCreateProfile()
    expect(p.member_since).toBe('2026-01-05')
  })

  it('is idempotent — the second call returns the same row, no reseed', () => {
    const first = getOrCreateProfile()
    store.minTradeDate = '2020-01-01' // would change member_since IF it reseeded
    const second = getOrCreateProfile()
    expect(second.id).toBe(first.id)
    expect(second.member_since).toBe(first.member_since)
  })

  it('updateProfile writes only provided fields, serializes featured_badges, bumps updated_at', () => {
    const before = getOrCreateProfile()
    const updated = updateProfile({
      display_name: 'Lao',
      featured_badges: ['streak', 'journaler'],
    })
    expect(updated.display_name).toBe('Lao')
    expect(updated.featured_badges).toEqual(['streak', 'journaler'])
    expect(updated.handle).toBeNull() // untouched
    expect(updated.member_since).toBe(before.member_since) // untouched
    expect(updated.updated_at).not.toBeNull()
  })

  it('R4 — rejects featured_badges over the cap of 3 (loud, not a silent truncate)', () => {
    getOrCreateProfile()
    expect(() =>
      updateProfile({ featured_badges: ['a', 'b', 'c', 'd'] }),
    ).toThrow(/cap of 3/)
  })

  it('R4 — accepts exactly 3 featured badges', () => {
    getOrCreateProfile()
    expect(
      updateProfile({ featured_badges: ['a', 'b', 'c'] }).featured_badges,
    ).toEqual(['a', 'b', 'c'])
  })
})
