import { ipcMain } from 'electron'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type {
  BulkLifecycleInput,
  SingleTradeIdInput,
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
import { getAttachmentsDir } from '../attachments/dir'
import { listTrades, getTrade, type ListTradesOptions } from './list'
import { saveNote } from './notes'
import { saveTimeframe } from './timeframe'
import { saveConfidence } from './confidence'
import { saveMistakes } from './mistakes'
import { savePlannedRisk, savePlannedStopLossPrice } from './planned-risk'
import { saveFloat } from './float-shares'
import { saveCatalyst } from './catalyst'
import {
  softDeleteTrade,
  softDeleteTrades,
  restoreTrade,
  restoreTrades,
  hardDeleteTrade,
  hardDeleteTrades,
} from './lifecycle'

// Each mutation IPC bumps the data version so cached analytics/reports
// payloads see a stale stamp on next read and recompute. List reads stay
// uncached — they're cheap and traders expect them to reflect changes
// immediately.
function withVersionBump<T>(fn: () => T): T {
  const result = fn()
  bumpDataVersion()
  return result
}

// v0.2.3 P2b — fail-soft on-disk cleanup after a hard-delete. The lifecycle fn
// has already committed the DB delete (the source of truth) and returned
// attachment paths relative to the attachments root. We remove each file, then
// the now-empty per-trade dir. A failed rm is logged and swallowed — we never
// throw out of the handler and never roll back the DB delete; files may already
// be gone. recursive+force on the dir tolerates a missing or non-empty dir.
async function removeAttachmentsOnDisk(
  relPaths: string[],
  tradeIds: number[],
): Promise<void> {
  const root = getAttachmentsDir()
  for (const rel of relPaths) {
    try {
      await rm(join(root, rel), { force: true })
    } catch (e) {
      console.warn(
        `[trades.hardDelete] failed to remove attachment file ${rel}: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  for (const id of tradeIds) {
    try {
      await rm(join(root, String(id)), { recursive: true, force: true })
    } catch (e) {
      console.warn(
        `[trades.hardDelete] failed to remove attachment dir ${id}: ` +
          `${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
}

export function registerTradesIpc(): void {
  ipcMain.handle(IPC.TRADES_LIST, (_e, opts?: ListTradesOptions) =>
    listTrades(opts ?? {}),
  )
  // v0.2.4 §F1 — single-trade detail fetch (read-only; no version bump). Reuses
  // getTrade(id), which returns the full TradeListRow incl. executions and
  // intentionally does NOT filter deleted_at (read-paths-deleted-filter #4/#7).
  ipcMain.handle(IPC.TRADE_GET, (_e, input: { trade_id: number }) =>
    getTrade(input.trade_id),
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

  // ── v0.2.3 P2b — soft-delete lifecycle ───────────────────────────────────
  ipcMain.handle(IPC.TRADE_SOFT_DELETE, (_e, input: SingleTradeIdInput) =>
    withVersionBump(() => softDeleteTrade(input.trade_id)),
  )
  ipcMain.handle(IPC.TRADES_SOFT_DELETE_BULK, (_e, input: BulkLifecycleInput) =>
    withVersionBump(() => softDeleteTrades(input.trade_ids)),
  )
  ipcMain.handle(IPC.TRADE_RESTORE, (_e, input: SingleTradeIdInput) =>
    withVersionBump(() => restoreTrade(input.trade_id)),
  )
  ipcMain.handle(IPC.TRADES_RESTORE_BULK, (_e, input: BulkLifecycleInput) =>
    withVersionBump(() => restoreTrades(input.trade_ids)),
  )
  // Hard-delete: bump version + commit the DB delete synchronously, THEN remove
  // files off disk (async, fail-soft). fs work runs after the lifecycle tx has
  // committed — never inside it.
  ipcMain.handle(IPC.TRADE_HARD_DELETE, async (_e, input: SingleTradeIdInput) => {
    const res = withVersionBump(() => hardDeleteTrade(input.trade_id))
    await removeAttachmentsOnDisk(res.deletedAttachmentPaths, [input.trade_id])
  })
  ipcMain.handle(
    IPC.TRADES_HARD_DELETE_BULK,
    async (_e, input: BulkLifecycleInput) => {
      const res = withVersionBump(() => hardDeleteTrades(input.trade_ids))
      await removeAttachmentsOnDisk(res.deletedAttachmentPaths, input.trade_ids)
    },
  )
}
