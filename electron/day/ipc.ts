import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveRuleBreaksInput } from '@shared/day-types'
import type { AccountScope } from '@shared/accounts-types'
import { getDayDetail } from './repo'
import { saveRuleBreaks } from './ruleBreaks'
import { saveDayNote } from '../session/repo'

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
  // Thin repo call — the clean/upsert logic lives in ./ruleBreaks (no logic here).
  ipcMain.handle(IPC.DAY_RULE_BREAKS_SAVE, (_e, input: SaveRuleBreaksInput) =>
    saveRuleBreaks(input),
  )
}
