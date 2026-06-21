import { useMemo, useState, type CSSProperties } from 'react'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
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
import Card from '@/components/ui/Card'
import { duration, money, shortDate, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
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
          <VerdictBlock a={comparison.periodA} b={comparison.periodB} />

          {eitherEmpty && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-xs text-fg-secondary">
              One of the periods has zero trades — comparisons against it
              will show that period as flat zero.
            </div>
          )}

          {/* Cumulative overlay */}
          <Card title="Cumulative P&L — Period A vs Period B">
            <CumulativeOverlayChart comparison={comparison} />
          </Card>

          {/* R-multiple distribution — paired A-vs-B histogram (sub-phase B2) */}
          <Card title="R-multiple distribution — Period A vs Period B">
            <RDistributionComparisonChart comparison={comparison} />
          </Card>

          {/* Breakdown comparison cards — 2-up grid on desktop so all five
              dimensions are visible in ~3 screens of scroll instead of
              six. Stacks vertically on narrow screens. Grid `items-stretch`
              (the default) keeps each row's two cards the same height. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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

type FormatKind = 'money' | 'pct' | 'int' | 'ratio' | 'duration'

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
        { label: 'Max drawdown',      a: a.maxDrawdown ?? null,    b: b.maxDrawdown ?? null,    format: 'money',    higherIsBetter: false },
      ],
    },
  ]
}

function VerdictBlock({ a, b }: { a: PeriodMetrics; b: PeriodMetrics }) {
  return (
    <div className="space-y-4">
      <VerdictCard a={a} b={b} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {buildSections(a, b).map((s) => (
          <StatSectionCard key={s.title} section={s} />
        ))}
      </div>
    </div>
  )
}

// The headline card — the trader's verdict at a glance: the four numbers Ross
// reviews first, then the two reference gauges (accuracy vs the 70% target,
// P/L ratio vs the 2:1 target).
function VerdictCard({ a, b }: { a: PeriodMetrics; b: PeriodMetrics }) {
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
  ]
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
          label="Profit/Loss ratio"
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
        <span className="text-fg-primary">{fmtValue(a, format)}</span>
        <span className="mx-1 text-fg-tertiary">vs</span>
        <span className="text-fg-tertiary">{fmtValue(b, format)}</span>
      </span>
      <span className={`flex w-[68px] items-center justify-end gap-1 font-mono text-xs tnum ${toneCls}`}>
        <span>{fmtDelta(delta, format)}</span>
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
}: {
  trades: TradeListRow[]
  rangeA: DateRange
  rangeB: DateRange
  sentimentByDate: Map<string, number | null>
  dimension: BreakdownDimension
  title: string
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
  // For region/country dimensions we attach an `iso` alongside the label
  // so the custom X-axis tick can render a flag SVG above the text. For
  // every other dimension `iso` stays null and the tick falls back to
  // text-only.
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

  const showFlags = dimension === 'region' || dimension === 'country'
  const rotate = data.length > 6

  const emptyText =
    dimension === 'country'
      ? 'Add country to 3+ trades to see breakdown.'
      : dimension === 'region'
        ? 'Add country to trades to see region breakdown.'
        : 'No data for this dimension in either period.'

  return (
    <div className="flex h-full flex-col rounded-md border border-border-subtle bg-bg-2 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-bg-3"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-fg-primary">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{title}</span>
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
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data}
                  margin={{ top: 18, right: 12, left: 0, bottom: 4 }}
                  barCategoryGap="28%"
                  barGap={2}
                >
                  <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
                  <XAxis
                    dataKey="key"
                    stroke={palette.axis}
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    interval={0}
                    // Custom tick when we're drawing flags so a 24×16
                    // FlagSvg can sit above the text label. Other
                    // dimensions keep Recharts' default tick handling.
                    angle={showFlags ? undefined : rotate ? -30 : 0}
                    textAnchor={showFlags ? undefined : rotate ? 'end' : 'middle'}
                    tick={
                      showFlags
                        ? (props: TickRenderProps) => (
                            <FlagTick
                              {...props}
                              data={data}
                              rotate={rotate}
                              axisColor={palette.axis}
                            />
                          )
                        : undefined
                    }
                    height={
                      showFlags ? (rotate ? 60 : 38) : rotate ? 44 : 18
                    }
                  />
                  <YAxis
                    stroke={palette.axis}
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                    width={44}
                  />
                  <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />
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
                    verticalAlign="top"
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
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                    maxBarSize={32}
                  >
                    <LabelList
                      dataKey="A"
                      position="top"
                      formatter={(v: number) => (v === 0 ? '' : compactDeltaMoney(v))}
                      style={{ fill: goldHex, fontSize: 9, fontFamily: 'JetBrains Mono' }}
                    />
                  </Bar>
                  <Bar
                    dataKey="B"
                    name="Period B"
                    fill={winHex}
                    radius={[2, 2, 0, 0]}
                    isAnimationActive={false}
                    maxBarSize={32}
                  >
                    <LabelList
                      dataKey="B"
                      position="top"
                      formatter={(v: number) => (v === 0 ? '' : compactDeltaMoney(v))}
                      style={{ fill: winHex, fontSize: 9, fontFamily: 'JetBrains Mono' }}
                    />
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

function compactDeltaMoney(v: number): string {
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`
  return `${sign}$${abs.toFixed(0)}`
}

// ── Custom X-axis tick with a flag SVG above the text label ────────────
//
// Recharts custom-tick functions run inside the chart <svg>, so the tick
// must return SVG elements (not HTML). FlagSvg gives us a raw <svg>
// pulled from the country-flag-icons registry that can be positioned
// alongside the <text> label.

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

interface FlagTickProps extends TickRenderProps {
  data: BreakdownRowVisual[]
  rotate: boolean
  axisColor: string
}

const FLAG_TICK_WIDTH = 24
const FLAG_TICK_HEIGHT = 16

function FlagTick({ x, y, payload, index, data, rotate, axisColor }: FlagTickProps) {
  const row = typeof index === 'number' ? data[index] : undefined
  const iso = row?.iso ?? null
  const textY = FLAG_TICK_HEIGHT + 14
  // Recharts passes (x, y) at the top of the tick area just below the
  // axis line. Translate so we draw relative to that origin.
  return (
    <g transform={`translate(${x}, ${y})`}>
      {iso && (
        <FlagSvg
          iso={iso}
          x={-FLAG_TICK_WIDTH / 2}
          y={2}
          width={FLAG_TICK_WIDTH}
          height={FLAG_TICK_HEIGHT}
        />
      )}
      <text
        y={textY}
        textAnchor={rotate ? 'end' : 'middle'}
        fontSize={9}
        fill={axisColor}
        transform={rotate ? `rotate(-30 0 ${textY})` : undefined}
      >
        {payload.value}
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
