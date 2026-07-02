// Multi-account (Trades slice) — pure decisions for the per-row account
// indicator and the detail header's owning-account label. Web-portable per
// /ARCHITECTURE.md: no DOM, no electron.
//
//   - accountOwner: registry lookup (name + color); null for unknown ids
//     (deleted account / stale row) — never a fabricated label.
//   - accountIndicatorFor: the LIST visibility rule — shown ONLY under scope
//     'all' (a single-account list is homogeneous, the chip would be noise);
//     the DETAIL header uses accountOwner directly (every scope).

import type { Account, AccountScope } from '@shared/accounts-types'

export interface AccountIndicator {
  name: string
  color: string | null
}

export function accountOwner(
  accounts: Account[],
  accountId: string,
): AccountIndicator | null {
  const a = accounts.find((x) => x.id === accountId)
  return a ? { name: a.name, color: a.color } : null
}

export function accountIndicatorFor(
  scope: AccountScope,
  accounts: Account[],
  accountId: string,
): AccountIndicator | null {
  if (scope !== 'all') return null
  return accountOwner(accounts, accountId)
}
