import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getDayDetail } from './repo'

export function registerDayIpc(): void {
  ipcMain.handle(IPC.DAY_GET_DETAIL, (_e, date: string) => getDayDetail(date))
}
