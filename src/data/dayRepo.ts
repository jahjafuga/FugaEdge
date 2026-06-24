import type { DayDetail } from '@shared/day-types'

// v0.2.2 — renderer-side typed client for the Day Detail data source.
// Sits behind the same architecture rule the rest of `/src/data/` is meant to
// follow (ARCHITECTURE.md rule #2): components import from here, not from
// `window.api.*` directly. When porting to web, the body of getDayDetail()
// swaps `window.api.dayDetailGet(date)` for `fetch('/api/day/...')` — the
// surface of this module stays identical.
//
// The `window.api` global is typed by src/types/global.d.ts (FugaApi) — it
// already includes `dayDetailGet` because preload now exposes it.
export const dayRepo = {
  getDayDetail(date: string): Promise<DayDetail> {
    return window.api.dayDetailGet(date)
  },
  saveDayNote(date: string, body: string): Promise<void> {
    return window.api.dayNoteSave(date, body)
  },
}
