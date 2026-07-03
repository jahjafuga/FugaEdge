// Stage 3 beat 3 — the Dashboard balance card: the balance HOME. Scope-
// following per the house single-value idiom (useTodaySession's shape:
// useAccountScope + [scope] effect + cancelled-flag guard; no desync tag —
// tags are the range-combo norm). Under 'all': the WALLED roll-up + the
// coverage-honest across-N(-of-M) subline + the per-account breakdown
// (sim structurally absent, archived dimmed but IN the total, unanchored
// em-dash rows named by coverage). Single scope: that account's balance +
// anchor subline; sim scope wears the practice label. NULL -> em-dash +
// the set-starting hint, NEVER 0. Every dollar through money().

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { money } from '@/lib/format'
import { useAccountScope } from '@/lib/accountScope'
import type { Account } from '@shared/accounts-types'
import type { AccountBalance, CombinedBalance } from '@shared/cash-types'
import { ACCOUNT_TYPE_LABELS } from '@/components/accounts/strings'

// Card copy — local, eyes-gated at the live-look.
const S = {
  title: 'Account balance',
  none: '—',
  setStartingHint: 'Set starting balance in Settings to track this account.',
  acrossAll: (n: number) => `across ${n} account${n === 1 ? '' : 's'}`,
  acrossPartial: (n: number, m: number) => `across ${n} of ${m} accounts`,
  sinceAnchor: (date: string) => `since ${date}`,
}

interface AllView {
  kind: 'all'
  combined: CombinedBalance
  accounts: Account[]
  balances: Record<string, AccountBalance | null>
}

interface SingleView {
  kind: 'single'
  account: Account | null
  balance: AccountBalance | null
}

export default function BalanceCard() {
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
        const nonSim = accounts.filter((a) => a.account_type !== 'sim')
        const balances: Record<string, AccountBalance | null> = {}
        const rows = await Promise.all(nonSim.map((a) => ipc.cashBalanceGet(a.id)))
        nonSim.forEach((a, i) => {
          balances[a.id] = rows[i]
        })
        if (!cancelled) setView({ kind: 'all', combined, accounts: nonSim, balances })
      } else {
        const [accounts, balance] = await Promise.all([
          ipc.accountsList(),
          ipc.cashBalanceGet(scope.accountId),
        ])
        const account = accounts.find((a) => a.id === scope.accountId) ?? null
        if (!cancelled) setView({ kind: 'single', account, balance })
      }
    }
    setView(null) // stale guard — never wear another scope's number
    void load().catch(() => {
      if (!cancelled) setView(null)
    })
    return () => {
      cancelled = true
    }
  }, [scope])

  return (
    <Card title={S.title}>
      {view === null ? (
        <div className="h-[72px]" aria-hidden />
      ) : view.kind === 'all' ? (
        <AllBody view={view} />
      ) : (
        <SingleBody view={view} />
      )}
    </Card>
  )
}

function AllBody({ view }: { view: AllView }) {
  const m = view.accounts.length
  const anchored = m - view.combined.missing_anchor.length
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <Wallet size={18} strokeWidth={2} className="self-center text-gold" aria-hidden />
        <span data-testid="balance-total" className="font-mono text-2xl font-bold text-fg-primary">
          {money(view.combined.total)}
        </span>
        <span className="text-xs text-fg-tertiary">
          {anchored === m ? S.acrossAll(m) : S.acrossPartial(anchored, m)}
        </span>
      </div>
      <ul className="mt-3 space-y-1">
        {view.accounts.map((a) => {
          const b = view.balances[a.id] ?? null
          return (
            <li
              key={a.id}
              data-testid={`balance-row-${a.id}`}
              className={`flex items-center justify-between gap-3 text-xs ${a.status === 'archived' ? 'opacity-60' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: a.color ?? '#8b8f98' }}
                  aria-hidden
                />
                <span className="truncate text-fg-secondary">{a.name}</span>
              </span>
              <span className="shrink-0 font-mono text-fg-primary">
                {b === null ? S.none : money(b.balance)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SingleBody({ view }: { view: SingleView }) {
  const isSim = view.account?.account_type === 'sim'
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <Wallet size={18} strokeWidth={2} className="self-center text-gold" aria-hidden />
        <span data-testid="balance-total" className="font-mono text-2xl font-bold text-fg-primary">
          {view.balance === null ? S.none : money(view.balance.balance)}
        </span>
        {view.balance !== null && (
          <span className="font-mono text-xs text-fg-tertiary">
            {S.sinceAnchor(view.balance.anchor_date)}
          </span>
        )}
        {isSim && view.account && (
          <span className="rounded-full border border-border-subtle bg-bg-1 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-tertiary">
            {ACCOUNT_TYPE_LABELS[view.account.account_type]}
          </span>
        )}
      </div>
      {view.balance === null && (
        <p className="mt-2 text-xs text-fg-tertiary">{S.setStartingHint}</p>
      )}
    </div>
  )
}
