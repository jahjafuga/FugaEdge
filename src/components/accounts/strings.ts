// Multi-account Beat 3 — the trading-accounts copy register (the profile
// strings.ts precedent: every user-facing string in one i18n-ready place).
// Naming law: user-facing copy says "Trading accounts"; `accounts` stays the
// code namespace. Shared by the Settings card and the Import picker.

import type { AccountType } from '@shared/accounts-types'

/** Friendly labels for the account-type union — the ONLY place they live. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  margin: 'Margin',
  cash: 'Cash',
  roth_ira: 'Roth IRA',
  traditional_ira: 'Traditional IRA',
  prop: 'Prop firm',
  offshore: 'Offshore',
  sim: 'Sim (practice)',
}

export const accountStrings = {
  /** Shown wherever a sim account is chosen — imports stay blocked until
   *  per-account filtering walls practice trades off from live stats. */
  simImportNote:
    'Sim-account imports unlock once per-account stat filtering lands — practice trades stay out of your live stats until then.',
  picker: {
    heading: 'Trading account',
    selectLabel: 'Trading account',
    manageHint: 'Manage accounts in Settings',
    blockedButton: 'Sim imports unlock with account filtering',
  },
  card: {
    heading: 'Trading accounts',
    sub: 'The brokerage accounts your imports belong to.',
    nameLabel: 'Account name',
    brokerLabel: 'Broker (optional)',
    typeLabel: 'Account type',
    colorLabel: 'Color',
    add: 'Add account',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    archive: 'Archive',
    unarchive: 'Unarchive',
    archivedTag: 'Archived',
    delete: 'Delete',
    deleteConfirmTitle: 'Delete account',
    deleteConfirmLabel: 'Delete account',
    deleteConfirmBody: (name: string) =>
      `This permanently removes "${name}" from the registry. Accounts that already hold trades can't be deleted — archive those instead.`,
    defaultStar: 'Default account',
    setDefault: (name: string) => `Set as default: ${name}`,
  },
} as const
