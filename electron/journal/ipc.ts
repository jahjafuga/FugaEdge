import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveJournalInput } from '@shared/journal-types'
import type { AccountScope } from '@shared/accounts-types'
import { getJournalDay } from './get'
import { saveJournalDay } from './save'
import { bumpDataVersion } from '../lib/cache'

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
  // JOURNAL_SAVE bumps the analytics data version: computeDiscipline reads
  // journal.emotion_rating (analytics/get.ts:603) to build journaledDates, which
  // feed days_journaled / discipline_score (get.ts:652) — a memoized analytics
  // input. Without the bump the discipline rollup serves the pre-save payload
  // until TTL/restart (mirrors DAY_RULE_BREAKS_SAVE, day/ipc.ts).
  ipcMain.handle(IPC.JOURNAL_SAVE, (_e, input: SaveJournalInput) => {
    const out = saveJournalDay(input)
    bumpDataVersion()
    return out
  })
}
