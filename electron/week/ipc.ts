import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getWeekDetail } from './repo'

export function registerWeekIpc(): void {
  ipcMain.handle(IPC.WEEK_GET_DETAIL, (_e, weekStart: string) => getWeekDetail(weekStart))
}
