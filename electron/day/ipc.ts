import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getDayDetail } from './repo'
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
}
