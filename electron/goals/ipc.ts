// v0.2.5 Phase B Session 5 — goals IPC (L27/L29). Thin per ARCHITECTURE.md:
// validation is the pure core's (validateCreateGoal), evaluation is the
// engine's; handlers route and shape. No handler-level unit tests (no house
// IPC-test pattern); engine + validator suites carry the logic and the
// Session 5 fixture smoke proves the channels end-to-end.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CreateGoalResult,
  GoalKind,
  GoalsListResult,
} from '@shared/identity-types'
import { validateCreateGoal } from '@/core/goals/config'
import { evaluateAndListGoals } from './engine'
import { createGoal, updateGoalStatus } from './repo'

export function registerGoalsIpc(): void {
  ipcMain.handle(IPC.GOALS_LIST, (): GoalsListResult => evaluateAndListGoals())

  ipcMain.handle(
    IPC.GOALS_CREATE,
    (
      _e,
      input: { title: string; kind: GoalKind; config: unknown },
    ): CreateGoalResult => {
      const v = validateCreateGoal(input)
      if (!v.ok) return { ok: false, error: v.error }
      const goal = createGoal({
        title: input.title.trim(),
        kind: input.kind,
        config_json: v.config_json,
      })
      return { ok: true, goal }
    },
  )

  ipcMain.handle(
    IPC.GOALS_ABANDON,
    (_e, input: { id: string }): { updated: boolean } =>
      updateGoalStatus(input.id, 'abandoned'),
  )
}
