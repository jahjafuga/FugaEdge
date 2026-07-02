import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveJournalInput } from '@shared/journal-types'
import type { AccountScope } from '@shared/accounts-types'
import { getJournalDay } from './get'
import { saveJournalDay } from './save'

interface GetInput {
  date: string
  /** Multi-account — the switcher's scope joins the existing object input
   *  (the def9ad7 calendar shape); absent -> 'all' through the seam. */
  scope?: AccountScope
}

export function registerJournalIpc(): void {
  ipcMain.handle(IPC.JOURNAL_GET, (_e, { date, scope }: GetInput) =>
    getJournalDay(date, scope ?? 'all'),
  )
  ipcMain.handle(IPC.JOURNAL_SAVE, (_e, input: SaveJournalInput) =>
    saveJournalDay(input),
  )
}
