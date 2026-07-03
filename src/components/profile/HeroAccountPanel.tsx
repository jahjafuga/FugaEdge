// Stage 3 beat 3 — the hero account panel: the Profile hero's right side,
// following the switcher (LOCKED: the selected account's broker, details,
// and the COMPUTED LEDGER balance — FugaEdge's math, never a live broker
// fetch). Under 'all': the walled roll-up + the coverage-honest across-N
// (-of-M) subline. Under a sim scope: the practice ledger, visibly marked
// via the type label, never in any roll-up. Identity content (XP, level,
// streak, badges) stays GLOBAL — this panel is the page's ONLY scope
// consumer. Scope-following per the house single-value idiom.

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { money } from '@/lib/format'
import { useAccountScope } from '@/lib/accountScope'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance, CombinedBalance } from '@shared/cash-types'
import { ACCOUNT_TYPE_LABELS } from '@/components/accounts/strings'

const S = {
  allTitle: 'All accounts',
  none: '—',
  noneHint: 'Set a starting balance in Settings',
  acrossAll: (n: number) => `across ${n} account${n === 1 ? '' : 's'}`,
  acrossPartial: (n: number, m: number) => `across ${n} of ${m} accounts`,
}

interface AllView {
  kind: 'all'
  combined: CombinedBalance
  nonSimCount: number
}

interface SingleView {
  kind: 'single'
  account: Account | null
  balance: AccountBalance | null
}

export default function HeroAccountPanel() {
  const { scope } = useAccountScope()
  const [view, setView] = useState<AllView | SingleView | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (scope === 'all') {
        const [accounts, combined] = await Promise.all([
          ipc.accountsList(),
          ipc.cashBalanceCombined(),
        ])
        const nonSimCount = accounts.filter((a) => a.account_type !== 'sim').length
        if (!cancelled) setView({ kind: 'all', combined, nonSimCount })
      } else {
        const [accounts, balance] = await Promise.all([
          ipc.accountsList(),
          ipc.cashBalanceGet(scope.accountId),
        ])
        const account = accounts.find((a) => a.id === scope.accountId) ?? null
        if (!cancelled) setView({ kind: 'single', account, balance })
      }
    }
    setView(null) // stale guard
    void load().catch(() => {
      if (!cancelled) setView(null)
    })
    return () => {
      cancelled = true
    }
  }, [scope])

  return (
    <div
      data-testid="hero-account-panel"
      className="w-full shrink-0 rounded-lg border border-border-subtle bg-bg-1 p-4 text-center sm:w-[220px] sm:text-left"
    >
      {view === null ? (
        <div className="h-[96px]" aria-hidden />
      ) : view.kind === 'all' ? (
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <Wallet size={14} strokeWidth={2} className="text-gold" aria-hidden />
            <span className="text-xs font-medium text-fg-secondary">{S.allTitle}</span>
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-fg-primary">
            {money(view.combined.total)}
          </div>
          <div className="mt-0.5 text-xs text-fg-tertiary">
            {view.combined.missing_anchor.length === 0
              ? S.acrossAll(view.nonSimCount)
              : S.acrossPartial(
                  view.nonSimCount - view.combined.missing_anchor.length,
                  view.nonSimCount,
                )}
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: view.account?.color ?? '#8b8f98' }}
              aria-hidden
            />
            <span className="truncate text-xs font-medium text-fg-secondary">
              {view.account?.name ?? S.none}
            </span>
          </div>
          <div className="mt-1 text-xs text-fg-tertiary">
            {view.account ? ACCOUNT_TYPE_LABELS[view.account.account_type] : S.none}
            {' · '}
            {view.account?.broker?.trim() || S.none}
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-fg-primary">
            {view.balance === null ? S.none : money(view.balance.balance)}
          </div>
          {view.balance === null && (
            <div className="mt-0.5 text-xs text-fg-tertiary">{S.noneHint}</div>
          )}
        </div>
      )}
    </div>
  )
}
