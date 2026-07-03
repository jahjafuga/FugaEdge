// Stage 3 beat 2 — the cash channels: thin passthroughs to the beat-1
// engine (validation lives in the repo; the reader owns the balance math).
// No memoize — balances are cheap per-account aggregates and mutations are
// user-paced (the technicals bare-handler precedent).

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  CreateCashEventInput,
  CreateTransferInput,
} from '@shared/cash-types'
import {
  createCashEvent,
  createTransfer,
  deleteCashEvent,
  deleteTransfer,
  listCashEvents,
} from './repo'
import { balanceForAccount, combinedBalance } from './balance'

export function registerCashIpc(): void {
  ipcMain.handle(IPC.CASH_EVENTS_LIST, (_e, accountId?: string) =>
    listCashEvents(accountId),
  )
  ipcMain.handle(IPC.CASH_EVENT_CREATE, (_e, input: CreateCashEventInput) =>
    createCashEvent(input),
  )
  ipcMain.handle(IPC.CASH_EVENT_DELETE, (_e, id: string) => deleteCashEvent(id))
  ipcMain.handle(IPC.CASH_TRANSFER_CREATE, (_e, input: CreateTransferInput) =>
    createTransfer(input),
  )
  ipcMain.handle(IPC.CASH_TRANSFER_DELETE, (_e, transferId: string) =>
    deleteTransfer(transferId),
  )
  ipcMain.handle(IPC.CASH_BALANCE_GET, (_e, accountId: string) =>
    balanceForAccount(accountId),
  )
  ipcMain.handle(IPC.CASH_BALANCE_COMBINED, () => combinedBalance())
}
