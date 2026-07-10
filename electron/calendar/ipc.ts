import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  SaveDayTagsInput,
  SaveWeekNotesInput,
} from '@shared/calendar-types'
import type { AccountScope } from '@shared/accounts-types'
import { getCalendarMonth, getCalendarYear } from './get'
import { saveDayTags } from './dayTags'
import { saveWeekNotes } from './weekNotes'
import { bumpDataVersion } from '../lib/cache'

interface GetInput {
  year: number
  month: number
  /** Multi-account slice — the switcher's scope; absent -> 'all'. */
  scope?: AccountScope
}

interface GetYearInput {
  year: number
  scope?: AccountScope
}

export function registerCalendarIpc(): void {
  ipcMain.handle(IPC.CALENDAR_GET, (_e, { year, month, scope }: GetInput) =>
    getCalendarMonth(year, month, scope ?? 'all'),
  )
  ipcMain.handle(IPC.CALENDAR_YEAR_GET, (_e, { year, scope }: GetYearInput) =>
    getCalendarYear(year, scope ?? 'all'),
  )
  // DAY_TAGS_SAVE bumps the analytics data version: computeDiscipline counts a
  // date as journaled when journal.day_tags is non-empty (analytics/get.ts:606),
  // feeding days_journaled / discipline_score (get.ts:652) — a memoized analytics
  // input. WEEK_NOTES_SAVE below deliberately does NOT bump: week_notes is read
  // by no memoized cache (analytics/reports never touch it).
  ipcMain.handle(IPC.DAY_TAGS_SAVE, (_e, input: SaveDayTagsInput) => {
    const out = saveDayTags(input)
    bumpDataVersion()
    return out
  })
  ipcMain.handle(IPC.WEEK_NOTES_SAVE, (_e, input: SaveWeekNotesInput) =>
    saveWeekNotes(input),
  )
}
