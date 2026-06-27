import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, BookOpen, Image, NotebookPen, Loader2, Minimize2, Layers, TrendingUp, TrendingDown, Activity, Globe, Zap, LineChart, Pencil, type LucideIcon } from 'lucide-react'
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
import { money, price, int, signed, pnlClass, signedPct, rvolLabel, compactShares, catalystLabel, longDate, formatEastern, duration } from '@/lib/format'
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
import { blendedFillAvg, computeExecutionStats } from '@/core/trades/executionStats'

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

type TabKey = 'overview' | 'journal' | 'attachments'

const TABS: { key: TabKey; label: string; Icon: typeof BookOpen }[] = [
  { key: 'overview',    label: 'Overview',    Icon: BookOpen },
  { key: 'journal',     label: 'Journal',     Icon: NotebookPen },
  { key: 'attachments', label: 'Attachments', Icon: Image },
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
          {tab === 'journal' && (
            <NoteEditor
              tradeId={trade.id}
              note={trade.note}
              onSave={onSaveNote}
            />
          )}
          {tab === 'attachments' && <AttachmentManager tradeId={trade.id} />}
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
  if (tabKey === 'journal') n = trade.note?.text?.trim() ? 1 : 0
  else if (tabKey === 'attachments') n = trade.attachment_count
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
    <div className={isFullscreen ? '' : 'space-y-5'}>
      {/* Beat 2 — two-column shell. The Overview body splits into a LEFT column
          (setup fields + Trader DNA) and a RIGHT analysis column (confluence /
          P&L / fee / mistakes); the chart+fills row drops below it, full-width.
          Fullscreen-gated exactly like that chart row — the grid classes collapse
          to '' so nothing two-columns, and each child still hides via its own
          isFullscreen gate, so fullscreen stays chart-only. Mirrors the chart
          row's xl: breakpoint and 460px right column so the columns line up. */}
      <div className={isFullscreen ? '' : 'grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start'}>
        {/* LEFT column — setup fields + Trader DNA */}
        <div className={isFullscreen ? '' : 'space-y-5'}>
          {/* Setup tile (Beat 3) — its own full-width row so it can grow with long
              playbook names + many confluence tags without squeezing the params.
              Premium <Card> chrome (card-premium + a subtle card-glow-gold), matching
              the param tiles / Execution / Trader DNA; the Card title band supplies
              the "Setup" label, and it holds the Playbook picker + the embedded
              (null-gated) Confluence beneath. */}
          <Card title="Setup" className={`card-glow-gold ${isFullscreen ? 'hidden' : ''}`}>
            <PlaybookPicker
              value={t.playbook_id}
              valueLabel={t.playbook_name}
              tier={t.playbook_tier}
              onChange={(next) =>
                onSavePlaybook({ trade_id: t.id, playbook_id: next })
              }
            />
            <ConfluenceTags trade={t} embedded />
          </Card>

          {/* Param row — Timeframe / Confidence / Stop price. Three FieldRow tiles,
              three-across at sm+ (each ~290px at full left-column width — comfortable
              per the param recon: control floors ~132/144/130px), stacked
              single-column on narrow. Own fullscreen-hidden gate. */}
          <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${isFullscreen ? 'hidden' : ''}`}>
            <Card title="Timeframe" className="card-glow-gold">
              <TimeframePicker
                value={t.entry_timeframe}
                onChange={(next: EntryTimeframe | null) =>
                  onSaveTimeframe({ trade_id: t.id, timeframe: next })
                }
              />
            </Card>
            <Card title="Confidence" className="card-glow-gold">
              <ConfidencePicker
                value={t.confidence}
                onChange={(next) =>
                  onSaveConfidence({ trade_id: t.id, confidence: next })
                }
              />
            </Card>
            <Card title="Stop price" className="card-glow-gold">
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
            </Card>
          </div>

          {/* Trader DNA — the stock-character + entry-context block (beats A2a/A2b).
              A premium <Card> of six tiles: Float / Daily% / RVOL (the setup's
              character), Country / Catalyst (the why), Entry-vs-9EMA (the entry
              quality). Float + Catalyst are display-first (beat A2b): a clean value
              at rest that reveals the existing editor on click / pencil. */}
          <Card title="Trader DNA" className={isFullscreen ? 'hidden' : ''}>
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
        </div>

        {/* RIGHT column — P&L / fee / mistakes analysis. (Confluence moved into
            the Setup card in the left column, Beat 3.) */}
        <div className={isFullscreen ? '' : 'space-y-5'}>
          {/* Beat 4 — Execution panel: the NEW execution-quality readouts (hold,
              bookend fills, avg prices, price move). Replaces the old
              P&L mini-grid + commission line, which only duplicated the header's
              Gross / Fees / Net / R. Hidden in chart-only fullscreen like the
              rest of the right column. */}
          <ExecutionPanel trade={t} isFullscreen={isFullscreen} />

          {/* Mistakes — folded in from the former Mistakes tab (Beat 1 / A5). The
              self-contained two-axis picker (Technical / Psychological), placed as a
              "what went wrong" review section at the bottom of the single-column
              Overview. Matches the Confluence band's bare-section treatment (the
              picker carries its own header). Hidden in chart-only fullscreen like the
              other non-chart sections; Beat 2's two-column shell relocates it to the
              right column. */}
          <Card title="Mistakes" subtitle="Tag what went wrong — these roll up in Analytics → Psychology." className={isFullscreen ? 'hidden' : ''}>
            <TradeMistakePicker trade={t} />
          </Card>
        </div>
      </div>

      {/* Beat A3a — Trade Chart (left) + Fills (right): the two-column heart of
          the Overview. The chart is mount-on-visible (LazyVisible + Suspense) so
          a trade opens INSTANTLY with no chart-library load — the ~110 KB
          lightweight-charts bundle + intraday fetch fire only once the chart
          scrolls into view. Fills move up from the bottom into the right column
          beside the chart.

          Beat A3b — fullscreen shows ONLY the chart: in fullscreen this row drops
          its two-column grid (the chart fills the width) and every non-chart
          section below hides via isFullscreen, while the chart's LazyVisible /
          Suspense / ChartTab subtree stays mounted in its EXACT tree position —
          so toggling fullscreen never remounts the chart (no re-fetch of bars, no
          lost zoom/visible-range). Only sibling and wrapper classNames branch. */}
      <div className={isFullscreen ? '' : 'grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-start'}>
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
        {/* Fills — hidden (not unmounted) in chart-only fullscreen. */}
        <div className={isFullscreen ? 'hidden' : ''}>
          <ExecutionList trade={t} />
        </div>
      </div>
    </div>
  )
}

// Beat 4 — one Execution-panel readout cell: label over a mono value, with an
// optional muted sub-line (the bookend fills' timestamp under their price). Tile
// chrome matches DnaTile so the Execution card reads as a sibling of the Trader
// DNA card. tone defaults to neutral; Price Move passes pnlClass.
function ExecStat({
  label,
  value,
  sub,
  tone = 'text-fg-primary',
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-1/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className={`mt-1 font-mono text-sm font-semibold tnum ${tone}`}>{value}</div>
      {sub != null && (
        <div className="mt-0.5 font-mono text-[11px] text-fg-tertiary tnum">{sub}</div>
      )}
    </div>
  )
}

// Beat 4 — the Execution panel: execution-quality readouts that do NOT duplicate
// the header (Gross/Fees/Net/R). Hold time is the trivial inline (close-open);
// the bookend fills + direction-aware price move come from the pure
// computeExecutionStats helper. Every absent value renders as an em-dash
// (no-fabricated-data law): duration() em-dashes a null hold, and the helper
// nulls the bookends / price move on open trades.
function ExecutionPanel({
  trade: t,
  isFullscreen,
}: {
  trade: TradeListRow
  isFullscreen: boolean
}) {
  const exec = computeExecutionStats(t)
  const holdSec =
    !t.is_open && t.close_time
      ? (Date.parse(t.close_time) - Date.parse(t.open_time)) / 1000
      : null

  return (
    <Card title="Execution" className={isFullscreen ? 'hidden' : ''}>
      <div className="grid grid-cols-3 gap-3">
        <ExecStat label="Hold Time" value={duration(holdSec)} />
        <ExecStat
          label="First Entry"
          value={exec.firstEntry ? price(exec.firstEntry.price) : '—'}
          sub={exec.firstEntry ? formatEastern(exec.firstEntry.time) : undefined}
        />
        <ExecStat
          label="Last Exit"
          value={exec.lastExit ? price(exec.lastExit.price) : '—'}
          sub={exec.lastExit ? formatEastern(exec.lastExit.time) : undefined}
        />
        <ExecStat label="Avg Entry" value={exec.avgEntry == null ? '—' : price(exec.avgEntry)} />
        <ExecStat label="Avg Exit" value={exec.avgExit == null ? '—' : price(exec.avgExit)} />
        <ExecStat
          label="Price Move"
          value={exec.priceMovePct == null ? '—' : signedPct(exec.priceMovePct)}
          tone={exec.priceMovePct == null ? 'text-fg-tertiary' : pnlClass(exec.priceMovePct)}
        />
      </div>
    </Card>
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
  const avg = blendedFillAvg(trade.executions)
  // xl:h-[440px] pins the card to the chart's height so it stretches up on short
  // trades and caps + scrolls on tall ones (the rows region is flex-1 below). 440 =
  // ChartTab chartHeight (400px canvas) + ~40px toolbar/gap = the chart column's
  // LazyVisible min-h-[440px] (grid sibling at the chart+fills row). Keep in sync.
  return (
    <div className="card-premium flex flex-col p-3 xl:h-[440px]">
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {trade.executions.length} fill{trade.executions.length === 1 ? '' : 's'}
      </div>
      {/* Beat 6 — vertical timeline of fills (earliest first, top-to-bottom). Each
          fill: a colored dot (buy → win green, sell → loss red) on a COLOR-SEGMENTED
          spine — the connector below a dot is colored by the NEXT (lower) dot's side,
          so the segment leading into a sell reads red and buy→buy reads green; dots
          sit on top (z-10). Two-line detail beside it. The rows region is flex-1 within
          the card's xl:h-[440px] bound, so it grows to fill (short trades) and scrolls
          (tall trades); the "{n} fills" title above and AVG PRICE footer below stay fixed. */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="flex flex-col">
          {trade.executions.map((e, i) => {
            const isBuy = e.side === 'B'
            const next = trade.executions[i + 1]
            return (
              <div key={`${e.trade_id}-${e.order_id}-${i}`} className="flex gap-3">
                {/* segmented spine: dot (on top) + connector colored by the NEXT dot */}
                <div className="flex w-2.5 shrink-0 flex-col items-center">
                  <span
                    className={`z-10 h-2 w-2 shrink-0 rounded-full ${isBuy ? 'bg-win' : 'bg-loss'}`}
                    aria-hidden="true"
                  />
                  {next && (
                    <span
                      className={`w-0.5 grow ${next.side === 'B' ? 'bg-win' : 'bg-loss'}`}
                      aria-hidden="true"
                    />
                  )}
                </div>
                {/* fill detail — two lines, gross value centered against the block */}
                <div
                  className={`flex min-w-0 flex-1 items-center justify-between gap-3 ${next ? 'pb-3' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm text-fg-primary tnum">
                        {formatEastern(e.time)}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${isBuy ? 'bg-win/15 text-win' : 'bg-loss/15 text-loss'}`}
                      >
                        {e.side}
                      </span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-fg-tertiary tnum">
                      {int(e.qty)} shares @ {price(e.price)}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-fg-secondary tnum">
                    {money(e.qty * e.price)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {/* AVG PRICE — the fills' OWN blended VWAP across ALL fills
          (sum(qty·price) / sum(qty)); a single number, distinct from the
          Execution panel's per-side Avg Entry / Avg Exit. */}
      <div className="mt-2 flex items-center justify-between border-t border-border-subtle pt-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Avg Price
        </span>
        <span className="font-mono text-xs font-semibold text-fg-primary tnum">
          {avg == null ? '—' : price(avg)}
        </span>
      </div>
    </div>
  )
}

// Suspense fallback while the chart bundle (~110 KB) downloads on first reveal
// of the Overview's embedded chart. After first load the chunk is browser-cached.
function ChartTabSkeleton() {
  return (
    <Card
      title="Chart"
      padded={false}
      right={<div className="skeleton h-7 w-56 rounded-md" aria-hidden="true" />}
    >
      <div className="flex min-h-[400px] flex-col items-center justify-center py-12 text-center">
        <Loader2 size={24} strokeWidth={1.75} className="mb-3 animate-spin text-gold/70" />
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Loading chart…
        </div>
        <div className="mt-1 text-sm text-fg-tertiary">
          Fetching the chart library and intraday bars.
        </div>
      </div>
    </Card>
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
