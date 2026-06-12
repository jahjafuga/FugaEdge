// v0.2.5 Phase A Session 3 — XP IPC (L15). Thin per ARCHITECTURE.md rule 1:
// validate, call, return — no business logic. No handler-level unit tests:
// the repo has no house IPC-test pattern, and everything these handlers do
// lives in already-tested modules (buildWeeklyReviewIntent — engine tests;
// insertXpEvents / listIdempotencyKeys — repo tests). The channels are
// proven end-to-end by the Session 3 CDP smoke.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { buildWeeklyReviewIntent } from '@/core/xp/engine'
import type {
  WeeklyReviewCompleteResult,
  WeeklyReviewStatus,
} from '@shared/xp-types'
import { insertXpEvents, listIdempotencyKeys } from './repo'

export function registerXpIpc(): void {
  ipcMain.handle(
    IPC.XP_WEEKLY_REVIEW_COMPLETE,
    (_e, input: { weekStart: string }): WeeklyReviewCompleteResult => {
      try {
        // The Sunday guard THROWS on a non-Sunday / malformed week_start —
        // a wrong-anchor key would be a double-award class idempotency
        // cannot catch (Session 2, A2). Surface the rejection as data; a
        // thrown error's message would arrive wrapped and unusable across
        // the IPC boundary.
        const intent = buildWeeklyReviewIntent(input.weekStart)
        const inserted = insertXpEvents([intent])
        return { completed: true, awarded: inserted > 0 }
      } catch (err) {
        return {
          completed: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  )

  ipcMain.handle(
    IPC.XP_WEEKLY_REVIEW_GET,
    (_e, input: { weekStart: string }): WeeklyReviewStatus => {
      // D5: the xp_event IS the completion record — key existence is the
      // whole query. (listIdempotencyKeys is a prefix match; the exact
      // includes() makes this immune to its trailing-% semantics.)
      const key = `weekly_review:${input.weekStart}`
      return { completed: listIdempotencyKeys(key).includes(key) }
    },
  )
}
