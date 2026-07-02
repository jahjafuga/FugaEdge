// Multi-account Beat 4 — the app-wide account-scope provider. One light
// context in AppLayout: reads the persisted 'account_scope' settings key at
// boot (missing / unknown / DELETED id -> 'all'), setScope updates context
// and persists via settingsSave (the show_macd_pane own-writer chain — never
// the Settings save-bar). Consumers re-fetch on change; no reload dance.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { ipc } from '@/lib/ipc'
import type { Account, AccountScope } from '@shared/accounts-types'

interface AccountScopeValue {
  scope: AccountScope
  setScope: (s: AccountScope) => void
  /** The full registry (actives + archived) for the switcher's menu. */
  accounts: Account[]
  /** Refetch the registry (the switcher calls this on open so accounts
   *  created in Settings appear without a reload). */
  reloadAccounts: () => Promise<void>
}

const AccountScopeContext = createContext<AccountScopeValue>({
  scope: 'all',
  setScope: () => {},
  accounts: [],
  reloadAccounts: async () => {},
})

export function useAccountScope(): AccountScopeValue {
  return useContext(AccountScopeContext)
}

export function AccountScopeProvider({ children }: { children: ReactNode }) {
  const [scope, setScopeState] = useState<AccountScope>('all')
  const [accounts, setAccounts] = useState<Account[]>([])

  useEffect(() => {
    let cancelled = false
    Promise.all([ipc.settingsGet(), ipc.accountsList()])
      .then(([payload, list]) => {
        if (cancelled) return
        setAccounts(list)
        const stored = payload.values.account_scope
        // Fallback law: only a still-existing account id scopes; anything
        // else ('all', a deleted id, garbage) reads as 'all'.
        if (stored !== 'all' && list.some((a) => a.id === stored)) {
          setScopeState({ accountId: stored })
        } else {
          setScopeState('all')
        }
      })
      .catch(() => {
        // Fail open to 'all' — a read hiccup must never brick the chrome.
        if (!cancelled) setScopeState('all')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const setScope = useCallback((s: AccountScope) => {
    setScopeState(s)
    void ipc
      .settingsSave({ account_scope: s === 'all' ? 'all' : s.accountId })
      .catch((e) => console.warn('[account-scope] persist failed:', e))
  }, [])

  const reloadAccounts = useCallback(async () => {
    try {
      setAccounts(await ipc.accountsList())
    } catch {
      // keep the last good list
    }
  }, [])

  return (
    <AccountScopeContext.Provider value={{ scope, setScope, accounts, reloadAccounts }}>
      {children}
    </AccountScopeContext.Provider>
  )
}
