import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { SaveSentimentInput, SaveTodaySessionInput } from '@shared/session-types'
import { bumpDataVersion } from '../lib/cache'
import { reconcileXpForDates } from '../xp/reconcile'
import {
  getSessionMeta,
  listAllSessions,
  saveSentiment,
  saveTodaySession,
} from './repo'

// Session metadata IPC. Sentiment + today's session save mutate the
// session_meta row by date; analytics aggregates trades by sentiment via a
// JOIN, so a save bumps the data version to invalidate the cached
// analytics payload.
export function registerSessionIpc(): void {
  ipcMain.handle(IPC.SESSION_SENTIMENT_SAVE, (_e, input: SaveSentimentInput) => {
    const out = saveSentiment(input.date, input.sentiment)
    bumpDataVersion()
    // v0.2.5 XP hook (L11/L12 — sentiment feeds D9): fire-and-forget AFTER
    // save + bump; a failure delays XP by one launch (the sweep heals),
    // never breaks the save or changes the return shape.
    void Promise.resolve()
      .then(() => reconcileXpForDates([input.date]))
      .catch((e) => console.warn('[xp hook]', e))
    return out
  })
  ipcMain.handle(IPC.SESSION_LIST_ALL, () => listAllSessions())
  ipcMain.handle(IPC.SESSION_GET, (_e, date: string) => getSessionMeta(date))
  ipcMain.handle(IPC.SESSION_TODAY_SAVE, (_e, input: SaveTodaySessionInput) => {
    const out = saveTodaySession(input)
    bumpDataVersion()
    // v0.2.5 XP hook (L11/L12 — no_trade_day + sentiment feed D9).
    void Promise.resolve()
      .then(() => reconcileXpForDates([input.date]))
      .catch((e) => console.warn('[xp hook]', e))
    return out
  })
}
