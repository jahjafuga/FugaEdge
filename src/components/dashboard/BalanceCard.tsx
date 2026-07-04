// Stage 3 beat 3.5 (round 2) — the Dashboard balance card: the Private
// Ledger treatment. Scope-following per the house single-value idiom
// (useTodaySession's cancelled-flag shape + null-at-effect-top stale
// guard). Under 'all': the split-cents display figure, the CAPITAL BAND
// (luminous account-color segments over a track, 2% visual floor — the
// row keeps the honest %), and the ledger rows (color tick, share% from
// the SAME allocationSegments data, aligned tnum amounts, archived /
// no-anchor micro-tags). Zero anchored -> the em-dash headline (never
// $0.00), honest coverage, the GHOST BAND, the hint. Single scope: the
// account eyebrow + type tag, the figure, the glowing accent, and THE
// FLOW STRIP derived from the existing events channel (the one ruled
// data addition). Gold + account colors + neutral fg ONLY — green/red
// stay P&L-semantic. Every dollar through money() (MoneyFigure wraps it).

import { useEffect, useState } from 'react'
import Card from '@/components/ui/Card'
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

// Card copy — local, eyes-gated at the live-look.
const S = {
  title: 'Account balance',
  totalLabel: 'Total balance',
  none: '—',
  setStartingHint: 'Set starting balance in Settings to track this account.',
  acrossAll: (n: number) => `across ${n} account${n === 1 ? '' : 's'}`,
  acrossPartial: (n: number, m: number) => `across ${n} of ${m} accounts`,
  sinceAnchor: (date: string) => `since ${date}`,
  archivedTag: 'archived',
  noAnchorTag: 'no anchor',
  flowStarting: 'Starting',
  flowDeposits: 'Deposits',
  flowWithdrawals: 'Withdrawals',
}

const FALLBACK_COLOR = '#8b8f98'
// The segment's soft top-highlight — the luminosity over the account color.
const SEGMENT_SHEEN =
  'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.10) 100%)'

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
  flow: FlowStats
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
    setView(null) // stale guard — never wear another scope's number
    void load().catch(() => {
      if (!cancelled) setView(null)
    })
    return () => {
      cancelled = true
    }
  }, [scope])

  return (
    <Card title={S.title} className="relative overflow-hidden">
      {/* The one flourish (veto-able): a top-edge gold wash, this card only.
          Token-driven with a lighter light-mode alpha (the light audit). */}
      <div
        className="balance-gold-wash pointer-events-none absolute inset-x-0 top-0 h-24"
        aria-hidden
      />
      <div className="relative">
        {view === null ? (
          <div className="h-[96px]" aria-hidden />
        ) : view.kind === 'all' ? (
          <AllBody view={view} />
        ) : (
          <SingleBody view={view} />
        )}
      </div>
    </Card>
  )
}

/** The capital band — luminous account-color segments over a quiet track.
 *  Width transitions respect reduced motion; a 2% visual floor keeps tiny
 *  accounts visible (the row's % stays the honest number). */
function CapitalBand({
  segments,
  colorOf,
}: {
  segments: { id: string; fraction: number }[]
  colorOf: (id: string) => string
}) {
  return (
    <div
      className="balance-band-track mt-4 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
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
              backgroundColor: colorOf(s.id),
            }}
          >
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: SEGMENT_SHEEN }}
            />
          </div>
        ))}
    </div>
  )
}

/** The honest empty track — an invitation, never a fabricated segment. */
function GhostBand() {
  return (
    <div
      data-testid="alloc-ghost"
      className="mt-4 h-2.5 w-full rounded-full border border-dashed border-border-subtle"
      aria-hidden
    />
  )
}

function AllBody({ view }: { view: AllView }) {
  const m = view.accounts.length
  const anchored = m - view.combined.missing_anchor.length
  const segments = allocationSegments(
    view.accounts
      .filter((a) => view.balances[a.id] !== null && view.balances[a.id] !== undefined)
      .map((a) => ({ id: a.id, balance: view.balances[a.id]!.balance })),
  )
  const fractionOf = (id: string) => segments.find((s) => s.id === id)?.fraction ?? null
  const colorOf = (id: string) =>
    view.accounts.find((a) => a.id === id)?.color ?? FALLBACK_COLOR

  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-tertiary">
        {S.totalLabel}
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        {anchored === 0 ? (
          <span
            data-testid="balance-total"
            className="font-mono text-4xl font-bold tracking-tight text-fg-primary tnum"
          >
            {S.none}
          </span>
        ) : (
          <span data-testid="balance-total">
            <MoneyFigure value={view.combined.total} size="4xl" className="text-fg-primary" />
          </span>
        )}
        <span className="text-xs text-fg-tertiary">
          {anchored === m ? S.acrossAll(m) : S.acrossPartial(anchored, m)}
        </span>
      </div>
      {anchored === 0 && (
        <p className="mt-2 text-xs text-fg-tertiary">{S.setStartingHint}</p>
      )}
      {anchored > 0 && segments.length > 0 ? (
        <CapitalBand segments={segments} colorOf={colorOf} />
      ) : (
        <GhostBand />
      )}
      <ul className="mt-3 divide-y divide-border-subtle">
        {view.accounts.map((a) => {
          const b = view.balances[a.id] ?? null
          const fraction = b === null ? null : fractionOf(a.id)
          return (
            <li
              key={a.id}
              data-testid={`balance-row-${a.id}`}
              className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 py-2 text-xs ${a.status === 'archived' ? 'opacity-60' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {/* The color tick — the row's link to its band segment. */}
                <span
                  className="h-[10px] w-[2px] shrink-0 rounded-full"
                  style={{ backgroundColor: a.color ?? FALLBACK_COLOR }}
                  aria-hidden
                />
                <span className="truncate text-fg-secondary">{a.name}</span>
                {a.status === 'archived' && (
                  <span className="shrink-0 rounded-full border border-border-subtle bg-bg-1 px-1.5 py-px text-[9px] uppercase tracking-wider text-fg-tertiary">
                    {S.archivedTag}
                  </span>
                )}
                {b === null && (
                  <span className="shrink-0 rounded-full border border-border-subtle bg-bg-1 px-1.5 py-px text-[9px] uppercase tracking-wider text-fg-tertiary">
                    {S.noAnchorTag}
                  </span>
                )}
              </span>
              <span className="text-right font-mono text-fg-tertiary tnum">
                {fraction === null ? '' : `${Math.round(fraction * 100)}%`}
              </span>
              <span className="w-24 text-right font-mono text-fg-primary tnum">
                {b === null ? S.none : <MaskedMoney>{money(b.balance)}</MaskedMoney>}
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
  const accent = view.account?.color ?? FALLBACK_COLOR
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-tertiary">
          {view.account?.name ?? S.totalLabel}
        </span>
        {view.account && (
          <span
            className={`rounded-full border border-border-subtle bg-bg-1 px-1.5 py-px text-[9px] uppercase tracking-wider ${isSim ? 'text-fg-secondary' : 'text-fg-tertiary'}`}
          >
            {ACCOUNT_TYPE_LABELS[view.account.account_type]}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-3">
        {view.balance === null ? (
          <span
            data-testid="balance-total"
            className="font-mono text-4xl font-bold tracking-tight text-fg-primary tnum"
          >
            {S.none}
          </span>
        ) : (
          <span data-testid="balance-total">
            <MoneyFigure value={view.balance.balance} size="4xl" className="text-fg-primary" />
          </span>
        )}
        {view.balance !== null && (
          <span className="font-mono text-xs text-fg-tertiary tnum">
            {S.sinceAnchor(view.balance.anchor_date)}
          </span>
        )}
      </div>
      {/* The accent — the account color with a faint glow; a GHOST accent
          (dashed) when un-anchored. */}
      {view.balance !== null ? (
        <div
          data-testid="alloc-accent"
          className="mt-4 h-1.5 w-full rounded-full"
          style={{
            backgroundColor: accent,
            boxShadow: `0 0 8px 0 ${accent}55`,
          }}
          aria-hidden
        />
      ) : (
        <div
          data-testid="alloc-accent"
          className="mt-4 h-1.5 w-full rounded-full border border-dashed border-border-subtle"
          aria-hidden
        />
      )}
      {view.balance === null && (
        <p className="mt-2 text-xs text-fg-tertiary">{S.setStartingHint}</p>
      )}
      {/* THE FLOW STRIP — quiet dot-separated micro-facts; labels carry the
          signs, colors never do. */}
      {view.balance !== null && view.flow.starting && (
        <p
          data-testid="flow-strip"
          className="mt-3 font-mono text-[11px] text-fg-tertiary tnum"
        >
          {S.flowStarting} <MaskedMoney>{money(view.flow.starting.amount)}</MaskedMoney> · {view.flow.starting.date}
          {view.flow.deposits > 0 && (
            <> · {S.flowDeposits} <MaskedMoney>{money(view.flow.deposits)}</MaskedMoney></>
          )}
          {view.flow.withdrawals > 0 && (
            <> · {S.flowWithdrawals} <MaskedMoney>{money(view.flow.withdrawals)}</MaskedMoney></>
          )}
        </p>
      )}
    </div>
  )
}
