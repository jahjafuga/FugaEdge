import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock-contract tests (capturing-shim pattern — see settings repo.test.ts).
const { store } = vi.hoisted(() => ({
  store: { rows: [] as Record<string, unknown>[] },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      if (/INSERT INTO goals/i.test(sql)) {
        return {
          run: (
            id: string,
            title: string,
            kind: string,
            config_json: string,
            preset_id: string | null,
            status: string,
            created_at: string,
          ) => {
            store.rows.push({
              id,
              title,
              kind,
              config_json,
              preset_id,
              status,
              created_at,
              completed_at: null,
            })
            return { changes: 1 }
          },
        }
      }
      if (/UPDATE goals SET status/i.test(sql)) {
        return {
          run: (status: string, completed_at: string | null, id: string) => {
            const row = store.rows.find((r) => r.id === id)
            if (!row) return { changes: 0 }
            row.status = status
            row.completed_at = completed_at
            return { changes: 1 }
          },
        }
      }
      if (/SELECT .* FROM goals WHERE status/i.test(sql)) {
        return {
          all: (status: string) => store.rows.filter((r) => r.status === status),
        }
      }
      if (/SELECT .* FROM goals/i.test(sql)) {
        return { all: () => [...store.rows] }
      }
      throw new Error(`goals shim: unexpected SQL: ${sql}`)
    },
  }),
}))

import { createGoal, listGoals, updateGoalStatus } from '../repo'

beforeEach(() => {
  store.rows = []
})

describe('goals repo', () => {
  it('createGoal mints a ULID, status active, stores preset_id, returns the row', () => {
    const g = createGoal({
      title: 'Journal 30 days',
      kind: 'process',
      config_json: '{"metric":"journaled_days","target":30}',
      preset_id: 'journal-30',
    })
    expect(g.id).toHaveLength(26)
    expect(g.status).toBe('active')
    expect(g.kind).toBe('process')
    expect(g.preset_id).toBe('journal-30')
    expect(g.completed_at).toBeNull()
    expect(g.created_at).not.toBeNull()
  })

  it('listGoals returns everything; listGoals(status) filters', () => {
    createGoal({ title: 'A', kind: 'process', config_json: '{}', preset_id: null })
    const b = createGoal({ title: 'B', kind: 'equity', config_json: '{}', preset_id: null })
    updateGoalStatus(b.id, 'completed', '2026-06-12T00:00:00.000Z')
    expect(listGoals()).toHaveLength(2)
    expect(listGoals('active').map((g) => g.title)).toEqual(['A'])
    expect(listGoals('completed').map((g) => g.title)).toEqual(['B'])
  })

  it('updateGoalStatus sets status + completed_at and reports updated', () => {
    const g = createGoal({ title: 'A', kind: 'process', config_json: '{}', preset_id: null })
    const res = updateGoalStatus(g.id, 'completed', '2026-06-12T00:00:00.000Z')
    expect(res).toEqual({ updated: true })
    expect(listGoals('completed')[0].completed_at).toBe(
      '2026-06-12T00:00:00.000Z',
    )
  })

  it('updateGoalStatus on a missing id reports updated: false', () => {
    expect(updateGoalStatus('01JXXXXXXXXXXXXXXXXXXXXXXX', 'abandoned')).toEqual(
      { updated: false },
    )
  })
})
