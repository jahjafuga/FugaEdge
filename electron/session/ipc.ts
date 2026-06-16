import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  SaveNoTradeDayInput,
  SaveSentimentInput,
  SaveTodaySessionInput,
} from '@shared/session-types'
import { bumpDataVersion } from '../lib/cache'
import { reconcileXpForDates } from '../xp/reconcile'
import {
  getSessionMeta,
  listAllSessions,
  saveNoTradeDay,
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
  // Sentiment-agnostic no-trade-day save (v0.2.5 sentiment extraction) — the
  // dashboard's no-trade flow writes ONLY the no-trade columns so it can never
  // clobber the sentiment the MarketSentimentCard owns. Mirrors the sentiment
  // handler's bump + XP reconcile.
  ipcMain.handle(IPC.SESSION_NO_TRADE_SAVE, (_e, input: SaveNoTradeDayInput) => {
    const out = saveNoTradeDay(input.date, input.no_trade_day, input.no_trade_reason)
    bumpDataVersion()
    void Promise.resolve()
      .then(() => reconcileXpForDates([input.date]))
      .catch((e) => console.warn('[xp hook]', e))
    return out
  })
}
