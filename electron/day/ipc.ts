import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveRuleBreaksInput } from '@shared/day-types'
import { getDayDetail } from './repo'
import { saveRuleBreaks } from './ruleBreaks'
import { saveDayNote } from '../session/repo'

interface DayNoteSaveInput {
  date: string
  body: string
}

export function registerDayIpc(): void {
  ipcMain.handle(IPC.DAY_GET_DETAIL, (_e, date: string) => getDayDetail(date))
  ipcMain.handle(IPC.DAY_NOTE_SAVE, (_e, { date, body }: DayNoteSaveInput) =>
    saveDayNote(date, body),
  )
  // Thin repo call — the clean/upsert logic lives in ./ruleBreaks (no logic here).
  ipcMain.handle(IPC.DAY_RULE_BREAKS_SAVE, (_e, input: SaveRuleBreaksInput) =>
    saveRuleBreaks(input),
  )
}
