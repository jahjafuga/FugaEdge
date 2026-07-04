// Stage 3 beat 3.5 (round 2) — the hero account panel as an INSET OBJECT:
// the Profile hero's right side, following the switcher (LOCKED: broker,
// details, and the COMPUTED LEDGER balance — never a live broker fetch).
// The split-cents figure, the compact capital band under 'all' (luminous
// account-color segments, the 2% visual floor), the glowing accent + a
// two-fact flow line under a single scope (the existing events channel —
// the one ruled data addition). Zero anchored -> the em-dash, never
// $0.00. Identity content (XP, level, streak, badges) stays GLOBAL —
// this panel is the page's ONLY scope consumer.

import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import MaskedMoney from '@/components/ui/MaskedMoney'
import MoneyFigure from '@/components/ui/MoneyFigure'
import { ipc } from '@/lib/ipc'
import { money } from '@/lib/format'
import { allocationSegments } from '@/lib/allocation'
import { deriveFlowStats, type FlowStats } from '@/lib/cashFlow'
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
  flowStarting: 'Starting',
  flowDeposits: 'Deposits',
  flowWithdrawals: 'Withdrawals',
}

const FALLBACK_COLOR = '#8b8f98'
const SEGMENT_SHEEN =
  'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.10) 100%)'

interface AllView {
  kind: 'all'
  combined: CombinedBalance
  nonSimCount: number
  /** Anchored non-sim accounts with balances — the compact band's data. */
  anchored: { id: string; balance: number; color: string | null }[]
}

interface SingleView {
  kind: 'single'
  account: Account | null
  balance: AccountBalance | null
  flow: FlowStats
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
        const nonSim = accounts.filter((a) => a.account_type !== 'sim')
        const balances = await Promise.all(nonSim.map((a) => ipc.cashBalanceGet(a.id)))
        const anchored = nonSim.flatMap((a, i) => {
          const b = balances[i]
          return b === null ? [] : [{ id: a.id, balance: b.balance, color: a.color }]
        })
        if (!cancelled)
          setView({ kind: 'all', combined, nonSimCount: nonSim.length, anchored })
      } else {
        const [accounts, balance, events] = await Promise.all([
          ipc.accountsList(),
          ipc.cashBalanceGet(scope.accountId),
          ipc.cashEventsList(scope.accountId),
        ])
        const account = accounts.find((a) => a.id === scope.accountId) ?? null
        if (!cancelled)
          setView({ kind: 'single', account, balance, flow: deriveFlowStats(events) })
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
      className="w-full shrink-0 rounded-xl border border-border-subtle bg-bg-0/60 p-4 text-center sm:w-[236px] sm:min-w-[236px] sm:text-left"
    >
      {view === null ? (
        <div className="h-[96px]" aria-hidden />
      ) : view.kind === 'all' ? (
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <Wallet size={13} strokeWidth={2} className="text-gold" aria-hidden />
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-tertiary">
              {S.allTitle}
            </span>
          </div>
          <div className="mt-2">
            {view.anchored.length === 0 ? (
              <span className="font-mono text-xl font-bold tracking-tight text-fg-primary tnum">
                {S.none}
              </span>
            ) : (
              <MoneyFigure
                value={view.combined.total}
                size="xl"
                className="text-fg-primary"
              />
            )}
          </div>
          <div className="mt-0.5 text-xs text-fg-tertiary">
            {view.combined.missing_anchor.length === 0
              ? S.acrossAll(view.nonSimCount)
              : S.acrossPartial(
                  view.nonSimCount - view.combined.missing_anchor.length,
                  view.nonSimCount,
                )}
          </div>
          <CompactBar anchored={view.anchored} />
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: view.account?.color ?? FALLBACK_COLOR }}
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
          <div className="mt-2">
            {view.balance === null ? (
              <span className="font-mono text-xl font-bold tracking-tight text-fg-primary tnum">
                {S.none}
              </span>
            ) : (
              <MoneyFigure value={view.balance.balance} size="xl" className="text-fg-primary" />
            )}
          </div>
          {view.balance === null && (
            <div className="mt-0.5 text-xs text-fg-tertiary">{S.noneHint}</div>
          )}
          {/* The accent — the account color, faint glow; no composition. */}
          {view.account && (
            <div
              className="mt-2.5 h-1 w-full rounded-full"
              style={{
                backgroundColor: view.account.color ?? FALLBACK_COLOR,
                boxShadow: `0 0 6px 0 ${view.account.color ?? FALLBACK_COLOR}55`,
              }}
              aria-hidden
            />
          )}
          {/* The two-fact flow line — labels carry the signs. */}
          {view.balance !== null && view.flow.starting && (
            <p className="mt-2 font-mono text-[10px] text-fg-tertiary tnum">
              {S.flowStarting} <MaskedMoney>{money(view.flow.starting.amount)}</MaskedMoney>
              {view.flow.deposits > 0 && (
                <> · {S.flowDeposits} <MaskedMoney>{money(view.flow.deposits)}</MaskedMoney></>
              )}
              {view.flow.withdrawals > 0 && (
                <> · {S.flowWithdrawals} <MaskedMoney>{money(view.flow.withdrawals)}</MaskedMoney></>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The compact capital band — anchored non-sim shares of the positive
 *  total in account colors, luminous, with the 2% visual floor. Hidden
 *  when the math says a bar would lie. */
function CompactBar({
  anchored,
}: {
  anchored: { id: string; balance: number; color: string | null }[]
}) {
  const segments = allocationSegments(anchored)
  if (segments.length === 0) return null
  return (
    <div
      className="mt-2.5 flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full bg-bg-1"
      aria-hidden
    >
      {segments
        .filter((s) => s.fraction > 0)
        .map((s) => (
          <div
            key={s.id}
            data-testid={`alloc-seg-${s.id}`}
            className="relative h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{
              width: `${s.fraction * 100}%`,
              minWidth: '2%',
              backgroundColor: anchored.find((a) => a.id === s.id)?.color ?? FALLBACK_COLOR,
            }}
          >
            <div className="absolute inset-0 rounded-full" style={{ background: SEGMENT_SHEEN }} />
          </div>
        ))}
    </div>
  )
}
