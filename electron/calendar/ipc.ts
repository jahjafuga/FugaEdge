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
  ipcMain.handle(IPC.DAY_TAGS_SAVE, (_e, input: SaveDayTagsInput) =>
    saveDayTags(input),
  )
  ipcMain.handle(IPC.WEEK_NOTES_SAVE, (_e, input: SaveWeekNotesInput) =>
    saveWeekNotes(input),
  )
}
