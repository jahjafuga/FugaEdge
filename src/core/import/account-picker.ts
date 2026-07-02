// Multi-account Beat 3 — pure decisions behind the import account picker.
// Web-portable per /ARCHITECTURE.md: no electron / DOM imports. The blocked
// state is TYPE-derived (account_type === 'sim') — the successor of the old
// Real/Paper toggle; sim imports stay blocked until per-account filtering
// walls practice trades off from live stats (Beat 4+).

import type { Account } from '@shared/accounts-types'

/** The accounts the picker offers — active only, list order preserved
 *  (accountsList already orders default-first, then creation order). */
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.status === 'active')
}

/** The picker's preselection: the default account when it's active, else the
 *  first active account, else null (nothing selectable). */
export function defaultAccountId(accounts: Account[]): string | null {
  const active = activeAccounts(accounts)
  return active.find((a) => a.is_default)?.id ?? active[0]?.id ?? null
}

/** True only when the SELECTED account exists and is sim-typed. */
export function isSimSelected(accounts: Account[], selectedId: string | null): boolean {
  if (selectedId == null) return false
  return accounts.some((a) => a.id === selectedId && a.account_type === 'sim')
}
