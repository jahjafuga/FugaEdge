// Multi-account Beat 3 — pure decisions behind the import account picker.
// Web-portable per /ARCHITECTURE.md: no electron / DOM imports.
// Sim-unlock audit fix beat 3: the sim BLOCK retired — isSimSelected deleted
// with it (zero callers beyond the block sites); practice imports flow
// normally and the walls live in the read layer.

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
