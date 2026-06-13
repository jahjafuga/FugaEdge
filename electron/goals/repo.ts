// v0.2.5 Phase A — goals repo (spec §B). Stores config_json verbatim; the
// Phase B goals engine owns parsing/evaluation. Status transitions are the
// caller's responsibility — this layer only persists them.

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import type { CreateGoalInput, Goal, GoalStatus } from '@shared/identity-types'

const COLUMNS =
  'id, title, kind, config_json, preset_id, status, created_at, completed_at'

export function listGoals(status?: GoalStatus): Goal[] {
  const db = openDatabase()
  if (status) {
    return db
      .prepare(
        `SELECT ${COLUMNS} FROM goals WHERE status = ? ORDER BY created_at DESC`,
      )
      .all(status) as Goal[]
  }
  return db
    .prepare(`SELECT ${COLUMNS} FROM goals ORDER BY created_at DESC`)
    .all() as Goal[]
}

export function createGoal(input: CreateGoalInput): Goal {
  const db = openDatabase()
  const id = newUlid()
  const created_at = new Date().toISOString()
  db.prepare(
    `INSERT INTO goals (id, title, kind, config_json, preset_id, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title, input.kind, input.config_json, input.preset_id, 'active', created_at)
  return {
    id,
    title: input.title,
    kind: input.kind,
    config_json: input.config_json,
    preset_id: input.preset_id,
    status: 'active',
    created_at,
    completed_at: null,
  }
}

export function updateGoalStatus(
  id: string,
  status: GoalStatus,
  completedAt?: string,
): { updated: boolean } {
  const db = openDatabase()
  const info = db
    .prepare('UPDATE goals SET status = ?, completed_at = ? WHERE id = ?')
    .run(status, completedAt ?? null, id)
  return { updated: info.changes > 0 }
}
