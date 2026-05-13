import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { TimeRange } from '@shared/dashboard-types'
import { getDashboardData } from './dashboard'

interface GetInput {
  range?: TimeRange
}

export function registerStatsIpc(): void {
  ipcMain.handle(IPC.DASHBOARD_GET, (_e, input?: GetInput) =>
    getDashboardData(input?.range ?? '30d'),
  )
}
