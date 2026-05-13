import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveJournalInput } from '@shared/journal-types'
import { getJournalDay } from './get'
import { saveJournalDay } from './save'

interface GetInput {
  date: string
}

export function registerJournalIpc(): void {
  ipcMain.handle(IPC.JOURNAL_GET, (_e, { date }: GetInput) => getJournalDay(date))
  ipcMain.handle(IPC.JOURNAL_SAVE, (_e, input: SaveJournalInput) =>
    saveJournalDay(input),
  )
}
