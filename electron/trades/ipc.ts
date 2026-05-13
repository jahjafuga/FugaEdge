import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import { bumpDataVersion } from '../lib/cache'
import { listTrades, type ListTradesOptions } from './list'
import { saveNote } from './notes'
import { saveTimeframe } from './timeframe'
import { saveConfidence } from './confidence'
import { saveMistakes } from './mistakes'
import { savePlannedRisk, savePlannedStopLossPrice } from './planned-risk'
import { saveFloat } from './float-shares'
import { saveCatalyst } from './catalyst'

// Each mutation IPC bumps the data version so cached analytics/reports
// payloads see a stale stamp on next read and recompute. List reads stay
// uncached — they're cheap and traders expect them to reflect changes
// immediately.
function withVersionBump<T>(fn: () => T): T {
  const result = fn()
  bumpDataVersion()
  return result
}

export function registerTradesIpc(): void {
  ipcMain.handle(IPC.TRADES_LIST, (_e, opts?: ListTradesOptions) =>
    listTrades(opts ?? {}),
  )
  ipcMain.handle(IPC.TRADE_NOTE_SAVE, (_e, input: UpdateNoteInput) =>
    withVersionBump(() => saveNote(input)),
  )
  ipcMain.handle(IPC.TRADE_TIMEFRAME_SAVE, (_e, input: UpdateTimeframeInput) =>
    withVersionBump(() => saveTimeframe(input)),
  )
  ipcMain.handle(IPC.TRADE_CONFIDENCE_SAVE, (_e, input: UpdateConfidenceInput) =>
    withVersionBump(() => saveConfidence(input)),
  )
  ipcMain.handle(IPC.TRADE_MISTAKES_SAVE, (_e, input: UpdateMistakesInput) =>
    withVersionBump(() => saveMistakes(input)),
  )
  ipcMain.handle(IPC.TRADE_PLANNED_RISK_SAVE, (_e, input: UpdatePlannedRiskInput) =>
    withVersionBump(() => savePlannedRisk(input)),
  )
  ipcMain.handle(
    IPC.TRADE_PLANNED_STOP_LOSS_SAVE,
    (_e, input: UpdatePlannedStopLossInput) =>
      withVersionBump(() => savePlannedStopLossPrice(input)),
  )
  ipcMain.handle(IPC.TRADE_FLOAT_SAVE, (_e, input: UpdateFloatInput) =>
    withVersionBump(() => saveFloat(input)),
  )
  ipcMain.handle(IPC.TRADE_CATALYST_SAVE, (_e, input: UpdateCatalystInput) =>
    withVersionBump(() => saveCatalyst(input)),
  )
}
