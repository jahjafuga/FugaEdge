import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AccountScope } from '@shared/accounts-types'
import { getWeekDetail } from './repo'

export function registerWeekIpc(): void {
  // Multi-account (Technicals slice, beat 2) — opt-in scope as a SECOND
  // OPTIONAL ARG (the minimal additive shape on a bare-scalar channel;
  // contrast def9ad7's single-object input `{ year, month, scope }` where
  // the channel already took an object). Absent -> 'all' through the seam
  // in the repo.
  ipcMain.handle(
    IPC.WEEK_GET_DETAIL,
    (_e, weekStart: string, opts?: { accountScope?: AccountScope }) =>
      getWeekDetail(weekStart, opts),
  )
}
