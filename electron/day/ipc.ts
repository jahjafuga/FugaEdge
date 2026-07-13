import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveRuleBreaksInput } from '@shared/day-types'
import type { AccountScope } from '@shared/accounts-types'
import { getDayDetail } from './repo'
import { getRuleBreakUsage, saveRuleBreaks } from './ruleBreaks'
import { saveDayNote } from '../session/repo'
import { bumpDataVersion } from '../lib/cache'

interface DayNoteSaveInput {
  date: string
  body: string
}

export function registerDayIpc(): void {
  // Multi-account (Technicals slice, beat 2) — opt-in scope as a SECOND
  // OPTIONAL ARG (the minimal additive shape on a bare-scalar channel; the
  // week handler mirrors it, contrast def9ad7's single-object input).
  ipcMain.handle(
    IPC.DAY_GET_DETAIL,
    (_e, date: string, opts?: { accountScope?: AccountScope }) =>
      getDayDetail(date, opts),
  )
  ipcMain.handle(IPC.DAY_NOTE_SAVE, (_e, { date, body }: DayNoteSaveInput) =>
    saveDayNote(date, body),
  )
  // Thin repo call — the clean/upsert logic lives in ./ruleBreaks. The bump is
  // the only added logic: rule-breaks feed the analytics "Daily Rule Breaks"
  // rollup (getAnalytics reads journal.rule_breaks), so the write MUST invalidate
  // the analytics memoize cache or Analytics > Psychology serves the pre-tag
  // payload until TTL/restart (electron/analytics/ipc.ts + electron/lib/cache.ts).
  // Mirrors session/ipc.ts. NOTE: DAY_NOTE_SAVE above deliberately does NOT bump —
  // session_meta.notes isn't read by any analytics rollup, so a bump there would
  // be needless full-cache invalidation with no correctness benefit.
  ipcMain.handle(IPC.DAY_RULE_BREAKS_SAVE, (_e, input: SaveRuleBreaksInput) => {
    const result = saveRuleBreaks(input)
    bumpDataVersion()
    return result
  })
  // Beat 2 — the Settings freeze guard's usage read. A pure READ: it must NOT bump (a bump
  // would needlessly invalidate the whole analytics cache on every Settings open). Mirrors
  // DAY_GET_DETAIL above, which is likewise a read and likewise does not bump.
  ipcMain.handle(IPC.DAY_RULE_BREAK_USAGE_GET, () => getRuleBreakUsage())
}
