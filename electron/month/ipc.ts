import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { AccountScope } from '@shared/accounts-types'
import { getMonthDetail } from './repo'

// The week/ipc.ts mirror: a bare-scalar channel with the account scope as a
// SECOND OPTIONAL ARG, absent -> 'all' through the seam in the repo. The
// handler calls a pure-ish repo function and holds no logic of its own
// (ARCHITECTURE.md rule 1).
export function registerMonthIpc(): void {
  ipcMain.handle(
    IPC.MONTH_GET_DETAIL,
    (_e, monthId: string, opts?: { accountScope?: AccountScope }) =>
      getMonthDetail(monthId, opts),
  )
}
