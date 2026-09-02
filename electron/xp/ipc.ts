// v0.2.5 Phase A Session 3 — XP IPC (L15). Thin per ARCHITECTURE.md rule 1:
// validate, call, return — no business logic. No handler-level unit tests:
// the repo has no house IPC-test pattern, and everything these handlers do
// lives in already-tested modules (buildWeeklyReviewIntent — engine tests;
// insertXpEvents / listIdempotencyKeys — repo tests). The channels are
// proven end-to-end by the Session 3 CDP smoke.

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { buildMonthlyReviewIntent, buildWeeklyReviewIntent } from '@/core/xp/engine'
import { computeStreak } from '@/core/xp/streak'
import { todayDateISO } from '@/core/session/today'
import type {
  MonthlyReviewCompleteResult,
  MonthlyReviewStatus,
  WeeklyReviewCompleteResult,
  WeeklyReviewStatus,
  XpSummary,
} from '@shared/xp-types'
import { listTradeDates } from './facts'
import { displayedLevel } from './level'
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

  ipcMain.handle(
    IPC.XP_MONTHLY_REVIEW_COMPLETE,
    (_e, input: { monthId: string }): MonthlyReviewCompleteResult => {
      try {
        // The month-id guard THROWS on anything but a bare YYYY-MM, for the
        // same reason the Sunday guard exists: a wrong-shaped id mints a
        // different key for the same logical month. Surfaced as data, not as a
        // thrown error, because a throw arrives wrapped across the IPC
        // boundary -- the weekly handler's contract, mirrored.
        const intent = buildMonthlyReviewIntent(input.monthId)
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
    IPC.XP_MONTHLY_REVIEW_GET,
    (_e, input: { monthId: string }): MonthlyReviewStatus => {
      // The xp_event IS the completion record. The prefix differs from the
      // week's before any id is interpolated, so this can never read a week's
      // row and a week can never read this one.
      const key = `monthly_review:${input.monthId}`
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
    // The floored level (raw curve level lifted by the never-demote floor) is
    // shared with the badge minter via displayedLevel — one seed/bump owner.
    const { totalXp, level, intoLevel, neededForNext } = displayedLevel()
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
