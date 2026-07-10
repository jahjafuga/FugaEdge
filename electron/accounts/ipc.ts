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
import { bumpDataVersion } from '../lib/cache'

export function registerAccountsIpc(): void {
  ipcMain.handle(IPC.ACCOUNTS_LIST, (): Account[] => listAccounts())
  // CREATE / UPDATE / DELETE bump the analytics data version: the accounts
  // registry is a live input to the memoized analytics payload via SIM_WALL
  // (accounts/scope.ts:13) — getAnalytics scopes 'all' with
  // `account_id IN (SELECT id FROM accounts WHERE account_type != 'sim')`
  // (analytics/get.ts:892 + :918). A type flip on UPDATE changes that membership
  // over existing trades (the live case); CREATE/DELETE are output-neutral under
  // today's no-trades / FK-guarded invariants but still mutate the registry the
  // wall reads, so they invalidate conservatively. SET_DEFAULT / SET_STATUS do
  // NOT bump — is_default / status are not in SIM_WALL, so neither can change any
  // analytics rollup.
  ipcMain.handle(IPC.ACCOUNTS_CREATE, (_e, input: CreateAccountInput): Account[] => {
    createAccount(input)
    bumpDataVersion()
    return listAccounts()
  })
  ipcMain.handle(
    IPC.ACCOUNTS_UPDATE,
    (_e, input: { id: string; patch: UpdateAccountInput }): Account[] => {
      updateAccount(input.id, input.patch)
      bumpDataVersion()
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
    bumpDataVersion()
    return listAccounts()
  })
}
