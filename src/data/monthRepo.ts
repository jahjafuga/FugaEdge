import type { MonthDetail } from '@shared/week-types'
import type { AccountScope } from '@shared/accounts-types'

// The weekRepo mirror -- renderer-side typed client for the Month drawer's
// data source. Components import from here, not window.api.
//
// saveMonthNotes mirrors weekRepo.saveWeekNotes: it returns void so
// DetailNotesTab's onSave fits, and it reaches month_notes, never week_notes.
export const monthRepo = {
  getMonthDetail(monthId: string, opts?: { accountScope?: AccountScope }): Promise<MonthDetail> {
    return window.api.monthDetailGet(monthId, opts)
  },
  saveMonthNotes(monthId: string, body: string): Promise<void> {
    return window.api.monthNotesSave({ month_id: monthId, text: body }).then(() => {})
  },
}
