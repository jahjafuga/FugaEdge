import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  SaveDayTagsInput,
  SaveWeekNotesInput,
} from '@shared/calendar-types'
import { getCalendarMonth, getCalendarYear } from './get'
import { saveDayTags } from './dayTags'
import { saveWeekNotes } from './weekNotes'

interface GetInput {
  year: number
  month: number
}

interface GetYearInput {
  year: number
}

export function registerCalendarIpc(): void {
  ipcMain.handle(IPC.CALENDAR_GET, (_e, { year, month }: GetInput) =>
    getCalendarMonth(year, month),
  )
  ipcMain.handle(IPC.CALENDAR_YEAR_GET, (_e, { year }: GetYearInput) =>
    getCalendarYear(year),
  )
  ipcMain.handle(IPC.DAY_TAGS_SAVE, (_e, input: SaveDayTagsInput) =>
    saveDayTags(input),
  )
  ipcMain.handle(IPC.WEEK_NOTES_SAVE, (_e, input: SaveWeekNotesInput) =>
    saveWeekNotes(input),
  )
}
