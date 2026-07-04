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
  /** Shown wherever a sim account is chosen (import picker + Settings) —
   *  informational since the sim-unlock (fix beat 3): practice imports flow
   *  normally; the walls live in the read layer. */
  practiceImportNote:
    'Practice account - imports stay out of your real-money stats, badges, and equity goals. They still count toward your streak and process XP.',
  picker: {
    heading: 'Trading account',
    selectLabel: 'Trading account',
    manageHint: 'Manage accounts in Settings',
  },
  switcher: {
    triggerLabel: 'Trading account scope',
    menuLabel: 'Trading accounts',
    all: 'All accounts',
    /** The All entry when ANY sim account exists (active or archived) —
     *  the exclusion becomes user-visible the moment it can matter. */
    allSimExcluded: 'All accounts (sim excluded)',
    archivedDivider: 'Archived',
  },
  compare: {
    /** The growth row's sub-lines (beat 4 build B — the un-park). The
     *  denominator is CONTRIBUTED CAPITAL (starting + deposits -
     *  withdrawals), never the current balance. The old scopedGrowthNote
     *  retired with its condition: Stage 3 landed per-account balances.
     *  Copy is dollar-free on purpose — a dollar in the sub-line would
     *  leak under streamer mode. */
    growthOverContributed: 'over contributed capital',
    growthNoAnchor: 'set a starting balance to track growth',
    growthNonPositive: 'needs positive contributed capital',
    growthAcrossAll: (n: number) => `across ${n} account${n === 1 ? '' : 's'}`,
    growthAcrossPartial: (n: number, m: number) => `across ${n} of ${m} accounts`,
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
