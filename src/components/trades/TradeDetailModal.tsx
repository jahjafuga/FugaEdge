import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, Image, NotebookPen, AlertTriangle, BarChart3, Loader2, Minimize2, Layers, TrendingUp, TrendingDown, Activity, Globe, Zap, LineChart, Pencil, type LucideIcon } from 'lucide-react'
import type {
  EntryTimeframe,
  TradeListRow,
  UpdateCatalystInput,
  UpdateConfidenceInput,
  UpdateCountryInput,
  UpdateCountryForSymbolInput,
  UpdateFloatInput,
  UpdateNoteInput,
  UpdatePlannedRiskInput,
  UpdatePlannedStopLossInput,
  UpdateTimeframeInput,
} from '@shared/trades-types'
import type { SetPlaybookOnTradeInput } from '@shared/playbook-types'
import { money, price, int, signed, pnlClass, signedPct, rvolLabel, compactShares, catalystLabel, longDate, formatEastern } from '@/lib/format'
import PlaybookPicker from '@/components/playbook/PlaybookPicker'
import TimeframePicker from './TimeframePicker'
import ConfidencePicker from './ConfidencePicker'
import PlannedRiskEditor from './PlannedRiskEditor'
import FloatEditor from './FloatEditor'
import CountryEditor from './CountryEditor'
import CatalystEditor from './CatalystEditor'
import NoteEditor from './NoteEditor'
import AttachmentManager from './AttachmentManager'
import TradeMistakePicker from './TradeMistakePicker'
import ConfluenceTags from './ConfluenceTags'
import TradeLifecycleFooter from './TradeLifecycleFooter'
import RChip from './RChip'
import Card from '@/components/ui/Card'

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
  onSavePlannedRisk: (input: UpdatePlannedRiskInput) => Promise<void>
  onSavePlannedStopLoss: (input: UpdatePlannedStopLossInput) => Promise<void>
  onSaveFloat: (input: UpdateFloatInput) => Promise<void>
  onSaveCatalyst: (input: UpdateCatalystInput) => Promise<void>
  onSaveCountry: (input: UpdateCountryInput) => Promise<void>
  /** Bulk per-symbol manual override (optional — both modal hosts provide it). */
  onSaveCountrySymbol?: (input: UpdateCountryForSymbolInput) => Promise<void>
  /** v0.2.3 soft-delete lifecycle. When provided, the modal shows a footer
   *  action: "Move to Trash" (live trades) or "Restore" (deleted trades).
   *  Hosts that omit both render no footer (e.g. the calendar/review hosts). */
  onSoftDelete?: (trade_id: number) => Promise<void>
  onRestore?: (trade_id: number) => Promise<void>
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
  onSavePlannedRisk,
  onSavePlannedStopLoss,
  onSaveFloat,
  onSaveCatalyst,
  onSaveCountry,
  onSaveCountrySymbol,
  onSoftDelete,
  onRestore,
  stacked = false,
}: TradeDetailModalProps) {
  const [tab, setTab] = useState<TabKey>('overview')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!trade) return
    setTab('overview')
  }, [trade?.id])

  // Fullscreen is a per-open view mode — reset it whenever the modal has no
  // trade (closed). Every close path (X, backdrop, Escape) clears `trade`, so
  // this covers them all; the modal always reopens at normal size.
  useEffect(() => {
    if (!trade) setIsFullscreen(false)
  }, [trade])

  useEffect(() => {
    if (!trade) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        // In fullscreen, Escape exits fullscreen first instead of closing.
        if (isFullscreen) setIsFullscreen(false)
        else onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [trade, onClose, isFullscreen])

  if (!trade) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-detail-title"
      className={`fixed inset-0 ${stacked ? 'z-[210]' : 'z-[60]'} flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-6'}`}
    >
      <div
        className={`absolute inset-0 bg-bg-0/72 backdrop-blur-[4px] ${isFullscreen ? 'hidden' : ''}`}
        onClick={onClose}
      />
      <div
        className={`relative flex w-full flex-col bg-bg-3 animate-modal-in ${
          isFullscreen
            ? 'h-full'
            : 'max-h-[92vh] max-w-[1400px] rounded-lg border border-border shadow-lg'
        }`}
      >
        {!isFullscreen && <ModalHeader trade={trade} onClose={onClose} />}
        <div className={`flex items-center gap-0 border-b border-border-subtle px-3 ${isFullscreen ? 'hidden' : ''}`}>
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
        {/* Slim fullscreen bar — rendered ONLY in fullscreen, as a sibling
            ABOVE the body (the `&&` leaves a null placeholder otherwise, so the
            body keeps its child index and ChartTab never remounts). Carries the
            context the hidden header would show + the visible exit. */}
        {isFullscreen && (
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-3 px-4 py-2">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-base font-semibold tracking-tight text-fg-primary">
                {trade.symbol}
              </span>
              <span
                className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  trade.side === 'short' ? 'bg-loss-soft text-loss' : 'bg-win-soft text-win'
                }`}
              >
                {trade.side}
              </span>
              <span className={`font-mono text-sm font-semibold tnum ${pnlClass(trade.net_pnl)}`}>
                {signed(trade.net_pnl)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              aria-label="Exit fullscreen"
              title="Exit fullscreen"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md border border-border-subtle bg-bg-2 text-fg-tertiary transition-colors duration-150 hover:border-border hover:text-fg-primary"
            >
              <Minimize2 size={15} strokeWidth={2} />
            </button>
          </div>
        )}
        <div className={`flex-1 ${isFullscreen ? '' : 'overflow-auto p-4'}`}>
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
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen((v) => !v)}
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
            <MistakesTab trade={trade} />
          )}
          {tab === 'chart' && (
            <Suspense fallback={<ChartTabSkeleton />}>
              {/* key={trade.id} guarantees a full remount when the user
                  switches to a different trade — no stale chart instance,
                  no stale markers, no leftover refs. */}
              <ChartTab
                key={trade.id}
                trade={trade}
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen((v) => !v)}
              />
            </Suspense>
          )}
        </div>
        {(onSoftDelete || onRestore) && !isFullscreen && (
          <TradeLifecycleFooter
            trade={trade}
            onSoftDelete={onSoftDelete}
            onRestore={onRestore}
          />
        )}
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
          <div className="mt-1 flex justify-end">
            <RChip r={trade.r_multiple} />
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
  /** Fullscreen flag + toggle, owned by the modal. A3a drills them through to
   *  the embedded chart so its toolbar fullscreen button keeps working as today
   *  (A3b re-scopes fullscreen to just the chart region). */
  isFullscreen: boolean
  onToggleFullscreen: () => void
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
  isFullscreen,
  onToggleFullscreen,
}: OverviewTabProps) {
  const t = trade
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
            onChange={(next) =>
              onSavePlannedStopLoss({ trade_id: t.id, planned_stop_loss_price: next })
            }
          />
        </FieldRow>
      </div>

      {/* Trader DNA — the stock-character + entry-context block (beats A2a/A2b).
          A premium <Card> of six tiles: Float / Daily% / RVOL (the setup's
          character), Country / Catalyst (the why), Entry-vs-9EMA (the entry
          quality). Float + Catalyst are display-first (beat A2b): a clean value
          at rest that reveals the existing editor on click / pencil. */}
      <Card title="Trader DNA">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <DnaTile icon={Layers} label="Float">
            <FloatField
              value={t.float_shares}
              onChange={(next) => onSaveFloat({ trade_id: t.id, float_shares: next })}
            />
          </DnaTile>

          <DnaTile
            icon={t.daily_change_pct != null && t.daily_change_pct < 0 ? TrendingDown : TrendingUp}
            label="Daily %"
            tone={
              t.daily_change_pct == null
                ? 'muted'
                : t.daily_change_pct < 0
                  ? 'loss'
                  : 'win'
            }
          >
            <span
              className={`font-mono text-lg font-semibold tnum ${
                t.daily_change_pct == null ? 'text-fg-tertiary' : pnlClass(t.daily_change_pct)
              }`}
            >
              {t.daily_change_pct == null ? '—' : signedPct(t.daily_change_pct, 2)}
            </span>
          </DnaTile>

          <DnaTile icon={Activity} label="RVOL" tone="violet">
            <span
              className={`font-mono text-lg font-semibold tnum ${
                t.rvol == null ? 'text-fg-tertiary' : 'text-violet'
              }`}
            >
              {rvolLabel(t.rvol)}
            </span>
          </DnaTile>

          <DnaTile icon={Globe} label="Country">
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
          </DnaTile>

          <DnaTile icon={Zap} label="Catalyst">
            <CatalystField
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
          </DnaTile>

          <DnaTile icon={LineChart} label="Entry vs 9EMA">
            <Ema9Readout pct={t.entry_ema9_distance_pct} />
          </DnaTile>
        </div>
      </Card>

      {/* Beat A3a — Trade Chart (left) + Fills (right): the two-column heart of
          the Overview. The chart is mount-on-visible (LazyVisible + Suspense) so
          a trade opens INSTANTLY with no chart-library load — the ~110 KB
          lightweight-charts bundle + intraday fetch fire only once the chart
          scrolls into view. ChartTab keeps its existing fullscreen wiring for
          now; A3b re-scopes fullscreen to the chart region. Fills move up from
          the bottom into the right column beside the chart. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start">
        <LazyVisible className="min-h-[440px]" placeholder={<ChartTabSkeleton />}>
          <Suspense fallback={<ChartTabSkeleton />}>
            {/* key={t.id} → full remount on trade swap (no stale chart instance).
                Same fullscreen props as the Chart tab — A3b re-scopes them. */}
            <ChartTab
              key={t.id}
              trade={t}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
            />
          </Suspense>
        </LazyVisible>
        <ExecutionList trade={t} />
      </div>

      {/* Beat 3 — secondary confluence tags. Hidden when the primary is
          "No Setup" (Invariant 2). Sits below Catalyst, above the P&L grid. */}
      <ConfluenceTags trade={t} />

      {/* P&L mini-grid — gross, fees, net at a glance */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Gross P&L" value={signed(t.gross_pnl)} tone={pnlClass(t.gross_pnl)} />
        <Stat label="Fees"      value={money(t.total_fees)}  tone="text-loss" />
        <Stat label="Net P&L"   value={signed(t.net_pnl)}    tone={pnlClass(t.net_pnl)} />
      </div>
      {/* Fee breakdown — shown ONLY when the broker reported a separate
          commission (Ocean One's Comm). NULL (DAS/Webull) shows no split —
          mirrors the `shares_outstanding == null ? '—'` honest-absence idiom
          above; never a fabricated $0. Commission is a SLICE of total_fees, so
          Other fees = the remainder; both via money(). */}
      {t.commission != null && (
        <div className="text-[11px] text-fg-tertiary">
          Commission {money(t.commission)} · Other fees {money(t.total_fees - t.commission)}
        </div>
      )}
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

// Beat A2a — a premium Trader-DNA tile: a tinted icon square + uppercase label
// over the value (Float and Catalyst became display-first in A2b — a clean
// value at rest that reveals the existing editor). The tone drives the icon
// square only — values carry their own tone. Quiet gold by default; RVOL is
// the lone violet accent, Daily% is sign-toned.
const DNA_TONE = {
  gold: 'bg-gold/[0.10] text-gold',
  violet: 'bg-accent-violet/[0.12] text-accent-violet',
  win: 'bg-win/[0.10] text-win',
  loss: 'bg-loss/[0.10] text-loss',
  muted: 'bg-bg-1 text-fg-tertiary',
} as const

function DnaTile({
  icon: Icon,
  label,
  tone = 'gold',
  className = '',
  children,
}: {
  icon: LucideIcon
  label: string
  tone?: keyof typeof DNA_TONE
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border border-border-subtle bg-bg-1/40 p-3 ${className}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${DNA_TONE[tone]}`}
        >
          <Icon size={14} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          {label}
        </span>
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

// Beat A2b — Float as display-first: the compact share count at rest (e.g.
// "1.90M"), click to reveal the existing FloatEditor focused; blur or Enter
// saves via FloatEditor's own commit path, Escape reverts — all three resolve
// to a blur, which collapses back to display. A null float shows the
// "unavailable" note but stays clickable so the user can still set one. The
// wrapper only toggles visibility and drives focus; FloatEditor's save logic is
// untouched.
function FloatField({
  value,
  onChange,
}: {
  value: number | null
  onChange: (next: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // FloatEditor has no autoFocus of its own, so the wrapper focuses (and
  // selects) the freshly-revealed input for immediate typing.
  useEffect(() => {
    if (!editing) return
    const input = wrapRef.current?.querySelector<HTMLInputElement>('input')
    input?.focus()
    input?.select()
  }, [editing])

  if (editing) {
    // A bubbled blur (focusout) collapses back to display. FloatEditor's own
    // onBlur (commit) runs first in the target phase, so the save fires before
    // this collapse; Enter and Escape both resolve to a blur.
    return (
      <div ref={wrapRef} onBlur={() => setEditing(false)}>
        <FloatEditor value={value} onChange={onChange} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="Edit float"
      className="group inline-flex cursor-pointer items-center text-left"
    >
      {value == null ? (
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 group-hover:text-gold">
          Unavailable — FMP returned no float
        </span>
      ) : (
        <span className="font-mono text-lg font-semibold tnum text-fg-primary transition-colors duration-150 group-hover:text-gold">
          {compactShares(value)}
        </span>
      )}
    </button>
  )
}

// Beat A2b — Catalyst as display-first: the formatted phrase at rest (e.g.
// "Offering / 3 days old"), a pencil (CountryEditor's idiom) reveals the
// existing CatalystEditor. Collapse on click-away or "Done" — NOT on blur,
// because the native <select> doesn't blur cleanly (recon-flagged). The
// click-away listener binds 'click' (not 'mousedown') so the days field's
// onBlur -> commitDays save lands before the editor unmounts. CatalystEditor's
// save logic — including its render-phase draft-resync guard — is untouched:
// the reveal mounts a fresh editor seeded from the current props, so the guard
// idles (draft already matches) instead of fighting the toggle.
function CatalystField({
  catalystType,
  daysSince,
  onChange,
}: {
  catalystType: string | null
  daysSince: number | null
  onChange: (catalystType: string | null, daysSince: number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setEditing(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [editing])

  if (editing) {
    return (
      <div ref={wrapRef}>
        <CatalystEditor
          catalystType={catalystType}
          daysSince={daysSince}
          onChange={onChange}
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="mt-2 cursor-pointer text-xs text-fg-tertiary transition-colors duration-150 hover:text-gold"
        >
          Done
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={`text-sm font-semibold ${
          catalystType ? 'text-fg-primary' : 'text-fg-muted'
        }`}
      >
        {catalystLabel(catalystType, daysSince)}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Edit catalyst"
        className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border-subtle text-fg-tertiary transition-colors duration-150 hover:border-gold/60 hover:text-gold"
      >
        <Pencil size={11} strokeWidth={2} />
      </button>
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

// ── Mistakes tab — two-axis junction picker (self-persisting per tag) ──
function MistakesTab({
  trade,
}: {
  trade: TradeListRow
}) {
  return <TradeMistakePicker trade={trade} />
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

// Mount-on-visible gate (beat A3a). Renders `placeholder` until its slot
// scrolls into view, then mounts `children` and KEEPS them mounted (no unmount
// on scroll-away — the chart must not tear down mid-review). This is what keeps
// opening a trade instant: the heavy ChartTab (~110 KB lib + intraday fetch) is
// never in the initial render; the observer fires AFTER first paint, so even an
// above-the-fold chart mounts a tick later and never blocks the open. The
// IntersectionObserver intersects against the viewport THROUGH the modal body's
// overflow-auto clip, so a chart scrolled out of the body reads as not-visible.
// When IntersectionObserver is unavailable (jsdom tests / SSR) we stay on the
// placeholder rather than eager-mounting — Electron and every modern browser
// provide it, so the chart still loads in production.
function LazyVisible({
  children,
  placeholder,
  rootMargin = '0px',
  className,
}: {
  children: React.ReactNode
  placeholder: React.ReactNode
  rootMargin?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (visible) return
    if (typeof IntersectionObserver === 'undefined') return
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true)
      },
      { rootMargin },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [visible, rootMargin])
  return (
    <div ref={ref} className={className}>
      {visible ? children : placeholder}
    </div>
  )
}
