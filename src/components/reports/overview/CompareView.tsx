import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { TradeListRow } from '@shared/trades-types'
import { useAccountScope } from '@/lib/accountScope'
import { ipc } from '@/lib/ipc'
import { accountStrings } from '@/components/accounts/strings'
import MaskedMoney from '@/components/ui/MaskedMoney'
import Card from '@/components/ui/Card'
import { duration, money, perShareGainLoss, perShareGainLossIsZero, shortDate, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors, type ChartPalette } from '@/lib/chartColors'
import {
  computeHourlyComparison,
  type HourMetrics,
  type HourlyComparisonRow,
} from '@/core/performance/hourly'
import { CUMULATIVE_LINE_TYPE } from '@/core/charts/cumulativeStyle'
import { FlagSvg } from '@/components/ui/Flag'
import {
  COUNTRY_NAMES,
  REGION_REPRESENTATIVE_COUNTRY,
  type Region,
} from '@/core/country/regions'
import {
  PERIOD_PRESET_LABEL,
  computeBreakdownComparison,
  computePeriodComparison,
  daysBetween,
  rangeForPreset,
  rangeForSameMonthLastYear,
  type BreakdownDimension,
  type ComparisonInsight,
  type ComparisonResult,
  type DateRange,
  type DayPnL,
  type PeriodMetrics,
  type PeriodPreset,
} from '@/core/performance'

interface CompareViewProps {
  trades: TradeListRow[]
  sentimentByDate: Map<string, number | null>
  rangeA: DateRange
  rangeB: DateRange
  onRangeChange: (which: 'A' | 'B', range: DateRange) => void
  /** Dave #14 (A) — true when the caller narrowed `trades` with a filter.
   *  Gates the growth % row: its ledger denominator (contributed capital)
   *  is whole-account, so a filtered numerator over it must never render.
   *  Optional/absent -> false, so existing callers are byte-identical. */
  filtersActive?: boolean
}

const PRESETS: PeriodPreset[] = [
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'lastQuarter',
  'thisYear',
  'lastYear',
]

interface Shortcut {
  label: string
  a: () => DateRange
  b: () => DateRange
}

const SHORTCUTS: Shortcut[] = [
  {
    label: 'Week vs Last Week',
    a: () => rangeForPreset('thisWeek'),
    b: () => rangeForPreset('lastWeek'),
  },
  {
    label: 'Month vs Last Month',
    a: () => rangeForPreset('thisMonth'),
    b: () => rangeForPreset('lastMonth'),
  },
  {
    label: 'Month vs Same Month Last Year',
    a: () => rangeForPreset('thisMonth'),
    b: () => rangeForSameMonthLastYear(),
  },
  {
    label: 'Quarter vs Last Quarter',
    a: () => rangeForPreset('thisQuarter'),
    b: () => rangeForPreset('lastQuarter'),
  },
]

export default function CompareView({
  trades,
  sentimentByDate,
  rangeA,
  rangeB,
  onRangeChange,
  filtersActive = false,
}: CompareViewProps) {
  const comparison = useMemo<ComparisonResult>(
    () => computePeriodComparison(trades, rangeA, rangeB),
    [trades, rangeA, rangeB],
  )

  const empty = comparison.periodA.trades === 0 && comparison.periodB.trades === 0
  const eitherEmpty = comparison.periodA.trades === 0 || comparison.periodB.trades === 0

  // Picker section can be minimized while staying in compare mode. The
  // top-level "Compare periods" toggle in FilterBar is the only thing that
  // EXITS compare mode — this chevron just hides the picker UI to save
  // vertical scroll space.
  const [pickerOpen, setPickerOpen] = useState(true)

  const applyShortcut = (s: Shortcut) => {
    onRangeChange('A', s.a())
    onRangeChange('B', s.b())
  }

  return (
    <div className="space-y-4">
      {/* Period picker section — collapsible without exiting compare mode. */}
      <PickerSection
        open={pickerOpen}
        onToggle={() => setPickerOpen((v) => !v)}
        rangeA={rangeA}
        rangeB={rangeB}
        onRangeChange={onRangeChange}
        onApplyShortcut={applyShortcut}
      />

      {empty ? (
        <Card title="No trades in these periods">
          <div className="py-6 text-center text-sm text-fg-tertiary">
            No trades in this period. Pick a different range.
          </div>
        </Card>
      ) : (
        <>
          {/* Premium "verdict" stat block in Ross Cameron's review order:
              verdict headline + 70%/2:1 reference gauges, then edge core,
              consistency, execution quality, behaviour, and activity. Pure
              presentation over comparison.periodA/periodB. */}
          <VerdictBlock
            a={comparison.periodA}
            b={comparison.periodB}
            filtersActive={filtersActive}
          />

          {eitherEmpty && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-xs text-fg-secondary">
              One of the periods has zero trades — comparisons against it
              will show that period as flat zero.
            </div>
          )}

          {/* Time-of-day quad — when the edge shows up, Period A vs B (Compare
              v2 beat 2). Full-width below the verdict block; reuses the paired
              gold/teal bar grammar. */}
          <TimeOfDayQuad trades={trades} rangeA={rangeA} rangeB={rangeB} />

          {/* Cumulative overlay */}
          <Card title="Cumulative P&L — Period A vs Period B">
            <CumulativeOverlayChart comparison={comparison} />
          </Card>

          {/* R-multiple distribution — paired A-vs-B histogram (sub-phase B2) */}
          <Card title="R-multiple distribution — Period A vs Period B">
            <RDistributionComparisonChart comparison={comparison} />
          </Card>

          {/* Breakdown comparison cards — full-width single column. Each card
              is a horizontal grouped-bar chart (gold A / teal B per category)
              so long category names (playbook, catalyst) stay readable on the
              left and the $ values are legible at the bar tips. */}
          <div className="grid grid-cols-1 gap-3">
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="catalyst"
              title="By Catalyst Type"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="playbook"
              title="By Playbook"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="sentiment"
              title="By Market Sentiment"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="dow"
              title="By Day of Week"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="hour"
              title="By Hour"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="price"
              title="P&L by price"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="float"
              title="P&L by float"
              coverageNoun="float"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="rvol"
              title="P&L by RVOL"
              coverageNoun="RVOL"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="gap"
              title="P&L by gap %"
              coverageNoun="gap %"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="region"
              title="By Region"
            />
            <BreakdownComparisonCard
              trades={trades}
              rangeA={rangeA}
              rangeB={rangeB}
              sentimentByDate={sentimentByDate}
              dimension="country"
              title="By Country"
            />
          </div>

          {/* Auto-insights */}
          <ComparisonInsightsList insights={comparison.insights} />
        </>
      )}
    </div>
  )
}

// ── Period picker ────────────────────────────────────────────────────────

// ── Collapsible picker section ───────────────────────────────────────────
//
// Wraps the Period A / Period B pickers + the shortcut chips. When
// collapsed, shows a thin summary row so the user can still see WHICH
// periods are being compared without the controls eating scroll space.
// Compare mode stays active either way — exiting compare mode is the job
// of the FilterBar's top-level toggle.

function PickerSection({
  open,
  onToggle,
  rangeA,
  rangeB,
  onRangeChange,
  onApplyShortcut,
}: {
  open: boolean
  onToggle: () => void
  rangeA: DateRange
  rangeB: DateRange
  onRangeChange: (which: 'A' | 'B', range: DateRange) => void
  onApplyShortcut: (s: Shortcut) => void
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Expand period picker"
        className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border-subtle bg-bg-2 px-3.5 py-2.5 shadow-md transition-colors duration-150 hover:border-border hover:bg-bg-3"
      >
        <ChevronRight size={14} strokeWidth={2.25} className="shrink-0 text-fg-tertiary" />
        <div className="flex-1 truncate font-mono text-[11px] text-fg-secondary tnum">
          <span className="text-gold">Period A</span>{' '}
          <span className="text-fg-primary">{summarizeRange(rangeA)}</span>
          <span className="mx-2.5 font-semibold text-fg-secondary">vs</span>
          <span style={{ color: palette.sideB }}>Period B</span>{' '}
          <span className="text-fg-primary">{summarizeRange(rangeB)}</span>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          Expand
        </span>
      </button>
    )
  }
  return (
    <div className="card-premium space-y-4 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          Periods
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse period picker"
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <ChevronDown size={12} strokeWidth={2.25} />
          Collapse
        </button>
      </div>

      <div className="grid grid-cols-1 items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <PeriodPicker
          which="A"
          tone="gold"
          range={rangeA}
          onChange={(r) => onRangeChange('A', r)}
        />
        <span className="justify-self-center inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-bg-1 text-[11px] font-semibold uppercase tracking-wider text-fg-secondary shadow-sm">
          vs
        </span>
        <PeriodPicker
          which="B"
          tone="teal"
          range={rangeB}
          onChange={(r) => onRangeChange('B', r)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-fg-tertiary">
          Shortcuts
        </span>
        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onApplyShortcut(s)}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-2.5 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function summarizeRange(r: DateRange): string {
  return `${r.from} → ${r.to} · ${daysBetween(r.from, r.to)}d`
}

function PeriodPicker({
  which,
  tone,
  range,
  onChange,
}: {
  which: 'A' | 'B'
  tone: 'gold' | 'teal'
  range: DateRange
  onChange: (r: DateRange) => void
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const isGold = tone === 'gold'
  // A uses the themed `gold` Tailwind tokens. Teal (B) has no theme-aware Tailwind
  // token, so expose the theme-aware palette.sideB as a CSS var (--accent) and
  // reference it from Tailwind arbitrary-property hover/focus classes — the only
  // way to get a theme-correct teal into :hover / :focus the way gold tokens do.
  const accentVar = isGold ? undefined : ({ '--accent': palette.sideB } as CSSProperties)
  const presetAccent = isGold
    ? 'hover:border-gold/40 hover:text-gold'
    : 'hover:[border-color:var(--accent)] hover:[color:var(--accent)]'
  const inputAccent = isGold ? 'focus:border-gold' : 'focus:[border-color:var(--accent)]'
  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-3 shadow-sm" style={accentVar}>
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-semibold uppercase tracking-wider ${isGold ? 'border-gold/40 text-gold' : ''}`}
          style={isGold ? undefined : { color: palette.sideB, borderColor: palette.sideB }}
        >
          Period {which}
        </span>
        <span className="font-mono text-[10px] text-fg-tertiary tnum">
          {range.from} → {range.to} · {daysBetween(range.from, range.to)}d
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(rangeForPreset(p))}
            className={`cursor-pointer rounded border border-border-strong bg-bg-1 px-2 py-1 text-[10px] uppercase tracking-wider text-fg-tertiary transition-colors duration-150 ${presetAccent}`}
          >
            {PERIOD_PRESET_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-fg-tertiary">
        <label className="inline-flex items-center gap-1">
          From
          <input
            type="date"
            value={range.from}
            onChange={(e) => onChange({ ...range, from: e.target.value })}
            className={`rounded border border-border-strong bg-bg-1 px-1.5 py-0.5 text-xs text-fg-primary focus:outline-none ${inputAccent}`}
          />
        </label>
        <label className="inline-flex items-center gap-1">
          To
          <input
            type="date"
            value={range.to}
            onChange={(e) => onChange({ ...range, to: e.target.value })}
            className={`rounded border border-border-strong bg-bg-1 px-1.5 py-0.5 text-xs text-fg-primary focus:outline-none ${inputAccent}`}
          />
        </label>
      </div>
    </div>
  )
}

// ── Verdict stat block ─────────────────────────────────────────────────────
//
// Premium "verdict" block in Ross Cameron's daily-review order: the verdict
// headline (net, daily, green-day %, worst day) plus the 70%-accuracy and
// 2:1-ratio reference gauges, then Edge Core, Consistency, Execution Quality,
// Behaviour, and Activity & Streaks. Each non-gauge section is a gold-accented
// card of "label | A vs B | delta + arrow" rows (matching FullStatsTable); the
// gauges mirror QualityTab's SqnHero (track + target tick + fill-to-actual).
// Pure presentation over comparison.periodA/periodB — no core change.

type FormatKind = 'money' | 'pct' | 'int' | 'ratio' | 'duration' | 'perShare'

interface StatSpec {
  label: string
  a: number | null
  b: number | null
  format: FormatKind
  /** Higher is better for the delta direction (most metrics).
   *  false → lower is better (fees, hold-time of losers, max consec losses).
   *  null → not actionable (raw counts like total trades — show grey arrow). */
  higherIsBetter: boolean | null
  /** Optional muted sub-line under the label. Used for coverage honesty on the
   *  gated stats ("R logged: A 42 · B 3") so a "—" value reads as "no covered
   *  data", not a glitch. Additive — rows that omit it render exactly as before. */
  subLabel?: string
  /** Effective coverage (min of the two periods' covered counts) for the gated
   *  stats. When set and below LOW_R_SAMPLE the row dims its value + shows a
   *  "low sample" marker. Additive — rows that omit it render exactly as before. */
  coverage?: number
  /** Streamer mode (beat 4): the row's value + delta cells wear the shipped
   *  masked-money marker. Only the growth row sets it — its % beside the
   *  visible Net P&L would reconstruct the masked balance. */
  masked?: boolean
}

interface StatSection {
  title: string
  rows: StatSpec[]
}

// Coverage sub-line for the gated stats — shows BOTH periods so a "—" value
// (zero coverage) is explained rather than mysterious. e.g. "R logged: A 42 · B 3".
function cov(noun: string, aN: number, bN: number): string {
  return `${noun}: A ${aN} · B ${bN}`
}

// Short "May 12" from a DayPnL (its .date is 'YYYY-MM-DD'); "—" when the period
// has no such day. Pure string split via the app's shortDate — no date lib.
function fmtDate(d: DayPnL | null): string {
  return d ? shortDate(d.date) : '—'
}

// Date sub-line for the largest-day rows — "on May 12 · May 03" (A · B). Returns
// undefined (no sub-line) only when NEITHER period has a best/worst day at all
// (both empty), so a populated period always shows when its extreme day landed.
function dateSub(a: DayPnL | null, b: DayPnL | null): string | undefined {
  return a || b ? `on ${fmtDate(a)} · ${fmtDate(b)}` : undefined
}

function buildSections(a: PeriodMetrics, b: PeriodMetrics): StatSection[] {
  return [
    {
      title: 'Edge Core',
      rows: [
        { label: 'Profit factor',  a: a.profitFactor, b: b.profitFactor, format: 'ratio', higherIsBetter: true },
        { label: 'Expectancy (R)', a: a.expectancyR,  b: b.expectancyR,  format: 'ratio', higherIsBetter: true,
          subLabel: cov('R logged', a.rCoverage, b.rCoverage),
          coverage: Math.min(a.rCoverage, b.rCoverage) },
        { label: 'Avg winner',     a: a.avgWinner,    b: b.avgWinner,    format: 'money', higherIsBetter: true },
        { label: 'Avg loser',      a: a.avgLoser,     b: b.avgLoser,     format: 'money', higherIsBetter: true },
        { label: 'Largest winner', a: a.largestWinner, b: b.largestWinner, format: 'money', higherIsBetter: true },
        { label: 'Largest loser',  a: a.largestLoser,  b: b.largestLoser,  format: 'money', higherIsBetter: true },
      ],
    },
    {
      // Phase 1 (djsevans87) — per-share tier. perShare format = perShareGainLoss
      // ("+$0.51/sh", 2dp, clean-zero). loss/max-loss use higherIsBetter:true so a
      // SMALLER (less-negative) per-share loss reads green, matching Avg/Largest loser.
      title: 'P&L per share',
      rows: [
        { label: 'Avg per-share P&L',  a: a.avgPerSharePnl ?? null,  b: b.avgPerSharePnl ?? null,  format: 'perShare', higherIsBetter: true },
        { label: 'Avg per-share gain', a: a.avgPerShareGain ?? null, b: b.avgPerShareGain ?? null, format: 'perShare', higherIsBetter: true },
        { label: 'Avg per-share loss', a: a.avgPerShareLoss ?? null, b: b.avgPerShareLoss ?? null, format: 'perShare', higherIsBetter: true },
        { label: 'Max per-share win',  a: a.maxPerShareWin ?? null,  b: b.maxPerShareWin ?? null,  format: 'perShare', higherIsBetter: true },
        { label: 'Max per-share loss', a: a.maxPerShareLoss ?? null, b: b.maxPerShareLoss ?? null, format: 'perShare', higherIsBetter: true },
      ],
    },
    {
      // Phase 2 (djsevans87) — price-move % tier (sibling of "P&L per share").
      // Fields are RATIOS; the 'pct' kind applies ×100 + signs the delta (ASCII
      // hyphen), like the win-rate / MFE-capture rows. higherIsBetter:true on all
      // five so a SMALLER (less-negative) loss % reads green (mirrors the per-share
      // loss rows). Empty side -> null -> em-dash.
      title: 'P&L %',
      rows: [
        { label: 'APPT %',     a: a.apptPct ?? null,    b: b.apptPct ?? null,    format: 'pct', higherIsBetter: true },
        { label: 'Avg win %',  a: a.avgWinPct ?? null,  b: b.avgWinPct ?? null,  format: 'pct', higherIsBetter: true },
        { label: 'Avg loss %', a: a.avgLossPct ?? null, b: b.avgLossPct ?? null, format: 'pct', higherIsBetter: true },
        { label: 'Max win %',  a: a.maxWinPct ?? null,  b: b.maxWinPct ?? null,  format: 'pct', higherIsBetter: true },
        { label: 'Max loss %', a: a.maxLossPct ?? null, b: b.maxLossPct ?? null, format: 'pct', higherIsBetter: true },
      ],
    },
    {
      title: 'Consistency',
      rows: [
        { label: 'Green days',        a: a.greenDays,       b: b.greenDays,       format: 'int',   higherIsBetter: true },
        { label: 'Red days',          a: a.redDays,         b: b.redDays,         format: 'int',   higherIsBetter: false },
        { label: 'Breakeven days',    a: a.breakevenDays,   b: b.breakevenDays,   format: 'int',   higherIsBetter: null },
        { label: 'Avg green day',     a: a.avgGreenDay,     b: b.avgGreenDay,     format: 'money', higherIsBetter: true },
        { label: 'Avg red day',       a: a.avgRedDay,       b: b.avgRedDay,       format: 'money', higherIsBetter: true },
        { label: 'Largest green day', a: a.largestGreenDay, b: b.largestGreenDay, format: 'money', higherIsBetter: true,
          // Date only when this side actually HAS a green day — else the date would
          // contradict the em-dash value (no-fabricated-data law).
          subLabel: dateSub(
            a.largestGreenDay != null ? a.bestDay : null,
            b.largestGreenDay != null ? b.bestDay : null,
          ) },
      ],
    },
    {
      title: 'Execution Quality',
      rows: [
        { label: 'MFE-capture %', a: a.mfeCapturePct, b: b.mfeCapturePct, format: 'pct',   higherIsBetter: true,
          subLabel: cov('covered', a.mfeCaptureCoverage, b.mfeCaptureCoverage),
          coverage: Math.min(a.mfeCaptureCoverage, b.mfeCaptureCoverage) },
        { label: 'MAE-to-stop',   a: a.maeToStop,     b: b.maeToStop,     format: 'ratio', higherIsBetter: false,
          subLabel: cov('covered', a.maeToStopCoverage, b.maeToStopCoverage),
          coverage: Math.min(a.maeToStopCoverage, b.maeToStopCoverage) },
      ],
    },
    {
      title: 'Behavior',
      rows: [
        { label: 'After big win → next',  a: a.afterBigWinAvgPnl,  b: b.afterBigWinAvgPnl,  format: 'money', higherIsBetter: true,
          subLabel: cov('big wins', a.afterBigWinCount, b.afterBigWinCount) },
        { label: 'After big loss → next', a: a.afterBigLossAvgPnl, b: b.afterBigLossAvgPnl, format: 'money', higherIsBetter: true,
          subLabel: cov('big losses', a.afterBigLossCount, b.afterBigLossCount) },
      ],
    },
    {
      title: 'Activity & Streaks',
      rows: [
        { label: 'Total trades',      a: a.trades,                b: b.trades,                format: 'int',      higherIsBetter: null },
        { label: 'Winners',           a: a.winners,               b: b.winners,               format: 'int',      higherIsBetter: true },
        { label: 'Losers',            a: a.losers,                b: b.losers,                format: 'int',      higherIsBetter: false },
        { label: 'Scratches',         a: a.scratches,             b: b.scratches,             format: 'int',      higherIsBetter: null },
        { label: 'Trading days',      a: a.tradingDays,           b: b.tradingDays,           format: 'int',      higherIsBetter: null },
        { label: 'Max consec wins',   a: a.maxConsecutiveWins,    b: b.maxConsecutiveWins,    format: 'int',      higherIsBetter: true },
        { label: 'Max consec losses', a: a.maxConsecutiveLosses,  b: b.maxConsecutiveLosses,  format: 'int',      higherIsBetter: false },
        { label: 'Hold (all)',        a: a.avgHoldSeconds,        b: b.avgHoldSeconds,        format: 'duration', higherIsBetter: null },
        { label: 'Hold (winners)',    a: a.avgHoldSecondsWinners, b: b.avgHoldSecondsWinners, format: 'duration', higherIsBetter: true },
        { label: 'Hold (losers)',     a: a.avgHoldSecondsLosers,  b: b.avgHoldSecondsLosers,  format: 'duration', higherIsBetter: false },
        { label: 'Hold (scratch)',    a: a.avgHoldScratch ?? null, b: b.avgHoldScratch ?? null, format: 'duration', higherIsBetter: null },
        { label: 'Fees',              a: a.fees,                  b: b.fees,                  format: 'money',    higherIsBetter: false },
        { label: 'Gross P&L',         a: a.grossPnL,              b: b.grossPnL,              format: 'money',    higherIsBetter: true },
        { label: 'Avg trade P&L',     a: a.avgTradePnL,           b: b.avgTradePnL,           format: 'money',    higherIsBetter: true },
        // Wired tier (Beat 2): volume is context (neutral grey delta); max drawdown
        // is a positive $ magnitude where smaller is better. 'int' on volume renders
        // raw digits (no compaction) — flagged for a possible compactShares format kind.
        { label: 'Avg daily volume',  a: a.avgDailyVolume ?? null, b: b.avgDailyVolume ?? null, format: 'int',      higherIsBetter: null },
        // Phase 1 (djsevans87) — total shares traded (both legs). Context, not
        // good/bad → neutral grey delta, like Avg daily volume / Total trades.
        { label: 'Shares traded',     a: a.totalSharesTraded ?? null, b: b.totalSharesTraded ?? null, format: 'int', higherIsBetter: null },
        // Avg share size (djsevans87) — avg share COUNT per trade (max legs), the
        // count companion to Avg position size $. Size is neutral (not good/bad).
        { label: 'Avg share size',    a: a.avgShareSize ?? null,      b: b.avgShareSize ?? null,      format: 'int',   higherIsBetter: null },
        // Phase 3 (djsevans87) — avg position size in $ (size, not good/bad -> neutral).
        { label: 'Avg position size', a: a.avgPositionSize ?? null,   b: b.avgPositionSize ?? null,   format: 'money', higherIsBetter: null },
        { label: 'Max drawdown',      a: a.maxDrawdown ?? null,    b: b.maxDrawdown ?? null,    format: 'money',    higherIsBetter: false },
      ],
    },
  ]
}

function VerdictBlock({
  a,
  b,
  filtersActive,
}: {
  a: PeriodMetrics
  b: PeriodMetrics
  filtersActive: boolean
}) {
  return (
    <div className="space-y-4">
      <VerdictCard a={a} b={b} filtersActive={filtersActive} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {buildSections(a, b).map((s) => (
          <StatSectionCard key={s.title} section={s} />
        ))}
      </div>
    </div>
  )
}

// Beat 4 build B — THE UN-PARK: the growth row's denominator is
// CONTRIBUTED CAPITAL (starting + deposits - withdrawals) from the shipped
// cash ledger, never the current balance (P&L would shrink its own
// percentage) and never the app-wide account size (the c42c2d6 em-dash
// era). Derived renderer-side over the existing channels: single scope
// reads the scoped account; 'all' composes the walled sum over anchored
// non-sim accounts with coverage honesty. No anchor / non-positive
// contributed -> null (the em-dash) with an honest subLabel — never
// Infinity, never NaN.
interface ContributedCapital {
  /** The denominator, or null when it must not compute. */
  contributed: number | null
  reason: 'ok' | 'no-anchor' | 'non-positive'
  /** Coverage for the 'all' subLabel: anchored / total non-sim. */
  anchored: number
  total: number
}

function useContributedCapital(scope: ReturnType<typeof useAccountScope>['scope']): ContributedCapital | null {
  const [state, setState] = useState<ContributedCapital | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      if (scope === 'all') {
        const accounts = await ipc.accountsList()
        const nonSim = accounts.filter((a) => a.account_type !== 'sim')
        const balances = await Promise.all(nonSim.map((a) => ipc.cashBalanceGet(a.id)))
        const anchored = balances.filter((b): b is NonNullable<typeof b> => b !== null)
        const sum = anchored.reduce((s, b) => s + b.starting + b.deposits - b.withdrawals, 0)
        const next: ContributedCapital =
          anchored.length === 0
            ? { contributed: null, reason: 'no-anchor', anchored: 0, total: nonSim.length }
            : sum <= 0
              ? { contributed: null, reason: 'non-positive', anchored: anchored.length, total: nonSim.length }
              : { contributed: sum, reason: 'ok', anchored: anchored.length, total: nonSim.length }
        if (!cancelled) setState(next)
      } else {
        const b = await ipc.cashBalanceGet(scope.accountId)
        const c = b === null ? null : b.starting + b.deposits - b.withdrawals
        const next: ContributedCapital =
          b === null
            ? { contributed: null, reason: 'no-anchor', anchored: 0, total: 1 }
            : c !== null && c > 0
              ? { contributed: c, reason: 'ok', anchored: 1, total: 1 }
              : { contributed: null, reason: 'non-positive', anchored: 1, total: 1 }
        if (!cancelled) setState(next)
      }
    }
    setState(null) // stale guard — the row shows the em-dash while loading
    void load().catch(() => {
      if (!cancelled) setState(null) // fail-honest: never a fabricated %
    })
    return () => {
      cancelled = true
    }
  }, [scope])
  return state
}

const CS = accountStrings.compare

function growthSubLabel(cc: ContributedCapital | null, scopedSingle: boolean): string | undefined {
  if (cc === null) return undefined
  if (cc.reason === 'no-anchor') return CS.growthNoAnchor
  if (cc.reason === 'non-positive') return CS.growthNonPositive
  if (scopedSingle) return CS.growthOverContributed
  return cc.anchored === cc.total
    ? CS.growthAcrossAll(cc.total)
    : CS.growthAcrossPartial(cc.anchored, cc.total)
}

// The headline card — the trader's verdict at a glance: the four numbers Ross
// reviews first, then the two reference gauges (accuracy vs the 70% target,
// P/L ratio vs the 2:1 target).
function VerdictCard({
  a,
  b,
  filtersActive,
}: {
  a: PeriodMetrics
  b: PeriodMetrics
  filtersActive: boolean
}) {
  const { scope } = useAccountScope()
  const scopedSingle = scope !== 'all'
  const cc = useContributedCapital(scope)
  const headline: StatSpec[] = [
    { label: 'Net P&L',         a: a.netPnL,        b: b.netPnL,        format: 'money', higherIsBetter: true },
    { label: 'Avg daily P&L',   a: a.avgDailyPnL,   b: b.avgDailyPnL,   format: 'money', higherIsBetter: true },
    { label: 'Green-day %',     a: a.greenDayPct,   b: b.greenDayPct,   format: 'pct',   higherIsBetter: true,
      subLabel: cov('trading days', a.tradingDays, b.tradingDays) },
    { label: 'Largest red day', a: a.largestRedDay, b: b.largestRedDay, format: 'money', higherIsBetter: true,
      // Date only when this side actually HAS a red day — else the date would
      // contradict the em-dash value (no-fabricated-data law).
      subLabel: dateSub(
        a.largestRedDay != null ? a.worstDay : null,
        b.largestRedDay != null ? b.worstDay : null,
      ) },
    // Phase 1 (djsevans87) — Account growth $ IS the period's net P&L (display
    // row, no new computation). Identical to "Net P&L" above by definition;
    // Phase 2 adds Account growth % to pair with it.
    { label: 'Account growth $', a: a.netPnL, b: b.netPnL, format: 'money', higherIsBetter: true },
  ]
  // Beat 4 build B — the % over CONTRIBUTED CAPITAL (the un-park). The
  // numerator is the row's existing period Net P&L; masked under streamer
  // (a visible P&L beside a visible % reconstructs the masked balance
  // with one division).
  // Dave #14 (A) — THE GATE: under an active caller-side filter the period
  // net P&L is a narrowed subset while contributed capital stays whole-
  // account; that mixed ratio must NEVER render. The row hides behind the
  // honest sub-line below and returns unchanged when the filter clears —
  // the ledger math never sees the filter.
  if (!filtersActive) {
    headline.push({ label: 'Net P&L (% of contributed)',
      a: cc?.contributed ? a.netPnL / cc.contributed : null,
      b: cc?.contributed ? b.netPnL / cc.contributed : null,
      format: 'pct', higherIsBetter: true, masked: true,
      subLabel: growthSubLabel(cc, scopedSingle) })
  }
  return (
    <div className="rounded-lg border border-gold/30 bg-bg-2 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gold">
          Verdict
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {headline.map((r) => (
          <StatRow key={r.label} spec={r} last />
        ))}
        {filtersActive && (
          <div className="flex min-h-8 items-center py-1">
            <span className="text-[10px] text-fg-tertiary">{CS.growthFilteredHidden}</span>
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-5 border-t border-border-subtle/40 pt-3 sm:grid-cols-2">
        <GaugeRow
          label="Win rate"
          a={a.winRate}
          b={b.winRate}
          kind="pct"
          target={0.7}
          max={1}
          targetLabel="70% target"
        />
        <GaugeRow
          label="P&L ratio"
          a={a.winLossRatio}
          b={b.winLossRatio}
          kind="ratio"
          target={2}
          max={4}
          targetLabel="2.0 target"
        />
      </div>
    </div>
  )
}

// Reference gauge mirroring SqnHero: a track with a target TICK and two fills
// (A gold on top, B win on the bottom) to the actual values. Win-rate uses a
// 0–100% scale with the tick at 70% (Ross's accuracy target); the P/L-ratio
// gauge uses a 0–4.0 scale (values >= 4 clamp to the right edge) with the tick
// at 2.0 (the 2:1 target, which lands at mid-track). A value meeting/beating
// the target reads green; below target reads gold (A) / muted (B).
function GaugeRow({
  label,
  a,
  b,
  kind,
  target,
  max,
  targetLabel,
}: {
  label: string
  a: number | null
  b: number | null
  kind: 'pct' | 'ratio'
  target: number
  max: number
  targetLabel: string
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const fmt = (v: number | null) =>
    v == null
      ? '—'
      : kind === 'pct'
        ? `${(v * 100).toFixed(1)}%`
        : Number.isFinite(v)
          ? v.toFixed(2)
          : '∞'
  // Fill width as a % of the track. Non-finite ratios (∞ — winners, no losers)
  // peg to the full track; nulls render no fill.
  const widthOf = (v: number | null) =>
    v == null ? null : Number.isFinite(v) ? Math.max(0, Math.min(100, (v / max) * 100)) : 100
  const aW = widthOf(a)
  const bW = widthOf(b)
  const targetPct = Math.min(100, (target / max) * 100)
  // Identity colours only — A gold, B teal, both constant. The target TICK on the
  // track conveys meets/beats-target; green is reserved for stat-row deltas.
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-fg-secondary">{label}</span>
        <span className="font-mono text-xs tnum">
          <span className="text-gold">{fmt(a)}</span>
          <span className="mx-1 text-fg-tertiary">vs</span>
          <span style={{ color: palette.sideB }}>{fmt(b)}</span>
        </span>
      </div>
      <div className="relative mt-2 h-3 overflow-hidden rounded-sm bg-white/[0.04]">
        {aW != null && (
          <div className="absolute left-0 top-0 h-1/2 bg-gold/70" style={{ width: `${aW}%` }} />
        )}
        {bW != null && (
          <div className="absolute bottom-0 left-0 h-1/2" style={{ width: `${bW}%`, backgroundColor: palette.sideB, opacity: 0.7 }} />
        )}
        {/* Target tick */}
        <div
          className="absolute top-0 h-full w-px bg-fg-secondary"
          style={{ left: `${targetPct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-tertiary">
        <span>0</span>
        <span className="text-fg-secondary">{targetLabel}</span>
        <span>{kind === 'pct' ? '100%' : `${max}+`}</span>
      </div>
    </div>
  )
}

function StatSectionCard({ section }: { section: StatSection }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-fg-secondary">
          {section.title}
        </h3>
      </div>
      <div>
        {section.rows.map((row, i) => (
          <StatRow key={row.label} spec={row} last={i === section.rows.length - 1} />
        ))}
      </div>
    </div>
  )
}

function fmtValue(v: number | null, kind: FormatKind): string {
  if (v == null) return '—'
  switch (kind) {
    case 'money':    return signed(v)
    case 'perShare': return perShareGainLoss(v)
    case 'pct':      return `${(v * 100).toFixed(1)}%`
    case 'int':      return `${Math.round(v)}`
    case 'ratio':    return Number.isFinite(v) ? v.toFixed(2) : '∞'
    case 'duration': return duration(v)
  }
}

function fmtDelta(delta: number | null, kind: FormatKind): string {
  if (delta == null) return '—'
  switch (kind) {
    case 'money':    return signed(delta)
    // Delta uses the ASCII-hyphen sign convention to MATCH the money rows (the
    // value tiles keep perShareGainLoss's U+2212). Clean-zero still collapses to
    // an unsigned "$0.00/sh" so a sub-$0.005 delta never shows a stray "-$0.00".
    case 'perShare': return perShareGainLossIsZero(delta)
      ? '$0.00/sh'
      : `${delta > 0 ? '+' : '-'}${money(Math.abs(delta))}/sh`
    case 'pct':      return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`
    case 'int':      return `${delta >= 0 ? '+' : ''}${Math.round(delta)}`
    case 'ratio':    return Number.isFinite(delta)
                       ? `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
                       : '—'
    case 'duration': {
      // Show ±N (m|h|s) — reusing the duration formatter on the absolute
      // value and prefixing the sign so the delta stays readable.
      const sign = delta >= 0 ? '+' : '-'
      return `${sign}${duration(Math.abs(delta))}`
    }
  }
}

function StatRow({ spec, last }: { spec: StatSpec; last: boolean }) {
  const { a, b, format, higherIsBetter } = spec
  const delta = a != null && b != null ? a - b : null
  const direction: 'up' | 'down' | 'flat' =
    delta == null || delta === 0
      ? 'flat'
      : delta > 0
        ? 'up'
        : 'down'

  let tone: 'win' | 'loss' | 'muted'
  if (higherIsBetter === null || direction === 'flat') {
    tone = 'muted'
  } else {
    const improvement = higherIsBetter ? direction === 'up' : direction === 'down'
    tone = improvement ? 'win' : 'loss'
  }

  const toneCls =
    tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : 'text-fg-tertiary'

  const Arrow = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : ArrowRight
  // Low-confidence cue: when the row's effective coverage is below the histogram's
  // LOW_R_SAMPLE threshold, dim the value + flag it. The delta/tone is untouched —
  // a thin row can still show its better/worse direction.
  const lowSample = spec.coverage != null && spec.coverage < LOW_R_SAMPLE

  return (
    <div
      className={`grid min-h-8 grid-cols-[1fr_auto_auto] items-center gap-3 py-1 ${
        last ? '' : 'border-b border-border-subtle/40'
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="text-sm text-fg-secondary">{spec.label}</span>
          {lowSample && (
            <span className="shrink-0 rounded-sm border border-warning/40 bg-warning/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary">
              low sample
            </span>
          )}
        </span>
        {spec.subLabel && (
          <span className="text-[10px] text-fg-tertiary">{spec.subLabel}</span>
        )}
      </span>
      <span className={`font-mono text-xs tnum ${lowSample ? 'opacity-50' : ''}`}>
        {spec.masked ? (
          <MaskedMoney>
            <span className="text-fg-primary">{fmtValue(a, format)}</span>
            <span className="mx-1 text-fg-tertiary">vs</span>
            <span className="text-fg-tertiary">{fmtValue(b, format)}</span>
          </MaskedMoney>
        ) : (
          <>
            <span className="text-fg-primary">{fmtValue(a, format)}</span>
            <span className="mx-1 text-fg-tertiary">vs</span>
            <span className="text-fg-tertiary">{fmtValue(b, format)}</span>
          </>
        )}
      </span>
      <span className={`flex w-[68px] items-center justify-end gap-1 font-mono text-xs tnum ${toneCls}`}>
        {spec.masked ? (
          <MaskedMoney>{fmtDelta(delta, format)}</MaskedMoney>
        ) : (
          <span>{fmtDelta(delta, format)}</span>
        )}
        <Arrow size={11} strokeWidth={2.25} />
      </span>
    </div>
  )
}

// ── Cumulative overlay ───────────────────────────────────────────────────

// Local copy of the dashboard axis formatter (kept local per scope; see CumulativePnlChart). Promote to @/lib/format if a 3rd caller appears.
function compactMoney(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}

function CumulativeOverlayChart({ comparison }: { comparison: ComparisonResult }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const data = useMemo(
    () =>
      comparison.cumulativePnL.rows.map((r) => ({
        day: `D${r.dayIndex}`,
        A: r.valueA,
        B: r.valueB,
      })),
    [comparison],
  )

  // Clamp the Y domain so $0 is always in range — the dashed zero baseline then
  // lands on a real gridline (mirrors CumulativePnlChart's domain intent).
  const { yMin, yMax } = useMemo(() => {
    const vals = data.flatMap((d) => [d.A, d.B]).filter((v): v is number => v != null)
    if (vals.length === 0) return { yMin: -1, yMax: 1 }
    return { yMin: Math.min(0, ...vals), yMax: Math.max(0, ...vals) }
  }, [data])

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {/* Soft GOLD fill under Period A only — period colour, NOT win/loss. */}
            <linearGradient id="compareCumAFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.sideA} stopOpacity={0.28} />
              <stop offset="100%" stopColor={palette.sideA} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="day"
            stroke={palette.axis}
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={10}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            tickFormatter={compactMoney}
            width={56}
            domain={[yMin, yMax]}
          />
          <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />
          <RechartsTooltip content={<OverlayTooltip teal={palette.sideB} />} />
          <Legend
            verticalAlign="top"
            height={24}
            wrapperStyle={{ fontSize: 11, color: palette.axis }}
            payload={[
              { value: 'Period A', type: 'line', id: 'A', color: palette.sideA },
              { value: 'Period B', type: 'line', id: 'B', color: palette.sideB },
            ]}
          />
          {/* Period A — gold line with a soft gold area beneath. */}
          <Area
            type={CUMULATIVE_LINE_TYPE}
            dataKey="A"
            name="Period A"
            stroke={palette.sideA}
            strokeWidth={1.75}
            fill="url(#compareCumAFill)"
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          {/* Period B — teal line ON TOP of A's fill (declared after, no fill). */}
          <Line
            type={CUMULATIVE_LINE_TYPE}
            dataKey="B"
            name="Period B"
            stroke={palette.sideB}
            strokeWidth={1.75}
            dot={false}
            connectNulls={false}
            fill="none"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function OverlayTooltip({ active, payload, teal }: {
  active?: boolean
  payload?: { payload: { day: string; A: number | null; B: number | null } }[]
  teal?: string
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">Day {d.day.slice(1)}</div>
      <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
        {d.A != null && (
          <span className="font-mono text-gold tnum">A: {signed(d.A)}</span>
        )}
        {d.B != null && (
          <span className="font-mono tnum" style={{ color: teal }}>B: {signed(d.B)}</span>
        )}
      </div>
    </div>
  )
}

// ── R-multiple distribution (paired A vs B) ────────────────────────────────
//
// Grouped gold-A / teal-B histogram over the 7 fixed R buckets. periodA and
// periodB.rDistribution are both buildRDistribution output, so they share the
// bucket set and order — we zip by bucket label. Coverage-honest: the caption
// shows the real R denominator (rDistCoverage of trades) per period; a period
// under LOW_R_SAMPLE covered trades is dimmed + badged (not hidden); a both-zero
// comparison shows an empty state instead of a flat zero axis. Matches the
// single-series RDistributionCard's recharts look, adapted to two series.

// Floor below which an R distribution is too thin to read as a real shape — dim
// + badge that period's bars rather than imply a distribution from a few trades.
const LOW_R_SAMPLE = 5

// ── Time-of-day quad (Compare v2 beat 2) ───────────────────────────────────
// Four small paired-bar panels — PnL / Profit Factor / Accuracy / Trades — over
// the Eastern trading hours, gold = Period A, teal = Period B. Reuses the
// breakdown card's bar grammar. Thin hours (< LOW_R_SAMPLE trades in a period)
// dim that period's bar so a 1-trade hour's 100% accuracy / extreme PF reads as
// low-confidence, not fact. PF / Accuracy bars are ABSENT for an hour with no
// losers / no decided trade (the metric is null) — an honest gap, never a
// fabricated value.

type QuadKind = 'money' | 'pf' | 'pct' | 'int'

function QuadPanel({
  title,
  rows,
  pick,
  kind,
  palette,
}: {
  title: string
  rows: HourlyComparisonRow[]
  pick: (m: HourMetrics) => number | null
  kind: QuadKind
  palette: ChartPalette
}) {
  const data = rows.map((r) => ({
    label: r.label,
    A: pick(r.a),
    B: pick(r.b),
    aLow: r.a.trade_count > 0 && r.a.trade_count < LOW_R_SAMPLE,
    bLow: r.b.trade_count > 0 && r.b.trade_count < LOW_R_SAMPLE,
    aCount: r.a.trade_count,
    bCount: r.b.trade_count,
  }))
  const fmtAxis = (v: number) =>
    kind === 'money'
      ? compactMoney(v)
      : kind === 'pct'
        ? `${Math.round(v)}%`
        : kind === 'pf'
          ? v.toFixed(1)
          : String(v)
  const fmtTip = (v: number | null) =>
    v == null
      ? '—'
      : kind === 'money'
        ? signed(v)
        : kind === 'pct'
          ? `${v.toFixed(1)}%`
          : kind === 'pf'
            ? v.toFixed(2)
            : String(Math.round(v))
  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-2.5 shadow-sm">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
        {title}
      </div>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={1}>
            <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={palette.axis}
              fontSize={8}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              interval={0}
              angle={-35}
              textAnchor="end"
              height={34}
            />
            <YAxis
              stroke={palette.axis}
              fontSize={8}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              tickFormatter={fmtAxis}
              domain={kind === 'pct' ? [0, 100] : undefined}
              width={kind === 'money' ? 40 : 30}
            />
            {kind === 'money' && <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />}
            <RechartsTooltip
              cursor={{ fill: 'rgba(127,127,127,0.05)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as (typeof data)[number]
                return (
                  <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
                    <div className="font-mono text-[11px] text-fg-tertiary">{row.label}</div>
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                      <span className="font-mono text-gold tnum">
                        A: {fmtTip(row.A)} · {row.aCount}t{row.aLow ? ' · low' : ''}
                      </span>
                      <span className="font-mono tnum" style={{ color: palette.sideB }}>
                        B: {fmtTip(row.B)} · {row.bCount}t{row.bLow ? ' · low' : ''}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
            <Bar dataKey="A" name="Period A" fill={palette.sideA} radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={18}>
              {data.map((d, i) => (
                <Cell key={i} fillOpacity={d.aLow ? 0.4 : 1} />
              ))}
            </Bar>
            <Bar dataKey="B" name="Period B" fill={palette.sideB} radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={18}>
              {data.map((d, i) => (
                <Cell key={i} fillOpacity={d.bLow ? 0.4 : 1} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function TimeOfDayQuad({
  trades,
  rangeA,
  rangeB,
}: {
  trades: TradeListRow[]
  rangeA: DateRange
  rangeB: DateRange
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const rows = useMemo(
    () => computeHourlyComparison(trades, rangeA, rangeB),
    [trades, rangeA, rangeB],
  )
  if (rows.length === 0) {
    return (
      <Card title="Time of day — Period A vs Period B">
        <div className="py-3 text-center text-xs text-fg-tertiary">
          No trades with a timestamp in either period.
        </div>
      </Card>
    )
  }
  return (
    <Card title="Time of day — Period A vs Period B">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-fg-tertiary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: palette.sideA }} />
          Period A
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: palette.sideB }} />
          Period B
        </span>
        <span className="ml-auto normal-case tracking-normal text-fg-tertiary/70">
          Dimmed bars = under {LOW_R_SAMPLE} trades that period (low sample)
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <QuadPanel title="Net P&L" rows={rows} pick={(m) => m.net_pnl} kind="money" palette={palette} />
        <QuadPanel title="Profit Factor" rows={rows} pick={(m) => m.profit_factor} kind="pf" palette={palette} />
        <QuadPanel title="Accuracy" rows={rows} pick={(m) => (m.win_rate == null ? null : m.win_rate * 100)} kind="pct" palette={palette} />
        <QuadPanel title="Trades" rows={rows} pick={(m) => m.trade_count} kind="int" palette={palette} />
      </div>
    </Card>
  )
}

function RDistributionComparisonChart({ comparison }: { comparison: ComparisonResult }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const a = comparison.periodA
  const b = comparison.periodB

  // Zip the two periods' buckets by shared label (find is defensive; both arrays
  // are the same 7 labels in the same order).
  const data = useMemo(
    () =>
      a.rDistribution.map((bucketA) => ({
        bucket: bucketA.bucket,
        A: bucketA.count,
        B: b.rDistribution.find((x) => x.bucket === bucketA.bucket)?.count ?? 0,
      })),
    [a.rDistribution, b.rDistribution],
  )

  const aLow = a.rDistCoverage > 0 && a.rDistCoverage < LOW_R_SAMPLE
  const bLow = b.rDistCoverage > 0 && b.rDistCoverage < LOW_R_SAMPLE
  const bothZero = a.rDistCoverage === 0 && b.rDistCoverage === 0

  // Muted denominator caption — same idiom as the stat-block coverage sub-lines.
  const caption = (
    <div className="text-[11px] text-fg-tertiary">
      R logged: A {a.rDistCoverage} of {a.trades} · B {b.rDistCoverage} of {b.trades}
    </div>
  )

  if (bothZero) {
    return (
      <>
        {caption}
        <div className="mt-3 rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
          <div className="mb-1 uppercase tracking-wider text-gold">Awaiting data</div>
          No R-multiples logged in either period — log planned risk on trades to
          populate this.
        </div>
      </>
    )
  }

  return (
    <>
      {caption}
      {(aLow || bLow) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {aLow && (
            <span className="rounded-sm border border-warning/40 bg-warning/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary">
              Period A: low sample (n={a.rDistCoverage})
            </span>
          )}
          {bLow && (
            <span className="rounded-sm border border-warning/40 bg-warning/[0.08] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-fg-secondary">
              Period B: low sample (n={b.rDistCoverage})
            </span>
          )}
        </div>
      )}
      <div className="mt-3 h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barCategoryGap="20%" barGap={2}>
            <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="bucket"
              stroke={palette.axis}
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              interval={0}
            />
            <YAxis
              stroke={palette.axis}
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              allowDecimals={false}
              width={32}
            />
            <RechartsTooltip
              cursor={{ fill: 'rgba(127,127,127,0.05)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as { bucket: string; A: number; B: number }
                return (
                  <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
                    <div className="font-mono text-[11px] text-fg-tertiary">{d.bucket}</div>
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                      <span className="font-mono tnum" style={{ color: palette.sideA }}>
                        A: {d.A} {d.A === 1 ? 'trade' : 'trades'}
                      </span>
                      <span className="font-mono tnum" style={{ color: palette.sideB }}>
                        B: {d.B} {d.B === 1 ? 'trade' : 'trades'}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
            <Legend
              verticalAlign="top"
              height={24}
              wrapperStyle={{ fontSize: 11, color: palette.axis }}
              payload={[
                { value: 'Period A', type: 'rect', id: 'A', color: palette.sideA },
                { value: 'Period B', type: 'rect', id: 'B', color: palette.sideB },
              ]}
            />
            <Bar dataKey="A" name="Period A" fill={palette.sideA} fillOpacity={aLow ? 0.4 : 1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="B" name="Period B" fill={palette.sideB} fillOpacity={bLow ? 0.4 : 1} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  )
}

// ── Breakdown comparison card (collapsible) ──────────────────────────────

function BreakdownComparisonCard({
  trades,
  rangeA,
  rangeB,
  sentimentByDate,
  dimension,
  title,
  coverageNoun,
}: {
  trades: TradeListRow[]
  rangeA: DateRange
  rangeB: DateRange
  sentimentByDate: Map<string, number | null>
  dimension: BreakdownDimension
  title: string
  /** When set on a coverage-gated card (float/rvol/gap), an "N trade(s) without
   *  {coverageNoun} data" line discloses the notShown count. Omitted on the other
   *  cards — they show no coverage line even if some keys are null. */
  coverageNoun?: string
}) {
  const [open, setOpen] = useState(false)
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const goldHex = palette.sideA
  const winHex = palette.sideB

  const breakdown = useMemo(
    () => computeBreakdownComparison(trades, rangeA, rangeB, dimension, sentimentByDate),
    [trades, rangeA, rangeB, dimension, sentimentByDate],
  )

  // Drop rows that have no trades AND no P&L in either period — they'd
  // otherwise render as a label with two empty placeholders, eating
  // horizontal space for nothing.
  //
  // For region/country dimensions we attach an `iso` alongside the label so the
  // category Y-axis tick can render a flag SVG left of the name. For every other
  // dimension `iso` stays null and the tick is text-only.
  const data = useMemo(() => {
    return breakdown.rows
      .filter((r) => r.tradesA > 0 || r.tradesB > 0)
      .map((r) => {
        let label = r.key
        let iso: string | null = null
        if (dimension === 'country') {
          label = COUNTRY_NAMES[r.key] ?? r.key
          iso = r.key
        } else if (dimension === 'region') {
          iso = REGION_REPRESENTATIVE_COUNTRY[r.key as Region] ?? null
        }
        return {
          key: label,
          iso,
          A: r.netPnLA,
          B: r.netPnLB,
          tradesA: r.tradesA,
          tradesB: r.tradesB,
        }
      })
  }, [breakdown, dimension])

  // Horizontal layout: one band per row, two grouped bars (A gold, B teal).
  // Height scales with the row count; the value axis is padded so the bar-tip
  // $ labels have room (positive right of zero, negative left).
  const yWidth = 210
  const chartHeight = Math.max(140, data.length * 48 + 48)
  const values = data.flatMap((d) => [d.A, d.B])
  // Symmetric, zero-centered domain so x=0 sits DEAD CENTER on every card and
  // gains/losses read consistently (right = gain, left = loss). Pad ~22% past
  // the largest |value| so the bar-tip $ labels have room and don't clip.
  const absMax = Math.max(1, ...values.map((v) => Math.abs(v)))
  const xMax = absMax * 1.22
  const xDomain: [number, number] = [-xMax, xMax]

  const emptyText =
    dimension === 'country'
      ? 'Add country to 3+ trades to see breakdown.'
      : dimension === 'region'
        ? 'Add country to trades to see region breakdown.'
        : 'No data for this dimension in either period.'

  return (
    <div className="flex flex-col rounded-md border border-border-subtle bg-bg-2 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-bg-3"
        aria-expanded={open}
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex items-center gap-2 text-sm font-medium text-fg-primary">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{title}</span>
          </div>
          {coverageNoun && breakdown.notShown > 0 && (
            <span className="pl-[22px] text-[10px] text-fg-tertiary">
              {breakdown.notShown} {breakdown.notShown === 1 ? 'trade' : 'trades'} without{' '}
              {coverageNoun} data
            </span>
          )}
        </div>
        <span className="text-[10px] text-fg-tertiary tnum">
          {data.length} {data.length === 1 ? 'row' : 'rows'}
        </span>
      </button>
      {open && (
        <div className="flex-1 border-t border-border-subtle p-3">
          {data.length === 0 ? (
            <div className="py-3 text-center text-xs text-fg-tertiary">
              {emptyText}
            </div>
          ) : (
            <div className="w-full" style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={data}
                  margin={{ top: 6, right: 14, left: 4, bottom: 4 }}
                  barCategoryGap="20%"
                  barGap={3}
                >
                  {/* Clean rounded value scale at the TOP — nice ticks only (no
                      raw floats), small + muted so it reads as a quiet magnitude
                      reference. The bar-tip $ labels stay the precise numbers. */}
                  <XAxis
                    type="number"
                    domain={xDomain}
                    ticks={niceTicks(xMax)}
                    orientation="top"
                    tickFormatter={fmtScaleTick}
                    tick={{ fontSize: 9, fill: palette.axis }}
                    tickLine={false}
                    axisLine={false}
                    height={20}
                  />
                  <YAxis
                    type="category"
                    dataKey="key"
                    stroke={palette.axis}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    interval={0}
                    width={yWidth}
                    tick={(props: TickRenderProps) => (
                      <FlagYTick {...props} data={data} axisColor={palette.axis} gutter={yWidth} />
                    )}
                  />
                  {/* Soft gain/loss gradient watermark — left wash red
                      (intensifying outward to the loss extreme), right wash green
                      (intensifying outward to the gain extreme), faint at center.
                      A background tint only (NOT bar color, NOT a delta); rendered
                      before the bars so they sit opaque on top. Gradient ids are
                      per-dimension — the card renders 8x and duplicate SVG ids
                      would collide. */}
                  <defs>
                    <linearGradient id={`cmp-grad-loss-${dimension}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={palette.loss} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={palette.loss} stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id={`cmp-grad-gain-${dimension}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor={palette.win} stopOpacity={0.04} />
                      <stop offset="100%" stopColor={palette.win} stopOpacity={0.22} />
                    </linearGradient>
                  </defs>
                  <ReferenceArea x1={-xMax} x2={0} fill={`url(#cmp-grad-loss-${dimension})`} />
                  <ReferenceArea x1={0} x2={xMax} fill={`url(#cmp-grad-gain-${dimension})`} />
                  {/* Faint value-axis gridlines at the nice ticks — a quiet
                      reference, not a cage. Behind the bars; fine over the gradient. */}
                  <CartesianGrid horizontal={false} stroke={palette.grid} strokeDasharray="2 4" strokeOpacity={0.5} />
                  <ReferenceLine x={0} stroke={palette.grid} strokeDasharray="3 3" />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(127,127,127,0.05)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const row = payload[0].payload as {
                        key: string
                        A: number
                        B: number
                        tradesA: number
                        tradesB: number
                      }
                      return (
                        <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
                          <div className="font-mono text-[11px] text-fg-tertiary">{row.key}</div>
                          <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
                            <span className="font-mono text-gold tnum">
                              A: {signed(row.A)} · {row.tradesA}t
                            </span>
                            <span className="font-mono tnum" style={{ color: palette.sideB }}>
                              B: {signed(row.B)} · {row.tradesB}t
                            </span>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={18}
                    iconSize={8}
                    wrapperStyle={{ fontSize: 10, color: palette.axis }}
                    payload={[
                      { value: 'Period A', type: 'rect', id: 'A', color: palette.sideA },
                      { value: 'Period B', type: 'rect', id: 'B', color: palette.sideB },
                    ]}
                  />
                  <Bar
                    dataKey="A"
                    name="Period A"
                    fill={goldHex}
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                    maxBarSize={20}
                  >
                    <LabelList dataKey="A" content={renderBarTip(goldHex)} />
                  </Bar>
                  <Bar
                    dataKey="B"
                    name="Period B"
                    fill={winHex}
                    radius={[0, 2, 2, 0]}
                    isAnimationActive={false}
                    maxBarSize={20}
                  >
                    <LabelList dataKey="B" content={renderBarTip(winHex)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Symmetric "nice" tick array (including 0) for the breakdown value axis. Picks
// a step from {1,2,2.5,5}x10^k so each side gets ~3 intervals — clean ROUNDED
// numbers (e.g. xMax~=51 -> [-50,-25,0,25,50]), NEVER raw decimals. Pure.
function niceTicks(xMax: number): number[] {
  const rough = Math.max(1, xMax) / 3
  const pow = Math.max(1, Math.pow(10, Math.floor(Math.log10(rough))))
  const mults = pow >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10]
  const step = mults.map((m) => m * pow).find((c) => c >= rough) ?? 10 * pow
  const pos: number[] = []
  for (let v = step; v <= xMax + step * 0.001; v += step) pos.push(Math.round(v))
  return [...pos.map((v) => -v).reverse(), 0, ...pos]
}

// Rounded signed-$ for the value-scale ticks — integers only (no "-13.7779..."),
// compact past 1k. 0 -> "$0". Negatives get a leading minus; positives are bare.
function fmtScaleTick(v: number): string {
  if (v === 0) return '$0'
  const abs = Math.abs(v)
  const body =
    abs >= 1000 ? `$${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k` : `$${abs}`
  return v < 0 ? `-${body}` : body
}

function compactDeltaMoney(v: number): string {
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

// ── Bar-tip value label + flag Y-axis tick (horizontal breakdown bars) ──
//
// Recharts custom label/tick renderers run inside the chart <svg>, so they
// return SVG elements (not HTML). renderBarTip draws the signed $ value just
// past each bar's tip; FlagYTick draws a flag SVG + the name down the left
// category axis for the region/country cards.

interface BreakdownRowVisual {
  key: string
  iso: string | null
}

interface TickRenderProps {
  x: number
  y: number
  payload: { value: string }
  index?: number
}

// Signed-$ label at a horizontal bar's tip — OUTSIDE the bar end so it stays
// legible (the old vertical bars rendered these too small). Positive bars label
// to the right of the tip, negative bars to the left, so a loss reads clearly.
function renderBarTip(fill: string) {
  return (props: {
    x?: number | string
    y?: number | string
    width?: number | string
    height?: number | string
    value?: number | string
  }) => {
    const x = Number(props.x ?? 0)
    const y = Number(props.y ?? 0)
    const width = Number(props.width ?? 0)
    const height = Number(props.height ?? 0)
    const value = typeof props.value === 'number' ? props.value : Number(props.value)
    if (!Number.isFinite(value) || value === 0) return null
    const positive = value >= 0
    const tipX = positive ? x + width + 5 : x - 5
    return (
      <text
        x={tipX}
        y={y + height / 2}
        dy={3.5}
        textAnchor={positive ? 'start' : 'end'}
        fontSize={10.5}
        fontWeight={600}
        fontFamily="JetBrains Mono"
        fill={fill}
      >
        {compactDeltaMoney(value)}
      </text>
    )
  }
}

const FLAG_Y_W = 19
const FLAG_Y_H = 12

// Category Y-axis tick for the region/country cards: a flag SVG + the name,
// left of the bars, within the reserved `gutter` px. iso null (every other
// dimension) → name only.
function FlagYTick({
  x = 0,
  y = 0,
  payload,
  index,
  data,
  axisColor,
  gutter,
}: TickRenderProps & {
  data: BreakdownRowVisual[]
  axisColor: string
  gutter: number
}) {
  const row = typeof index === 'number' ? data[index] : undefined
  const iso = row?.iso ?? null
  const label = payload?.value ?? ''
  // 12px left padding so the first character isn't clipped against the card's
  // left edge; the flag (region/country) shifts in by the same amount.
  const leftPad = 12
  const left = -gutter + leftPad
  const flagSpace = iso ? FLAG_Y_W + 7 : 0
  const textX = left + flagSpace
  // Keep the WHOLE name inside the gutter — never spill past x=0 onto the bars.
  // Short names sit at 13px bold; a long name steps its font DOWN (floor 10) to
  // fit the available text band; only if it still won't fit at the floor do we
  // truncate that one with an ellipsis (rare — the 210px gutter + step-down fits
  // the known long playbook names).
  const band = Math.max(20, gutter - leftPad - flagSpace)
  const CHAR_W = 6.8 // ~px per char at 13px semibold
  const fullWidth = label.length * CHAR_W
  const fontSize = fullWidth > band ? Math.max(10, Math.floor((band / fullWidth) * 13)) : 13
  let text = label
  const widthAtFont = fullWidth * (fontSize / 13)
  if (widthAtFont > band) {
    const charW = CHAR_W * (fontSize / 13)
    text = label.slice(0, Math.max(1, Math.floor(band / charW) - 1)) + '…'
  }
  return (
    <g transform={`translate(${x}, ${y})`}>
      {iso && <FlagSvg iso={iso} x={left} y={-FLAG_Y_H / 2} width={FLAG_Y_W} height={FLAG_Y_H} />}
      <text
        x={textX}
        y={0}
        dy={4}
        textAnchor="start"
        fontSize={fontSize}
        fontWeight={600}
        fill={axisColor}
      >
        {text}
      </text>
    </g>
  )
}

// ── Auto-insights list ───────────────────────────────────────────────────

function ComparisonInsightsList({ insights }: { insights: ComparisonInsight[] }) {
  if (insights.length === 0) {
    return (
      <Card title="Comparison insights">
        <div className="flex items-start gap-3 py-2 text-sm text-fg-tertiary">
          <Lightbulb size={16} strokeWidth={1.75} className="mt-0.5 text-gold/60" />
          <div>
            No notable moves between these periods. Try wider ranges or include
            more dimensions in the filter bar.
          </div>
        </div>
      </Card>
    )
  }
  return (
    <Card title="Comparison insights">
      <ul className="space-y-2">
        {insights.map((i) => {
          const Icon =
            i.tone === 'positive'
              ? TrendingUp
              : i.tone === 'negative'
                ? TrendingDown
                : Sparkles
          const tone =
            i.tone === 'positive'
              ? 'text-win'
              : i.tone === 'negative'
                ? 'text-loss'
                : 'text-gold'
          return (
            <li key={i.id} className="flex items-start gap-2.5">
              <span className={`mt-0.5 ${tone}`}>
                <Icon size={14} strokeWidth={2} />
              </span>
              <span className="text-sm text-fg-secondary">{i.text}</span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
