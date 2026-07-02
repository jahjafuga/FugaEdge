import type { WeekDetail } from '@shared/week-types'
import type { AccountScope } from '@shared/accounts-types'

// v0.2.2 Day 4.5b — renderer-side typed client for the Weekly Review data
// source. Same pattern as dayRepo: components import from here, not window.api.
export const weekRepo = {
  getWeekDetail(weekStart: string, opts?: { accountScope?: AccountScope }): Promise<WeekDetail> {
    return window.api.weekDetailGet(weekStart, opts)
  },
  // Mirrors dayRepo.saveDayNote: reuses the existing weekNotesSave IPC
  // (week_notes table) as-is. Returns void so DetailNotesTab's onSave fits.
  saveWeekNotes(weekStart: string, body: string): Promise<void> {
    return window.api.weekNotesSave({ week_start: weekStart, text: body }).then(() => {})
  },
}
