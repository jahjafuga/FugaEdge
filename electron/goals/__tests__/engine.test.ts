import { describe, it, expect, beforeEach, vi } from 'vitest'

// v0.2.5 Phase B Session 5 — the goals evaluate-and-read engine (L25/L26/
// L27, D19). Mock-contract per the house precedent: repos + the equity
// query are stateful shims; the engine logic runs for real.
const { store } = vi.hoisted(() => ({
  store: {
    goals: [] as Array<Record<string, unknown>>,
    events: [] as Array<{ event_type: string; idempotency_key: string; created_at: string }>,
    badges: [] as Array<{ badge_id: string; tier: string | null; source_ref: string | null }>,
    insertCalls: 0,
    cumPnl: 0,
  },
}))

vi.mock('./../repo', () => ({
  listGoals: (status?: string) =>
    status ? store.goals.filter((g) => g.status === status) : [...store.goals],
  updateGoalStatus: (id: string, status: string, completedAt?: string) => {
    const g = store.goals.find((x) => x.id === id)
    if (!g) return { updated: false }
    g.status = status
    g.completed_at = completedAt ?? null
    return { updated: true }
  },
}))

vi.mock('../../xp/repo', () => ({
  listXpEvents: (opts: { sinceIso?: string } = {}) =>
    opts.sinceIso
      ? store.events.filter((e) => e.created_at >= opts.sinceIso!)
      : [...store.events],
  insertXpEvents: (intents: Array<{ idempotency_key: string; event_type: string }>) => {
    store.insertCalls += 1
    let n = 0
    for (const i of intents) {
      if (store.events.some((e) => e.idempotency_key === i.idempotency_key)) continue
      store.events.push({
        event_type: i.event_type,
        idempotency_key: i.idempotency_key,
        created_at: '2026-06-13T12:00:00.000Z',
      })
      n++
    }
    return n
  },
}))

vi.mock('../../badges/repo', () => ({
  awardBadge: (input: { badge_id: string; tier: string | null; source_ref?: string | null }) => {
    if (
      store.badges.some(
        (b) => b.badge_id === input.badge_id && (b.tier ?? '') === (input.tier ?? ''),
      )
    ) {
      return { inserted: false }
    }
    store.badges.push({
      badge_id: input.badge_id,
      tier: input.tier,
      source_ref: input.source_ref ?? null,
    })
    return { inserted: true }
  },
}))

vi.mock('./../equity', () => ({
  cumulativeNetPnlSince: () => store.cumPnl,
}))

import { awardGoalCompletion, evaluateAndListGoals } from '../engine'

function goal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'G1',
    title: 'Journal 30 Days',
    kind: 'process',
    config_json: '{"metric":"journaled_days","target":3}',
    status: 'active',
    created_at: '2026-06-01T00:00:00.000Z',
    completed_at: null,
    ...overrides,
  }
}

function streakEvent(created_at: string, key: string) {
  return { event_type: 'daily_streak_bonus', idempotency_key: key, created_at }
}

beforeEach(() => {
  store.goals = []
  store.events = []
  store.badges = []
  store.insertCalls = 0
  store.cumPnl = 0
})

describe('process progress (L25 — ledger counts since goal creation)', () => {
  it('counts only the metric event type with created_at >= goal.created_at', () => {
    store.goals = [goal()]
    store.events = [
      streakEvent('2026-05-20T00:00:00Z', 'streak:2026-05-20'), // before creation
      streakEvent('2026-06-02T00:00:00Z', 'streak:2026-06-02'),
      { event_type: 'trade_fully_annotated', idempotency_key: 'annotate:x', created_at: '2026-06-03T00:00:00Z' },
    ]
    const out = evaluateAndListGoals()
    expect(out.active[0].progress).toEqual({ current: 1, target: 3, fraction: 1 / 3 })
    expect(out.justCompleted).toEqual([])
  })

  it('a due process goal completes: status + goal_completed intent + badge + justCompleted', () => {
    store.goals = [goal()]
    store.events = [
      streakEvent('2026-06-02T00:00:00Z', 'streak:2026-06-02'),
      streakEvent('2026-06-03T00:00:00Z', 'streak:2026-06-03'),
      streakEvent('2026-06-04T00:00:00Z', 'streak:2026-06-04'),
    ]
    const out = evaluateAndListGoals()
    expect(out.justCompleted).toEqual(['G1'])
    expect(store.goals[0].status).toBe('completed')
    expect(
      store.events.some((e) => e.idempotency_key === 'goal:G1:completed'),
    ).toBe(true)
    expect(store.badges).toEqual([
      { badge_id: 'goal:G1', tier: null, source_ref: 'G1' },
    ])
    expect(out.completed.map((g) => g.id)).toEqual(['G1'])
  })

  it('idempotent: the second evaluate neither re-completes nor re-awards', () => {
    store.goals = [goal()]
    store.events = [
      streakEvent('2026-06-02T00:00:00Z', 'streak:2026-06-02'),
      streakEvent('2026-06-03T00:00:00Z', 'streak:2026-06-03'),
      streakEvent('2026-06-04T00:00:00Z', 'streak:2026-06-04'),
    ]
    evaluateAndListGoals()
    const callsAfterFirst = store.insertCalls
    const second = evaluateAndListGoals()
    expect(second.justCompleted).toEqual([])
    expect(store.insertCalls).toBe(callsAfterFirst) // no new intent batches
    expect(store.badges).toHaveLength(1)
  })
})

describe('equity progress + the D19 wall (L26)', () => {
  const equityGoal = () =>
    goal({
      id: 'E1',
      title: 'Grow it',
      kind: 'equity',
      config_json: '{"start_date":"2026-06-01","start_amount":2000,"target_amount":3000}',
    })

  it('progress = start + cumPnl vs target, fraction clamped', () => {
    store.goals = [equityGoal()]
    store.cumPnl = 400
    const out = evaluateAndListGoals()
    expect(out.active[0].progress).toEqual({ current: 2400, target: 3000, fraction: 0.4 })
  })

  it('a met equity goal completes with status + badge and ZERO xp inserts (D19)', () => {
    store.goals = [equityGoal()]
    store.cumPnl = 1500 // 2000 + 1500 >= 3000
    const out = evaluateAndListGoals()
    expect(out.justCompleted).toEqual(['E1'])
    expect(store.goals[0].status).toBe('completed')
    expect(store.badges).toEqual([
      { badge_id: 'goal:E1', tier: null, source_ref: 'E1' },
    ])
    expect(store.insertCalls).toBe(0) // the wall: no intent batch was ever sent
    expect(store.events).toHaveLength(0)
  })

  it('awardGoalCompletion THROWS on an equity goal (the programmer-error guard)', () => {
    expect(() => awardGoalCompletion(equityGoal() as never)).toThrow(/equity/i)
  })

  it('fraction clamps to 1 when past the target', () => {
    store.goals = [equityGoal()]
    store.cumPnl = 5000
    const out = evaluateAndListGoals()
    expect(out.completed).toHaveLength(1) // completed this call
    expect(out.justCompleted).toEqual(['E1'])
  })
})

describe('defensive + pass-through', () => {
  it('corrupt config_json → progress null, never completes, no throw', () => {
    store.goals = [goal({ config_json: 'not json' })]
    const out = evaluateAndListGoals()
    expect(out.active[0].progress).toBeNull()
    expect(out.justCompleted).toEqual([])
    expect(store.goals[0].status).toBe('active')
  })

  it('completed and abandoned goals pass through to their lists', () => {
    store.goals = [
      goal({ id: 'C1', status: 'completed' }),
      goal({ id: 'A1', status: 'abandoned' }),
    ]
    const out = evaluateAndListGoals()
    expect(out.active).toEqual([])
    expect(out.completed.map((g) => g.id)).toEqual(['C1'])
    expect(out.abandoned.map((g) => g.id)).toEqual(['A1'])
  })
})
