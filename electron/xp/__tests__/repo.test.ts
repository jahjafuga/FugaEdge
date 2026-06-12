import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { XpAwardIntent } from '@shared/xp-types'

// Mock-contract tests (capturing-shim pattern — see settings repo.test.ts).
// The shim emulates the UNIQUE(idempotency_key) INSERT OR IGNORE contract;
// the real driver's constraint is proven by the Session 1 sandbox smoke.
const { store } = vi.hoisted(() => ({
  store: { rows: [] as Record<string, unknown>[] },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      if (/INSERT OR IGNORE INTO xp_events/i.test(sql)) {
        return {
          run: (
            id: string,
            event_type: string,
            source_ref: string | null,
            xp: number,
            idempotency_key: string,
            created_at: string,
          ) => {
            if (store.rows.some((r) => r.idempotency_key === idempotency_key)) {
              return { changes: 0 }
            }
            store.rows.push({ id, event_type, source_ref, xp, idempotency_key, created_at })
            return { changes: 1 }
          },
        }
      }
      if (/SELECT COALESCE\(SUM\(xp\), 0\)/i.test(sql)) {
        return {
          get: () => ({
            total: store.rows.reduce((s, r) => s + (r.xp as number), 0),
          }),
        }
      }
      if (/SELECT idempotency_key FROM xp_events WHERE idempotency_key LIKE/i.test(sql)) {
        return {
          all: (like: string) => {
            const prefix = like.replace(/%$/, '')
            return store.rows
              .filter((r) => (r.idempotency_key as string).startsWith(prefix))
              .map((r) => ({ idempotency_key: r.idempotency_key }))
          },
        }
      }
      if (/SELECT idempotency_key FROM xp_events/i.test(sql)) {
        return {
          all: () => store.rows.map((r) => ({ idempotency_key: r.idempotency_key })),
        }
      }
      if (/SELECT .* FROM xp_events WHERE created_at >=/i.test(sql)) {
        return {
          all: (since: string) =>
            store.rows.filter((r) => (r.created_at as string) >= since),
        }
      }
      if (/SELECT .* FROM xp_events/i.test(sql)) {
        return { all: () => [...store.rows] }
      }
      throw new Error(`xp shim: unexpected SQL: ${sql}`)
    },
    transaction: (fn: (...args: unknown[]) => unknown) => (...args: unknown[]) =>
      fn(...args),
  }),
}))

import {
  getXpTotal,
  insertXpEvents,
  listIdempotencyKeys,
  listXpEvents,
} from '../repo'

beforeEach(() => {
  store.rows = []
})

const intents: XpAwardIntent[] = [
  {
    event_type: 'session_journaled',
    xp: 40,
    idempotency_key: 'session:2026-06-10',
    source_ref: '2026-06-10',
  },
  {
    event_type: 'trade_fully_annotated',
    xp: 12,
    idempotency_key: 'annotate:abc123',
  },
]

describe('xp repo', () => {
  it('insertXpEvents inserts a fresh batch and reports the count', () => {
    expect(insertXpEvents(intents)).toBe(2)
    expect(getXpTotal()).toBe(52)
  })

  it('replaying the identical batch inserts zero (idempotency contract)', () => {
    insertXpEvents(intents)
    expect(insertXpEvents(intents)).toBe(0)
    expect(getXpTotal()).toBe(52)
  })

  it('a mixed batch inserts only the new intents', () => {
    insertXpEvents(intents)
    const mixed: XpAwardIntent[] = [
      ...intents,
      { event_type: 'daily_streak_bonus', xp: 25, idempotency_key: 'streak:2026-06-10' },
    ]
    expect(insertXpEvents(mixed)).toBe(1)
    expect(getXpTotal()).toBe(77)
  })

  it('listIdempotencyKeys returns all keys, or filters by prefix', () => {
    insertXpEvents(intents)
    expect(listIdempotencyKeys().sort()).toEqual([
      'annotate:abc123',
      'session:2026-06-10',
    ])
    expect(listIdempotencyKeys('session:')).toEqual(['session:2026-06-10'])
  })

  it('listXpEvents returns rows, optionally since an ISO timestamp', () => {
    insertXpEvents(intents)
    const all = listXpEvents()
    expect(all).toHaveLength(2)
    expect(all[0].id).toHaveLength(26)
    const future = listXpEvents({ sinceIso: '2999-01-01T00:00:00.000Z' })
    expect(future).toHaveLength(0)
  })
})
