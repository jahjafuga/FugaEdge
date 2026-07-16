import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, X } from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import type {
  TechnicalSnapshot,
  TradeTechnicalsRow,
} from '@shared/technicals-types'
import type { Timeframe } from '@/core/technicals/headerStrip'
import { ipc } from '@/lib/ipc'
import { useAccountScope } from '@/lib/accountScope'
import { accountOwner } from '@/core/trades/accountIndicator'
import {
  compactShares,
  duration,
  formatEastern,
  int,
  longDate,
  money,
  pnlClass,
  price,
  signed,
  signedPct,
} from '@/lib/format'
import Skeleton from '@/components/ui/Skeleton'

// v0.2.4 Beat F2.1 — read-only detail sheet for the Technicals tab's bucket
// drill-through. A FRESH centered-portal shell (NOT DetailModalShell, which is
// tab-centric and would couple analytics drill-down to calendar concerns). The
// editable workflow stays in TradeDetailModal on the Trades tab (§B LOCKED).
//
// Indicator values come from the `technicalsHint` PROP (a TradeTechnicalsRow,
// already resolved per-row by the caller) — TradeListRow itself carries no
// per-timeframe snapshot. Only the active timeframe renders (1m or 5m, never
// both). F6 wires the row-click that opens this; F2.1 ships it standalone.

interface TradeDetailSheetProps {
  trade_id: number
  /** Per-timeframe indicator snapshot for this trade, or null when no
   *  trade_technicals row exists (drives the Indicators empty state). */
  technicalsHint: TradeTechnicalsRow | null
  timeframe: Timeframe
  onClose: () => void
}

type LoadState = 'loading' | 'loaded' | 'not_found' | 'error'

const TITLE_ID = 'trade-detail-sheet-title'
const DEFAULT_VISIBLE_EXECS = 8

export function TradeDetailSheet({
  trade_id,
  technicalsHint,
  timeframe,
  onClose,
}: TradeDetailSheetProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [trade, setTrade] = useState<TradeListRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAllExecs, setShowAllExecs] = useState(false)

  const load = useCallback(async () => {
    setLoadState('loading')
    setError(null)
    try {
      const result = await ipc.getTrade({ trade_id })
      if (result === null) {
        setLoadState('not_found')
      } else {
        setTrade(result)
        setLoadState('loaded')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setLoadState('error')
    }
  }, [trade_id])

  useEffect(() => {
    load()
  }, [load])

  // Read-only sheet — no nested editors to guard, so Escape always closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
    >
      <div
        className="absolute inset-0 bg-bg-0/72 backdrop-blur-[4px]"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="relative flex max-h-[88vh] w-full max-w-[680px] flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in">
        <SheetHeader trade={trade} onClose={onClose} />
        <div className="flex-1 overflow-auto px-5 py-4">
          {loadState === 'loading' && <LoadingBlocks />}
          {loadState === 'not_found' && <NotFoundState />}
          {loadState === 'error' && (
            <ErrorState message={error} onRetry={load} />
          )}
          {loadState === 'loaded' && trade && (
            <LoadedContent
              trade={trade}
              technicalsHint={technicalsHint}
              timeframe={timeframe}
              showAllExecs={showAllExecs}
              setShowAllExecs={setShowAllExecs}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Section 1: Identity (the header) — present in every render state so the
//    close affordance never disappears; identity details fill in once loaded ──
function SheetHeader({
  trade,
  onClose,
}: {
  trade: TradeListRow | null
  onClose: () => void
}) {
  // Multi-account slice — the detail names its owning account under EVERY
  // scope (muted dot + name; unknown ids render nothing).
  const { accounts } = useAccountScope()
  const owner = trade ? accountOwner(accounts, trade.account_id) : null
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        {trade ? (
          <>
            <div className="flex items-baseline gap-3">
              <h2
                id={TITLE_ID}
                className="font-mono text-2xl font-semibold tracking-tight text-fg-primary"
              >
                {trade.symbol}
              </h2>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  trade.side === 'short'
                    ? 'bg-loss-soft text-loss'
                    : 'bg-win-soft text-win'
                }`}
              >
                {trade.side}
              </span>
              {trade.deleted_at && (
                <span className="rounded-sm bg-loss-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-loss">
                  In Trash
                </span>
              )}
              {owner && (
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-border-subtle px-1.5 py-0.5 text-[10px] text-fg-tertiary">
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: owner.color ?? 'var(--fg-muted, #8a8a8a)' }}
                  />
                  {owner.name}
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-fg-tertiary tnum">
              {/* Dave #16 — Modal==Sheet convergence: the same date · entry
                  time pair as the modal header, same source as the Round
                  Trips OPEN column. */}
              {longDate(trade.date)} · {formatEastern(trade.open_time)}
            </div>
          </>
        ) : (
          <h2
            id={TITLE_ID}
            className="font-mono text-lg font-semibold text-fg-secondary"
          >
            Trade
          </h2>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
      >
        <X size={16} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Sections 2–10 — single scroll, LOCKED order ──
function LoadedContent({
  trade,
  technicalsHint,
  timeframe,
  showAllExecs,
  setShowAllExecs,
}: {
  trade: TradeListRow
  technicalsHint: TradeTechnicalsRow | null
  timeframe: Timeframe
  showAllExecs: boolean
  setShowAllExecs: Dispatch<SetStateAction<boolean>>
}) {
  // Active-timeframe snapshot from the hint — null hint → undefined → empty
  // state in IndicatorsSection (clarification #1).
  const tf =
    timeframe === '1m' ? technicalsHint?.tf_1m : technicalsHint?.tf_5m

  // Hold time derived from open/close — TradeListRow has no hold_seconds field;
  // null close (still-open trade) → null → duration() renders "—" (#2).
  const holdSeconds = trade.close_time
    ? (Date.parse(trade.close_time) - Date.parse(trade.open_time)) / 1000
    : null

  return (
    <div className="space-y-4">
      <OutcomeSection trade={trade} />
      <IndicatorsSection tf={tf} timeframe={timeframe} />
      <PlaybookSection trade={trade} />
      <RiskSection trade={trade} />
      <HoldSection holdSeconds={holdSeconds} mae={trade.mae} mfe={trade.mfe} />
      <SizingSection trade={trade} />
      <ExecutionsSection
        executions={trade.executions}
        showAll={showAllExecs}
        setShowAll={setShowAllExecs}
      />
      <NotesSection note={trade.note} />
      <StockSection trade={trade} />
    </div>
  )
}

// ── Shared presentational primitives ──
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border-subtle bg-bg-2 p-4">
      <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs text-fg-tertiary">{label}</span>
      <span className={`font-mono text-sm tnum ${tone ?? 'text-fg-primary'}`}>
        {value}
      </span>
    </div>
  )
}

// Indicator value + signed-percentage distance, side by side. Kept distinct
// from Row so the VWAP / EMA distance reads as a secondary figure.
function MetricRow({
  label,
  value,
  dist,
}: {
  label: string
  value: string
  dist: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-xs text-fg-tertiary">{label}</span>
      <span className="flex items-baseline gap-2 font-mono text-sm tnum">
        <span className="text-fg-primary">{value}</span>
        <span className="text-fg-tertiary">{dist}</span>
      </span>
    </div>
  )
}

const macdNum = (n: number | null) => (n == null ? '—' : n.toFixed(3))
const bool = (b: boolean | null) => (b == null ? '—' : b ? 'Yes' : 'No')
const priceOrDash = (n: number | null) => (n == null ? '—' : price(n))
const distOrDash = (n: number | null) => (n == null ? '—' : signedPct(n))
const textOrDash = (s: string | null | undefined) =>
  s == null || s === '' ? '—' : s

// ── Section 2: Outcome ──
function OutcomeSection({ trade }: { trade: TradeListRow }) {
  return (
    <Section title="Outcome">
      <div
        className={`font-mono text-3xl font-semibold tnum ${pnlClass(trade.net_pnl)}`}
      >
        {signed(trade.net_pnl)}
      </div>
      <div className="mt-1 text-xs text-fg-tertiary tnum">
        Gross {signed(trade.gross_pnl)} · Fees {money(trade.total_fees)}
      </div>
      {/* Fee breakdown — only when the broker reported a separate commission
          (Ocean One). NULL (DAS/Webull) shows no split — the sheet's native
          `== null ? '—'` honest-absence idiom; never a fabricated $0. Mirrors
          TradeDetailModal's breakdown (7eebbb6); same wording + middle-dot.
          Commission is a SLICE of total_fees, so Other fees = the remainder. */}
      {trade.commission != null && (
        <div className="mt-1 text-xs text-fg-tertiary tnum">
          Commission {money(trade.commission)} · Other fees {money(trade.total_fees - trade.commission)}
        </div>
      )}
    </Section>
  )
}

// ── Section 3: Indicators (from technicalsHint, active timeframe only) ──
function IndicatorsSection({
  tf,
  timeframe,
}: {
  tf: TechnicalSnapshot | undefined
  timeframe: Timeframe
}) {
  if (!tf) {
    return (
      <Section title="Indicators">
        <p className="text-xs text-fg-tertiary">
          Indicators not available for this trade
        </p>
      </Section>
    )
  }
  return (
    <Section title={`Indicators (${timeframe})`}>
      <Row label="MACD line" value={macdNum(tf.macd_line)} />
      <Row label="Signal" value={macdNum(tf.signal_line)} />
      <Row label="Histogram" value={macdNum(tf.histogram)} />
      <Row label="MACD positive" value={bool(tf.macd_positive)} />
      <Row label="MACD open" value={bool(tf.macd_open)} />
      <Row label="MACD rising" value={bool(tf.macd_rising)} />
      <MetricRow
        label="VWAP"
        value={priceOrDash(tf.vwap)}
        dist={distOrDash(tf.vwap_dist_pct)}
      />
      <MetricRow
        label="EMA 9"
        value={priceOrDash(tf.ema9)}
        dist={distOrDash(tf.ema9_dist_pct)}
      />
      <MetricRow
        label="EMA 20"
        value={priceOrDash(tf.ema20)}
        dist={distOrDash(tf.ema20_dist_pct)}
      />
      <Row label="EMA 9 > EMA 20" value={bool(tf.ema9_above_ema20)} />
    </Section>
  )
}

// ── Section 4: Playbook & catalyst ──
function PlaybookSection({ trade }: { trade: TradeListRow }) {
  return (
    <Section title="Playbook & catalyst">
      <Row label="Playbook" value={textOrDash(trade.playbook_name)} />
      <Row label="Tier" value={textOrDash(trade.playbook_tier)} />
      <Row label="Catalyst" value={textOrDash(trade.catalyst_type)} />
      <Row
        label="Days since catalyst"
        value={
          trade.days_since_catalyst == null
            ? '—'
            : int(trade.days_since_catalyst)
        }
      />
      <Row
        label="Confidence"
        value={trade.confidence == null ? '—' : `${trade.confidence}/5`}
      />
      <Row
        label="Mistakes"
        value={trade.mistakes.length ? trade.mistakes.join(', ') : '—'}
      />
    </Section>
  )
}

// ── Section 5: Risk ──
function RiskSection({ trade }: { trade: TradeListRow }) {
  return (
    <Section title="Risk">
      <Row
        label="Planned risk"
        value={trade.planned_risk == null ? '—' : money(trade.planned_risk)}
      />
      <Row
        label="Planned stop"
        value={
          trade.planned_stop_loss_price == null
            ? '—'
            : price(trade.planned_stop_loss_price)
        }
      />
      <Row
        label="Risk / share"
        value={
          trade.risk_per_share == null ? '—' : money(trade.risk_per_share)
        }
      />
      <Row
        label="Total risk"
        value={trade.total_risk == null ? '—' : money(trade.total_risk)}
      />
      <Row
        label="R multiple"
        value={
          trade.r_multiple == null ? '—' : `${trade.r_multiple.toFixed(2)}R`
        }
      />
    </Section>
  )
}

// ── Section 6: Hold & excursion ──
function HoldSection({
  holdSeconds,
  mae,
  mfe,
}: {
  holdSeconds: number | null
  mae: number | null
  mfe: number | null
}) {
  return (
    <Section title="Hold & excursion">
      <Row label="Hold time" value={duration(holdSeconds)} />
      <Row label="MAE" value={mae == null ? '—' : `${money(mae)}/sh`} />
      <Row label="MFE" value={mfe == null ? '—' : `${money(mfe)}/sh`} />
    </Section>
  )
}

// ── Section 7: Sizing ──
function SizingSection({ trade }: { trade: TradeListRow }) {
  return (
    <Section title="Sizing">
      <Row label="Shares bought" value={int(trade.shares_bought)} />
      <Row label="Avg buy" value={price(trade.avg_buy_price)} />
      <Row label="Shares sold" value={int(trade.shares_sold)} />
      <Row label="Avg sell" value={price(trade.avg_sell_price)} />
      <Row label="Float" value={compactShares(trade.float_shares)} />
      <Row label="Shares out" value={compactShares(trade.shares_outstanding)} />
    </Section>
  )
}

// ── Section 8: Executions — 8 by default, "Show all N" expander ──
function ExecutionsSection({
  executions,
  showAll,
  setShowAll,
}: {
  executions: TradeListRow['executions']
  showAll: boolean
  setShowAll: Dispatch<SetStateAction<boolean>>
}) {
  if (executions.length === 0) {
    return (
      <Section title="Executions">
        <p className="text-xs text-fg-tertiary">No fills recorded</p>
      </Section>
    )
  }
  const visible = showAll
    ? executions
    : executions.slice(0, DEFAULT_VISIBLE_EXECS)
  const hasMore = executions.length > DEFAULT_VISIBLE_EXECS

  return (
    <Section
      title={`Executions · ${executions.length} fill${executions.length === 1 ? '' : 's'}`}
    >
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            <th className="pb-1 text-left font-semibold">Time</th>
            <th className="pb-1 text-left font-semibold">Side</th>
            <th className="pb-1 text-right font-semibold">Shares</th>
            <th className="pb-1 text-right font-semibold">Price</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e, i) => (
            <tr key={`${e.order_id}-${i}`}>
              <td className="py-0.5 text-fg-tertiary tnum">
                {formatEastern(e.time)}
              </td>
              <td
                className={`py-0.5 ${e.side === 'B' ? 'text-win' : 'text-loss'}`}
              >
                {e.side}
              </td>
              <td className="py-0.5 text-right text-fg-primary tnum">
                {int(e.qty)}
              </td>
              <td className="py-0.5 text-right text-fg-secondary tnum">
                {price(e.price)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:text-gold"
        >
          {showAll ? 'Show first 8' : `Show all ${executions.length}`}
        </button>
      )}
    </Section>
  )
}

// ── Section 9: Notes ──
function NotesSection({ note }: { note: TradeListRow['note'] }) {
  return (
    <Section title="Notes">
      {note?.text?.trim() ? (
        <p className="whitespace-pre-wrap text-sm text-fg-secondary">
          {note.text}
        </p>
      ) : (
        <p className="text-xs text-fg-tertiary">—</p>
      )}
    </Section>
  )
}

// ── Section 10: Stock ──
function StockSection({ trade }: { trade: TradeListRow }) {
  return (
    <Section title={`Stock · ${trade.symbol}`}>
      <Row label="Country" value={textOrDash(trade.country_name)} />
      <Row label="Region" value={textOrDash(trade.region)} />
      <Row label="Source" value={textOrDash(trade.country_source)} />
    </Section>
  )
}

// ── Render-state placeholders ──
function LoadingBlocks() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  )
}

function NotFoundState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm font-semibold text-fg-primary">Trade not found</p>
      <p className="mt-1 text-xs text-fg-tertiary">
        It may have been permanently deleted.
      </p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string | null
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <AlertCircle size={20} strokeWidth={2} className="mb-2 text-loss" />
      <p className="text-sm font-semibold text-fg-primary">
        Couldn’t load this trade
      </p>
      {message && (
        <p className="mt-1 text-xs text-fg-tertiary">{message}</p>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md border border-border-subtle bg-bg-2 px-3 text-xs font-semibold text-fg-secondary transition-colors duration-150 hover:border-border hover:text-fg-primary"
      >
        Retry
      </button>
    </div>
  )
}
