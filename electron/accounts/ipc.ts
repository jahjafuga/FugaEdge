// Multi-account Beat 1 — trading-accounts IPC. Thin per the architecture
// rules: every handler is a direct repo call; business rules (guards, the
// single-default invariant, error translation) live in ./repo. MUTATIONS
// return the fresh ordered list so the future switcher / Settings UI
// refreshes in one round-trip. "Trading accounts" is the user-facing name
// (naming law); `accounts` is the code namespace — distinct from the
// top-right ProfileMenu (renamed from AccountMenu in Beat 3).

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  Account,
  AccountStatus,
  CreateAccountInput,
  UpdateAccountInput,
} from '@shared/accounts-types'
import {
  createAccount,
  deleteAccount,
  listAccounts,
  setAccountStatus,
  setDefaultAccount,
  updateAccount,
} from './repo'

export function registerAccountsIpc(): void {
  ipcMain.handle(IPC.ACCOUNTS_LIST, (): Account[] => listAccounts())
  ipcMain.handle(IPC.ACCOUNTS_CREATE, (_e, input: CreateAccountInput): Account[] => {
    createAccount(input)
    return listAccounts()
  })
  ipcMain.handle(
    IPC.ACCOUNTS_UPDATE,
    (_e, input: { id: string; patch: UpdateAccountInput }): Account[] => {
      updateAccount(input.id, input.patch)
      return listAccounts()
    },
  )
  ipcMain.handle(IPC.ACCOUNTS_SET_DEFAULT, (_e, input: { id: string }): Account[] => {
    setDefaultAccount(input.id)
    return listAccounts()
  })
  ipcMain.handle(
    IPC.ACCOUNTS_SET_STATUS,
    (_e, input: { id: string; status: AccountStatus }): Account[] => {
      setAccountStatus(input.id, input.status)
      return listAccounts()
    },
  )
  ipcMain.handle(IPC.ACCOUNTS_DELETE, (_e, input: { id: string }): Account[] => {
    deleteAccount(input.id)
    return listAccounts()
  })
}
