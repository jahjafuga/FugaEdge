import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { TimeRange } from '@shared/dashboard-types'
import type { AccountScope } from '@shared/accounts-types'
import { getDashboardData } from './dashboard'

interface GetInput {
  range?: TimeRange
  /** Multi-account Beat 4 — the switcher's scope; absent -> 'all'. */
  scope?: AccountScope
}

export function registerStatsIpc(): void {
  ipcMain.handle(IPC.DASHBOARD_GET, (_e, input?: GetInput) =>
    getDashboardData(input?.range ?? '30d', input?.scope ?? 'all'),
  )
}
