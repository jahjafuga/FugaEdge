import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, Image, NotebookPen, AlertTriangle, BarChart3, Loader2 } from 'lucide-react'
import type {
  EntryTimeframe,
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateMistakesInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'
import { money, price, int, signed, pnlClass, longDate, formatEastern } from '@/lib/format'
import PlaybookPicker from '@/components/playbook/PlaybookPicker'
import TimeframePicker from './TimeframePicker'
import ConfidencePicker from './ConfidencePicker'
import PlannedRiskEditor from './PlannedRiskEditor'
import FloatEditor from './FloatEditor'
import CountryEditor from './CountryEditor'
import CatalystEditor from './CatalystEditor'
import NoteEditor from './NoteEditor'
import AttachmentManager from './AttachmentManager'
import MistakesChecklist from './MistakesChecklist'

// Lazy-loaded: pulls in the lightweight-charts library (~110 KB) only when
// the user actually clicks the Chart tab. Keeps the Trades chunk slim.
const ChartTab = lazy(() => import('./ChartTab'))

interface TradeDetailModalProps {
  trade: TradeListRow | null
  onClose: () => void
  onSaveNote: (input: UpdateNoteInput) => Promise<void>
  onSaveTimeframe: (input: UpdateTimeframeInput) => Promise<void>
  onSavePlaybook: (input: SetPlaybookOnTradeInput) => Promise<void>
  onSaveConfidence: (input: UpdateConfidenceInput) => Promise<void>
  onSaveMistakes: (input: UpdateMistakesInput) => Promise<void>
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
  /** Bulk per-symbol manual override (optional — both modal hosts provide it). */
  onSaveCountrySymbol?: (input: UpdateCountryForSymbolInput) => Promise<void>
  /** When opened on top of another modal (e.g. stacked inside DayDetailModal),
   *  raises the overlay above it. Default false → standalone z-[60]; true →
   *  z-[210], above DayDetailModal's z-[110]. */
  stacked?: boolean
}

type TabKey = 'overview' | 'notes' | 'attachments' | 'mistakes' | 'chart'

const TABS: { key: TabKey; label: string; Icon: typeof BookOpen }[] = [
  { key: 'overview',    label: 'Overview',    Icon: BookOpen },
  { key: 'notes',       label: 'Notes',       Icon: NotebookPen },
  { key: 'attachments', label: 'Attachments', Icon: Image },
  { key: 'mistakes',    label: 'Mistakes',    Icon: AlertTriangle },
  { key: 'chart',       label: 'Chart',       Icon: BarChart3 },
]

// MASTER §5.4 + §7.2 — portal modal for trade expand (replaces the previous
// in-row accordion). xl width (~880px) gives the executions table room to
// breathe; tabs keep the surface scannable.
export default function TradeDetailModal({
  trade,
  onClose,
  onSaveNote,
  onSaveTimeframe,
  onSavePlaybook,
  onSaveConfidence,
  onSaveMistakes,
  onSavePlannedRisk,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
  onSaveCountrySymbol,
  stacked = false,
}: TradeDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')

  useEffect(() => {
    if (!trade) return
    setTab('overview')
  }, [trade?.id])

  useEffect(() => {
    if (!trade) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [trade, onClose])

  if (!trade) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-detail-title"
      className={`fixed inset-0 ${stacked ? 'z-[210]' : 'z-[60]'} flex items-center justify-center p-6`}
    >
      <div
        className="absolute inset-0 bg-bg-0/72 backdrop-blur-[4px]"
        onClick={onClose}
      />
      <div className="relative flex max-h-[92vh] w-full max-w-[880px] flex-col rounded-lg border border-border bg-bg-3 shadow-lg animate-modal-in">
        <ModalHeader trade={trade} onClose={onClose} />
        <div className="flex items-center gap-0 border-b border-border-subtle px-3">
          {TABS.map((t) => {
            const active = t.key === tab
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-selected={active}
                role="tab"
                className={`relative inline-flex h-10 cursor-pointer items-center gap-2 px-3 text-sm transition-colors duration-150 ease-out-soft ${
                  active
                    ? 'text-fg-primary'
                    : 'text-fg-tertiary hover:text-fg-secondary'
                }`}
              >
                <t.Icon size={14} strokeWidth={1.75} />
                {t.label}
                <TabBadge tabKey={t.key} trade={trade} />
                {active && (
                  <span className="absolute bottom-[-1px] left-2 right-2 h-[2px] rounded-t bg-gold" />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 overflow-auto p-4">
          {tab === 'overview' && (
            <OverviewTab
              trade={trade}
              onSavePlaybook={onSavePlaybook}
              onSaveTimeframe={onSaveTimeframe}
              onSaveConfidence={onSaveConfidence}
              onSavePlannedRisk={onSavePlannedRisk}
              onSavePlannedStopLoss={onSavePlannedStopLoss}
              onSaveFloat={onSaveFloat}
              onSaveCatalyst={onSaveCatalyst}
              onSaveCountry={onSaveCountry}
              onSaveCountrySymbol={onSaveCountrySymbol}
            />
          )}
          {tab === 'notes' && (
            <NoteEditor
              tradeId={trade.id}
              note={trade.note}
              onSave={onSaveNote}
            />
          )}
          {tab === 'attachments' && <AttachmentManager tradeId={trade.id} />}
          {tab === 'mistakes' && (
            <MistakesTab trade={trade} onSaveMistakes={onSaveMistakes} />
          )}
          {tab === 'chart' && (
            <Suspense fallback={<ChartTabSkeleton />}>
              {/* key={trade.id} guarantees a full remount when the user
                  switches to a different trade — no stale chart instance,
                  no stale markers, no leftover refs. */}
              <ChartTab key={trade.id} trade={trade} />
            </Suspense>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ModalHeader({ trade, onClose }: { trade: TradeListRow; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <h2 id="trade-detail-title" className="font-mono text-2xl font-semibold tracking-tight text-fg-primary">
            {trade.symbol}
          </h2>
          <span
            className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              trade.side === 'short' ? 'bg-loss-soft text-loss' : 'bg-win-soft text-win'
            }`}
          >
            {trade.side}
          </span>
          {trade.playbook_name && (
            <span className="rounded-sm bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium text-gold">
              {trade.playbook_name}
            </span>
          )}
        </div>
        <div className="mt-1 text-xs text-fg-tertiary tnum">
          {longDate(trade.date)} · {trade.executions.length} fill
          {trade.executions.length === 1 ? '' : 's'} ·{' '}
          {int(trade.shares_bought)} sh bought · {int(trade.shares_sold)} sh sold
        </div>
      </div>
      <div className="flex shrink-0 items-baseline gap-4">
        {/* Gross / Fees / Net trio — v0.1.5. Net stays largest to keep the
            modal's bottom-line affordance dominant; Gross and Fees sit
            beside it as smaller secondary stats so the trader can see
            the cost drag at a glance. Fees uses fg-secondary when 0 so
            zero-fee trades de-emphasize visually. */}
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Gross
          </div>
          <div className={`font-mono text-sm font-semibold tnum ${pnlClass(trade.gross_pnl)}`}>
            {signed(trade.gross_pnl)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Fees
          </div>
          <div
            className={`font-mono text-sm font-semibold tnum ${trade.total_fees > 0 ? 'text-fg-primary' : 'text-fg-secondary'}`}
          >
            {money(trade.total_fees)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            Net P&amp;L
          </div>
          <div className={`font-mono text-2xl font-semibold tnum ${pnlClass(trade.net_pnl)}`}>
            {signed(trade.net_pnl)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

function TabBadge({ tabKey, trade }: { tabKey: TabKey; trade: TradeListRow }) {
  let n = 0
  if (tabKey === 'notes') n = trade.note?.text?.trim() ? 1 : 0
  else if (tabKey === 'attachments') n = trade.attachment_count
  else if (tabKey === 'mistakes') n = trade.mistakes.length
  if (n <= 0) return null
  return (
    <span className="rounded-full bg-gold/15 px-1.5 font-mono text-[10px] font-semibold text-gold tnum">
      {n}
    </span>
  )
}

// ── Overview tab — playbook, timeframe, confidence, planned risk, EMA9, fills ──

interface OverviewTabProps {
  trade: TradeListRow
  onSavePlaybook: (input: SetPlaybookOnTradeInput) => Promise<void>
  onSaveTimeframe: (input: UpdateTimeframeInput) => Promise<void>
  onSaveConfidence: (input: UpdateConfidenceInput) => Promise<void>
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
  /** Bulk per-symbol manual override (optional — both modal hosts provide it). */
  onSaveCountrySymbol?: (input: UpdateCountryForSymbolInput) => Promise<void>
}

function OverviewTab({
  trade,
  onSavePlaybook,
  onSaveTimeframe,
  onSaveConfidence,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
  onSaveCountrySymbol,
}: OverviewTabProps) {
  const t = trade
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <FieldRow label="Playbook">
          <PlaybookPicker
            value={t.playbook_id}
            valueLabel={t.playbook_name}
            onChange={(next) =>
              onSavePlaybook({ trade_id: t.id, playbook_id: next })
            }
          />
        </FieldRow>
        <FieldRow label="Timeframe">
          <TimeframePicker
            value={t.entry_timeframe}
            onChange={(next: EntryTimeframe | null) =>
              onSaveTimeframe({ trade_id: t.id, timeframe: next })
            }
          />
        </FieldRow>
        <FieldRow label="Confidence">
          <ConfidencePicker
            value={t.confidence}
            onChange={(next) =>
              onSaveConfidence({ trade_id: t.id, confidence: next })
            }
          />
        </FieldRow>
        <FieldRow label="Planned stop loss price">
          <PlannedRiskEditor
            plannedStopLossPrice={t.planned_stop_loss_price}
            entryPrice={t.side === 'short' ? t.avg_sell_price : t.avg_buy_price}
            shares={Math.max(t.shares_bought, t.shares_sold)}
            riskPerShare={t.risk_per_share}
            totalRisk={t.total_risk}
            rMultiple={t.r_multiple}
            onChange={(next) =>
              onSavePlannedStopLoss({ trade_id: t.id, planned_stop_loss_price: next })
            }
          />
        </FieldRow>
        <FieldRow label="Shares Out">
          <FloatEditor
            value={t.float_shares}
            onChange={(next) =>
              onSaveFloat({ trade_id: t.id, float_shares: next })
            }
          />
        </FieldRow>
        <FieldRow label="Country">
          <CountryEditor
            country={t.country}
            countryName={t.country_name}
            region={t.region}
            source={t.country_source}
            onChange={(next) =>
              onSaveCountry({ trade_id: t.id, country: next, source: 'manual' })
            }
            symbol={t.symbol}
            onApplyToSymbol={
              onSaveCountrySymbol
                ? (next) => onSaveCountrySymbol({ symbol: t.symbol, country: next })
                : undefined
            }
          />
        </FieldRow>
        <FieldRow label="Entry vs 9EMA (1m)">
          <Ema9Readout pct={t.entry_ema9_distance_pct} />
        </FieldRow>
      </div>

      {/* Catalyst — separate card per the spec. Both fields save atomically
          via TRADE_CATALYST_SAVE so type + days_since stay coherent. */}
      <div className="rounded-lg border border-border-subtle bg-bg-2 p-4">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Catalyst
        </div>
        <CatalystEditor
          catalystType={t.catalyst_type}
          daysSince={t.days_since_catalyst}
          onChange={(catalystType, daysSince) =>
            onSaveCatalyst({
              trade_id: t.id,
              catalyst_type: catalystType,
              days_since_catalyst: daysSince,
            })
          }
        />
      </div>

      {/* P&L mini-grid — gross, fees, net at a glance */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gross P&L" value={signed(t.gross_pnl)} tone={pnlClass(t.gross_pnl)} />
        <Stat label="Fees"      value={money(t.total_fees)}  tone="text-loss" />
        <Stat label="Net P&L"   value={signed(t.net_pnl)}    tone={pnlClass(t.net_pnl)} />
      </div>

      <ExecutionList trade={t} />
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-3">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      {children}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg font-semibold tnum ${tone}`}>{value}</div>
    </div>
  )
}

function Ema9Readout({ pct }: { pct: number | null }) {
  if (pct == null) {
    return (
      <span
        className="font-mono text-sm text-fg-muted"
        title="Pending intraday data — open Settings → Refresh intraday."
      >
        —
      </span>
    )
  }
  const abs = Math.abs(pct)
  const tone = abs > 5 ? 'text-loss' : abs > 3 ? 'text-gold' : 'text-win'
  return (
    <span
      className={`inline-flex items-center gap-2 font-mono text-sm font-semibold tnum ${tone}`}
      title="Entry distance from 9EMA over 1-minute bars"
    >
      {pct >= 0 ? '+' : ''}
      {pct.toFixed(2)}%
      {abs > 5 && (
        <span className="rounded-sm bg-loss-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-loss">
          extended
        </span>
      )}
    </span>
  )
}

function ExecutionList({ trade }: { trade: TradeListRow }) {
  if (trade.executions.length === 0) return null
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-3">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {trade.executions.length} fill{trade.executions.length === 1 ? '' : 's'}
      </div>
      <div className="grid grid-cols-[90px_50px_80px_90px_1fr] gap-x-4 gap-y-1.5 font-mono text-xs">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Time
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Side
        </div>
        <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Shares
        </div>
        <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Price
        </div>
        <div className="text-right text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Gross value
        </div>
        {trade.executions.map((e, i) => (
          <div key={`${e.trade_id}-${e.order_id}-${i}`} className="contents">
            <div className="text-fg-tertiary tnum">{formatEastern(e.time)}</div>
            <div className={e.side === 'B' ? 'text-win' : 'text-loss'}>{e.side}</div>
            <div className="text-right text-fg-primary tnum">{int(e.qty)}</div>
            <div className="text-right text-fg-secondary tnum">{price(e.price)}</div>
            <div className="text-right text-fg-tertiary tnum">{money(e.qty * e.price)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mistakes tab — local state + save button ──

function MistakesTab({
  trade,
  onSaveMistakes,
}: {
  trade: TradeListRow
  onSaveMistakes: (input: UpdateMistakesInput) => Promise<void>
}) {
  const [selected, setSelected] = useState<string[]>(trade.mistakes)
  const [saving, setSaving] = useState(false)
  // Transient "saved" confirmation — mirrors the Playbook editor's savedAt
  // pill so the user gets visible feedback that the save landed.
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const dirty = !sameArray(selected, trade.mistakes)

  useEffect(() => {
    setSelected(trade.mistakes)
    setSavedAt(null)
  }, [trade.id])

  // Auto-clear the confirmation after 1.5s so it reads as a transient pill.
  useEffect(() => {
    if (savedAt == null) return
    const t = setTimeout(() => setSavedAt(null), 1500)
    return () => clearTimeout(t)
  }, [savedAt])

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSaveMistakes({ trade_id: trade.id, mistakes: selected })
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Mistakes
        </div>
        <p className="mt-1 text-sm text-fg-secondary">
          Tag what went wrong — these roll up in Analytics → Psychology.
        </p>
      </div>
      <MistakesChecklist selected={selected} onChange={setSelected} />
      <div className="flex items-center justify-end gap-3">
        {savedAt && (
          <span className="text-[10px] uppercase tracking-wider text-win">
            saved
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          style={dirty && !saving ? { color: '#92400e' } : undefined}
          className="inline-flex h-8 cursor-pointer items-center rounded-md bg-gold px-4 text-xs font-semibold text-accent-ink transition-colors duration-150 ease-out-soft hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save mistakes'}
        </button>
      </div>
    </div>
  )
}

function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((x) => setB.has(x))
}

// Suspense fallback while the chart bundle (~110 KB) downloads on first
// Chart-tab open. After first open the chunk is cached by the browser.
function ChartTabSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border-subtle bg-bg-2 py-12 text-center">
      <Loader2 size={24} strokeWidth={1.75} className="mb-3 animate-spin text-gold/70" />
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        Loading chart…
      </div>
      <div className="mt-1 text-sm text-fg-tertiary">
        Fetching the chart library and intraday bars.
      </div>
    </div>
  )
}
