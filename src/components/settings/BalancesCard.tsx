// Stage 3 beat 2 — the Settings "Balances" card: per-account computed
// ledger balances over the cash channels. A SIBLING of Trading accounts
// (which stays untouched); mutates through its own channels and refetches
// its own data after each mutation (reactivity is LOCAL this beat — beat 3
// wires the consumer surfaces). Honesty rules: a NULL balance renders the
// em-dash + a "Set starting balance" affordance, never 0; pre-anchor dates
// warn inline (entry allowed); a movement on an un-anchored account carries
// the no-anchor note. v1 is ADD + DELETE only — no in-place edit. Deleting
// a starting row demands the un-anchor confirm; transfer legs route to the
// PAIR confirm (the engine refuses single-leg deletion anyway). Every
// dollar renders through the money helpers — no literal '$' anywhere (the
// beat-4 discreet-mode coverage rides on this).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, Flag, Minus, Plus, Trash2 } from 'lucide-react'
import Card from '@/components/ui/Card'
import ConfirmModal from '@/components/ui/ConfirmModal'
import MoneyFigure from '@/components/ui/MoneyFigure'
import { ipc } from '@/lib/ipc'
import { subscribeRegistryChanged } from '@/lib/registryChanged'
import { money } from '@/lib/format'
import type { Account } from '@shared/accounts-types'
import type { TradeListRow } from '@shared/trades-types'
import type { AccountBalance, CashEvent, CashEventKind } from '@shared/cash-types'
import { ACCOUNT_TYPE_LABELS } from '@/components/accounts/strings'

// Card copy — local to the card, eyes-gated at the live-look.
const S = {
  title: 'Balances',
  subtitle:
    'Computed from your starting balance, deposits, withdrawals, and trade P&L — per account.',
  noBalance: '—',
  setStarting: 'Set starting balance',
  addEntry: 'Add entry',
  saveEntry: 'Save entry',
  cancel: 'Cancel',
  kindLabel: 'Entry kind',
  amountLabel: 'Amount',
  dateLabel: 'Date',
  memoLabel: 'Memo',
  memoPlaceholder: 'Optional memo',
  kindNames: { starting: 'Starting balance', deposit: 'Deposit', withdrawal: 'Withdrawal' } as Record<
    CashEventKind,
    string
  >,
  preAnchorWarning:
    "This date is before this account's starting date — it won't count toward the balance.",
  startingDateHint: 'Trades from this date onward count toward the balance.',
  startingDisabledTitle:
    'This account already has a starting balance — edit or delete it in the history below.',
  anchorTrapNotice: (n: number, net: string) =>
    `${n} trade${n === 1 ? '' : 's'} before this date (net ${net}) won't count toward the balance.`,
  noAnchorNote:
    'This account has no starting balance yet — entries are kept, but no balance shows until one is set.',
  archivedDivider: 'Archived',
  transferTitle: 'Transfer between accounts',
  fromLabel: 'From account',
  toLabel: 'To account',
  transferAmountLabel: 'Transfer amount',
  transferDateLabel: 'Transfer date',
  transferMemoLabel: 'Transfer memo',
  transferSubmit: 'Transfer',
  transferMarker: 'Transfer',
  deleteEntry: 'Delete entry',
  unAnchorTitle: 'Delete starting balance?',
  unAnchorBody:
    "This un-anchors the account: its balance honestly returns to — until a new starting balance is set. The account's other entries stay.",
  unAnchorConfirm: 'Delete starting balance',
  pairTitle: 'Delete transfer?',
  pairBody:
    'This entry is one leg of a transfer. Both legs go together — the paired entry in the other account is deleted too, restoring both balances.',
  pairConfirm: 'Delete transfer',
}

/** The neutral 12px kind icon — Flag (starting), Plus (deposit), Minus
 *  (withdrawal). Neutral by law: a deposit is not profit. */
function KindIcon({ kind }: { kind: CashEventKind }) {
  const Icon = kind === 'starting' ? Flag : kind === 'deposit' ? Plus : Minus
  return <Icon size={12} strokeWidth={2} aria-hidden />
}

/** Electron wraps main-side throws — show the repo's friendly message. */
function friendly(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '')
}

function todayLocalISO(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

interface EntryDraft {
  accountId: string
  kind: CashEventKind
  amount: string
  date: string
  note: string
}

type PendingDelete =
  | { mode: 'starting'; eventId: string }
  | { mode: 'pair'; transferId: string }

const inputCls =
  'h-9 w-full rounded-md border border-border-strong bg-bg-1 px-3 text-sm text-fg-primary outline-none focus:border-gold/60'
const labelCls = 'mb-1 block text-[11px] font-medium uppercase tracking-wider text-fg-tertiary'

export default function BalancesCard() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [balances, setBalances] = useState<Record<string, AccountBalance | null>>({})
  const [events, setEvents] = useState<CashEvent[]>([])
  const [draft, setDraft] = useState<EntryDraft | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The anchor-trap notice's data: the account's trades, fetched ONCE per
  // STARTING-form open (trades don't change mid-form); the {count, net}
  // pair recomputes locally as the date input moves.
  const [trapTrades, setTrapTrades] = useState<TradeListRow[] | null>(null)

  useEffect(() => {
    if (draft?.kind !== 'starting') {
      setTrapTrades(null)
      return
    }
    let cancelled = false
    ipc
      .tradesList({ accountScope: { accountId: draft.accountId } })
      .then((rows) => {
        if (!cancelled) setTrapTrades(rows)
      })
      .catch(() => {
        if (!cancelled) setTrapTrades(null) // informational — fail silent
      })
    return () => {
      cancelled = true
    }
    // Deliberately NOT keyed on the date — one fetch per form-open.
  }, [draft?.kind, draft?.accountId])

  // Transfer form state (card-level — one form serves all accounts).
  const [txFrom, setTxFrom] = useState('')
  const [txTo, setTxTo] = useState('')
  const [txAmount, setTxAmount] = useState('')
  const [txDate, setTxDate] = useState(todayLocalISO())
  const [txNote, setTxNote] = useState('')

  const reload = useCallback(async () => {
    const accts = await ipc.accountsList()
    setAccounts(accts)
    const [evts, ...bals] = await Promise.all([
      ipc.cashEventsList(),
      ...accts.map((a) => ipc.cashBalanceGet(a.id)),
    ])
    setEvents(evts as CashEvent[])
    const map: Record<string, AccountBalance | null> = {}
    accts.forEach((a, i) => {
      map[a.id] = bals[i] as AccountBalance | null
    })
    setBalances(map)
  }, [])

  useEffect(() => {
    void reload().catch((e) => setError(friendly(e)))
    // Beat 2.5 — the sibling notify: registry mutations in Trading accounts
    // announce; this card refetches. The returned unsubscribe is the effect
    // cleanup (strict-mode double-mount safe).
    return subscribeRegistryChanged(() => {
      void reload().catch((e) => setError(friendly(e)))
    })
  }, [reload])

  const eventsByAccount = useMemo(() => {
    const map: Record<string, CashEvent[]> = {}
    for (const ev of events) {
      ;(map[ev.account_id] ??= []).push(ev)
    }
    return map
  }, [events])

  const active = accounts.filter((a) => a.status === 'active')
  const archived = accounts.filter((a) => a.status === 'archived')

  const openDraft = (accountId: string, kind: CashEventKind) => {
    setError(null)
    setDraft({ accountId, kind, amount: '', date: todayLocalISO(), note: '' })
  }

  const saveDraft = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await ipc.cashEventCreate({
        account_id: draft.accountId,
        kind: draft.kind,
        amount: Number(draft.amount),
        date: draft.date,
        note: draft.note,
      })
      setDraft(null)
      await reload()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  const requestDelete = (ev: CashEvent) => {
    setError(null)
    if (ev.transfer_id) {
      setPendingDelete({ mode: 'pair', transferId: ev.transfer_id })
    } else if (ev.kind === 'starting') {
      setPendingDelete({ mode: 'starting', eventId: ev.id })
    } else {
      void (async () => {
        try {
          await ipc.cashEventDelete(ev.id)
          await reload()
        } catch (e) {
          setError(friendly(e))
        }
      })()
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setBusy(true)
    try {
      if (pendingDelete.mode === 'starting') {
        await ipc.cashEventDelete(pendingDelete.eventId)
      } else {
        await ipc.cashTransferDelete(pendingDelete.transferId)
      }
      setPendingDelete(null)
      await reload()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  const submitTransfer = async () => {
    setBusy(true)
    setError(null)
    try {
      await ipc.cashTransferCreate({
        from_account_id: txFrom,
        to_account_id: txTo,
        amount: Number(txAmount),
        date: txDate,
        note: txNote,
      })
      setTxAmount('')
      setTxNote('')
      setTxTo('')
      await reload()
    } catch (e) {
      setError(friendly(e))
    } finally {
      setBusy(false)
    }
  }

  const fromAccount = accounts.find((a) => a.id === txFrom) ?? null
  // Same-realm counterparties only (both sim or both non-sim), never self —
  // the engine rejects anyway; the picker prevents.
  const counterparties = fromAccount
    ? accounts.filter(
        (a) =>
          a.id !== fromAccount.id &&
          (a.account_type === 'sim') === (fromAccount.account_type === 'sim'),
      )
    : []

  const renderSection = (a: Account) => {
    const bal = balances[a.id] ?? null
    const acctEvents = eventsByAccount[a.id] ?? []
    const formOpen = draft?.accountId === a.id
    const preAnchor =
      formOpen && bal !== null && draft.kind !== 'starting' && draft.date < bal.anchor_date

    return (
      <div
        key={a.id}
        data-testid={`balances-account-${a.id}`}
        className={`rounded-lg border border-border-subtle bg-bg-1 p-4 ${a.status === 'archived' ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: a.color ?? '#8b8f98' }}
              aria-hidden
            />
            <span className="truncate text-sm font-medium text-fg-primary">{a.name}</span>
            <span className="shrink-0 text-xs text-fg-tertiary">
              {ACCOUNT_TYPE_LABELS[a.account_type]}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex flex-col items-end">
              <span
                data-testid={`balance-${a.id}`}
                className="font-mono text-lg font-bold tracking-tight text-fg-primary tnum"
              >
                {bal === null ? S.noBalance : <MoneyFigure value={bal.balance} size="lg" />}
              </span>
              {bal !== null && (
                <span className="font-mono text-[10px] text-fg-tertiary tnum">
                  since {bal.anchor_date}
                </span>
              )}
            </span>
            {/* An un-anchored account offers BOTH: the starting affordance
                and Add entry — movements are allowed pre-anchor (the
                no-anchor note keeps it honest). */}
            {bal === null && (
              <button
                type="button"
                onClick={() => openDraft(a.id, 'starting')}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-gold/40 bg-bg-0 px-3 text-xs font-medium text-gold transition-colors hover:bg-gold/10"
              >
                <Plus size={13} strokeWidth={2} />
                {S.setStarting}
              </button>
            )}
            <button
              type="button"
              onClick={() => openDraft(a.id, 'deposit')}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-bg-0 px-3 text-xs text-fg-secondary transition-colors hover:border-border hover:text-fg-primary"
            >
              <Plus size={13} strokeWidth={2} />
              {S.addEntry}
            </button>
          </div>
        </div>

        {formOpen && (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-0 p-3">
            {/* The segmented kind picker (round 3, Lao-locked): one tap,
                aria-pressed semantics. The Starting segment is DISABLED
                when the account already holds a starting row — prevention
                over error; the repo's friendly guard stays as the belt. */}
            <div
              role="group"
              aria-label={S.kindLabel}
              className="mb-3 inline-flex rounded-md border border-border-strong bg-bg-1 p-0.5"
            >
              {(['deposit', 'withdrawal', 'starting'] as CashEventKind[]).map((k) => {
                const startingBlocked = k === 'starting' && bal !== null
                const active = draft.kind === k
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={active}
                    disabled={startingBlocked}
                    title={startingBlocked ? S.startingDisabledTitle : undefined}
                    onClick={() => setDraft({ ...draft, kind: k })}
                    className={`h-8 cursor-pointer rounded px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? 'bg-gold text-accent-ink'
                        : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                  >
                    {S.kindNames[k]}
                  </button>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={labelCls}>{S.amountLabel}</span>
                <input
                  aria-label={S.amountLabel}
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{S.dateLabel}</span>
                <input
                  aria-label={S.dateLabel}
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                  className={inputCls}
                />
                {draft.kind === 'starting' && (
                  <p className="mt-1 text-xs text-fg-tertiary">{S.startingDateHint}</p>
                )}
                {/* The LIVE anchor-trap notice — the one-anchor law made
                    concrete at entry time. Neutral and informational:
                    warn, never block. */}
                {draft.kind === 'starting' &&
                  trapTrades !== null &&
                  (() => {
                    const before = trapTrades.filter((t) => t.date < draft.date)
                    if (before.length === 0) return null
                    const net = before.reduce((s, t) => s + t.net_pnl, 0)
                    return (
                      <p className="mt-1 text-xs text-fg-tertiary">
                        {S.anchorTrapNotice(before.length, money(net))}
                      </p>
                    )
                  })()}
              </label>
              <label className="block">
                <span className={labelCls}>{S.memoLabel}</span>
                <input
                  aria-label={S.memoLabel}
                  type="text"
                  placeholder={S.memoPlaceholder}
                  value={draft.note}
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  className={inputCls}
                />
              </label>
            </div>
            {preAnchor && (
              <p className="mt-2 text-xs text-warn">{S.preAnchorWarning}</p>
            )}
            {bal === null && draft.kind !== 'starting' && (
              <p className="mt-2 text-xs text-fg-tertiary">{S.noAnchorNote}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveDraft()}
                disabled={busy || draft.amount === '' || draft.date === ''}
                className="inline-flex h-8 cursor-pointer items-center rounded-md bg-gold px-3 text-xs font-semibold text-accent-ink transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {S.saveEntry}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-3 text-xs text-fg-secondary transition-colors hover:text-fg-primary"
              >
                {S.cancel}
              </button>
            </div>
          </div>
        )}

        {/* No-anchor honesty also outside the form: a movement exists but no
            balance shows. The note lives in the form per the ruling; the
            history below stays visible regardless. */}
        {acctEvents.length > 0 && (
          <ul className="mt-3 divide-y divide-border-subtle rounded-md border border-border-subtle bg-bg-0">
            {acctEvents.map((ev) => (
              <li
                key={ev.id}
                data-testid={`cash-event-${ev.id}`}
                className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-bg-1/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {/* Neutral kind chip with its icon — the transfer-chip
                      shell extended; a deposit is not profit, a
                      withdrawal is not loss. */}
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-bg-1 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary">
                    <KindIcon kind={ev.kind} />
                    {S.kindNames[ev.kind]}
                  </span>
                  {ev.transfer_id && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border-subtle bg-bg-1 px-2 py-0.5 text-[10px] uppercase tracking-wider text-fg-tertiary">
                      <ArrowRightLeft size={10} strokeWidth={2} />
                      {S.transferMarker}
                    </span>
                  )}
                  {ev.note && <span className="truncate italic text-fg-tertiary">{ev.note}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {/* RULED EXCEPTION (Lao, 2026-07-03): bank-style inflow
                      green in the Settings ledger history ONLY - deposits
                      wear the profit token; withdrawals stay neutral; red
                      is reserved for P&L loss app-wide. Signs ride the
                      amount text (single node); starting rows are anchors,
                      not flows - unsigned, neutral. */}
                  <span
                    className={`w-20 text-right font-mono tnum ${
                      ev.kind === 'deposit' ? 'text-win' : 'text-fg-primary'
                    }`}
                  >
                    {ev.kind === 'deposit'
                      ? `+${money(ev.amount)}`
                      : ev.kind === 'withdrawal'
                        ? `-${money(ev.amount)}`
                        : money(ev.amount)}
                  </span>
                  <span className="font-mono text-fg-tertiary tnum">{ev.date}</span>
                  <button
                    type="button"
                    aria-label={S.deleteEntry}
                    onClick={() => requestDelete(ev)}
                    className="shrink-0 cursor-pointer rounded p-1 text-fg-tertiary transition-colors hover:text-loss"
                  >
                    <Trash2 size={13} strokeWidth={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <Card title={S.title} subtitle={S.subtitle}>
      <div className="space-y-3">
        {error && (
          <p role="alert" className="text-xs text-loss">
            {error}
          </p>
        )}

        {active.map(renderSection)}

        {archived.length > 0 && (
          <>
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-medium uppercase tracking-wider text-fg-tertiary">
                {S.archivedDivider}
              </span>
              <div className="h-px flex-1 bg-border-subtle" aria-hidden />
            </div>
            {archived.map(renderSection)}
          </>
        )}

        {/* Transfer — one form serves all accounts; counterparties are
            same-realm only and never self. */}
        {accounts.length > 1 && (
          <div className="rounded-lg border border-border-subtle bg-bg-1 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-fg-primary">
              <ArrowRightLeft size={14} strokeWidth={2} className="text-fg-tertiary" />
              {S.transferTitle}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <label className="block">
                <span className={labelCls}>{S.fromLabel}</span>
                <select
                  aria-label={S.fromLabel}
                  value={txFrom}
                  onChange={(e) => {
                    setTxFrom(e.target.value)
                    setTxTo('')
                  }}
                  className={inputCls}
                >
                  <option value="" />
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>{S.toLabel}</span>
                <select
                  aria-label={S.toLabel}
                  value={txTo}
                  onChange={(e) => setTxTo(e.target.value)}
                  className={inputCls}
                >
                  <option value="" />
                  {counterparties.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelCls}>{S.transferAmountLabel}</span>
                <input
                  aria-label={S.transferAmountLabel}
                  type="number"
                  min="0"
                  step="0.01"
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{S.transferDateLabel}</span>
                <input
                  aria-label={S.transferDateLabel}
                  type="date"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className={labelCls}>{S.transferMemoLabel}</span>
                <input
                  aria-label={S.transferMemoLabel}
                  type="text"
                  placeholder={S.memoPlaceholder}
                  value={txNote}
                  onChange={(e) => setTxNote(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void submitTransfer()}
                disabled={busy || !txFrom || !txTo || txAmount === '' || txDate === ''}
                className="inline-flex h-8 cursor-pointer items-center rounded-md bg-gold px-3 text-xs font-semibold text-accent-ink transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {S.transferSubmit}
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={pendingDelete?.mode === 'pair' ? S.pairTitle : S.unAnchorTitle}
        body={
          <p className="text-sm text-fg-secondary">
            {pendingDelete?.mode === 'pair' ? S.pairBody : S.unAnchorBody}
          </p>
        }
        confirmLabel={pendingDelete?.mode === 'pair' ? S.pairConfirm : S.unAnchorConfirm}
        busy={busy}
        tone="destructive"
        onConfirm={() => void confirmDelete()}
      />
    </Card>
  )
}
