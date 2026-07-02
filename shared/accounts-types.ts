// Multi-account Beat 1 — shared trading-account types (spec: accounts are
// first-class entities). "Trading accounts" in user-facing copy; `accounts`
// as the code namespace (the top-right menu is the PROFILE menu — renamed
// AccountMenu → ProfileMenu in Beat 3).

/** The account-type vocabulary. Validated by the repo (not a DB CHECK) so a
 *  future type addition doesn't hard-fail older binaries. `sim` is the
 *  forward replacement for the parked executions.is_paper approach — the
 *  import page's paper gate folds into account_type = 'sim' in Beat 2. */
export const ACCOUNT_TYPES = [
  'margin',
  'cash',
  'roth_ira',
  'traditional_ira',
  'prop',
  'offshore',
  'sim',
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]

export type AccountStatus = 'active' | 'archived'

export interface Account {
  id: string
  name: string
  /** The UNDERLYING brokerage ("Ocean One", "Schwab") — free text, NOT the
   *  platform (DAS is a platform; trades.source_broker records that). */
  broker: string | null
  account_type: AccountType
  /** UI badge tint; assignment logic arrives with the switcher (Beat 3). */
  color: string | null
  status: AccountStatus
  /** Exactly one account holds the default — enforced by the DB partial
   *  UNIQUE index idx_accounts_single_default. */
  is_default: boolean
  created_at: string
}

export interface CreateAccountInput {
  name: string
  broker?: string | null
  account_type: AccountType
  color?: string | null
}

/** is_default is deliberately NOT patchable here — the single-default swap
 *  goes through setDefaultAccount's transaction. */
export interface UpdateAccountInput {
  name?: string
  broker?: string | null
  account_type?: AccountType
  color?: string | null
}
