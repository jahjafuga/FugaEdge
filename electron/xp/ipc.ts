// v0.2.5 Phase A Session 3 — XP IPC (L15). Thin per ARCHITECTURE.md rule 1:
// validate, call, return — no business logic. No handler-level unit tests:
// the repo has no house IPC-test pattern, and everything these handlers do
// lives in already-tested modules (buildWeeklyReviewIntent — engine tests;
// insertXpEvents / listIdempotencyKeys — repo tests). The channels are
// proven end-to-end by the Session 3 CDP smoke.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { buildWeeklyReviewIntent } from '@/core/xp/engine'
import { levelProgress } from '@/core/xp/curve'
import { computeStreak } from '@/core/xp/streak'
import { todayDateISO } from '@/core/session/today'
import type {
  WeeklyReviewCompleteResult,
  WeeklyReviewStatus,
  XpSummary,
} from '@shared/xp-types'
import { listTradeDates } from './facts'
import { getXpTotal, insertXpEvents, listIdempotencyKeys } from './repo'

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

  // S4/L20 — the profile page's read model. Uncached + read-only; the page
  // refetches on route mount (no push channel — single-window app, D24).
  // journaledDates come from the LEDGER (streak:{date} keys), never a
  // recomputed D9 — the L19 design lock. `today` is the house machine-local
  // convention (todayDateISO); statelessness makes the midnight boundary
  // self-healing (A2/D24).
  ipcMain.handle(IPC.XP_SUMMARY_GET, (): XpSummary => {
    const totalXp = getXpTotal()
    const { level, intoLevel, neededForNext } = levelProgress(totalXp)
    const prefix = 'streak:'
    const journaledDates = listIdempotencyKeys(prefix).map((k) =>
      k.slice(prefix.length),
    )
    const { current, longest, freezesBanked } = computeStreak({
      journaledDates,
      tradeDates: listTradeDates(),
      today: todayDateISO(),
    })
    return {
      totalXp,
      level,
      intoLevel,
      neededForNext,
      currentStreak: current,
      longestStreak: longest,
      freezesBanked,
    }
  })
}
