import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
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
import { duration, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
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
          {/* Dense multi-section stat table — replaces the wide headline
              cards. Mirrors the Performance Stats card pattern used
              elsewhere in the app. */}
          <HeadlineStatTable a={comparison.periodA} b={comparison.periodB} />

          {eitherEmpty && (
            <div className="rounded-md border border-warning/40 bg-warning/[0.08] px-3 py-2 text-xs text-fg-secondary">
              One of the periods has zero trades — comparisons against it
              will show that period as flat zero.
            </div>
          )}

          {/* Side-by-side daily P&L */}
          <Card title="Daily P&L — Period A vs Period B">
            <SideBySideBarChart comparison={comparison} />
          </Card>

          {/* Cumulative overlay */}
          <Card title="Cumulative P&L — Period A vs Period B">
            <CumulativeOverlayChart comparison={comparison} />
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
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        aria-label="Expand period picker"
        className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border-subtle bg-bg-2 px-3 py-2 shadow-sm transition-colors duration-150 hover:bg-bg-3"
      >
        <ChevronRight size={14} strokeWidth={2.25} className="shrink-0 text-fg-tertiary" />
        <div className="flex-1 truncate font-mono text-[11px] text-fg-secondary tnum">
          <span className="text-gold">Period A</span>{' '}
          <span className="text-fg-primary">{summarizeRange(rangeA)}</span>
          <span className="mx-2 text-fg-tertiary">vs</span>
          <span className="text-win">Period B</span>{' '}
          <span className="text-fg-primary">{summarizeRange(rangeB)}</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
          Expand
        </span>
      </button>
    )
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
          Periods
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={true}
          aria-label="Collapse period picker"
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border-strong bg-bg-1 px-2 font-mono text-[10px] uppercase tracking-widest text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
        >
          <ChevronDown size={12} strokeWidth={2.25} />
          Collapse
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <PeriodPicker
          which="A"
          tone="gold"
          range={rangeA}
          onChange={(r) => onRangeChange('A', r)}
        />
        <PeriodPicker
          which="B"
          tone="win"
          range={rangeB}
          onChange={(r) => onRangeChange('B', r)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
          Shortcuts
        </span>
        {SHORTCUTS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onApplyShortcut(s)}
            className="inline-flex h-7 cursor-pointer items-center rounded-md border border-border-strong bg-bg-1 px-2.5 font-mono text-[10px] uppercase tracking-widest text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
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
  tone: 'gold' | 'win'
  range: DateRange
  onChange: (r: DateRange) => void
}) {
  const toneCls =
    tone === 'gold'
      ? 'border-gold/40 text-gold'
      : 'border-win/40 text-win'
  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest ${toneCls}`}
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
            className="cursor-pointer rounded border border-border-strong bg-bg-1 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-fg-tertiary transition-colors duration-150 hover:border-gold/40 hover:text-gold"
          >
            {PERIOD_PRESET_LABEL[p]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-fg-tertiary">
        <label className="inline-flex items-center gap-1">
          From
          <input
            type="date"
            value={range.from}
            onChange={(e) => onChange({ ...range, from: e.target.value })}
            className="rounded border border-border-strong bg-bg-1 px-1.5 py-0.5 font-mono text-xs text-fg-primary focus:border-gold focus:outline-none"
          />
        </label>
        <label className="inline-flex items-center gap-1">
          To
          <input
            type="date"
            value={range.to}
            onChange={(e) => onChange({ ...range, to: e.target.value })}
            className="rounded border border-border-strong bg-bg-1 px-1.5 py-0.5 font-mono text-xs text-fg-primary focus:border-gold focus:outline-none"
          />
        </label>
      </div>
    </div>
  )
}

// ── Headline stat table ──────────────────────────────────────────────────
//
// Dense multi-section table that replaces the four big stretched headline
// cards. Mirrors the Performance Stats card pattern: small caps section
// header with a gold accent dot, then ~32px rows of "label | A vs B |
// delta + arrow". Two sections sit side-by-side on desktop (single column
// on narrow screens).

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
}

interface StatSection {
  title: string
  rows: StatSpec[]
}

function buildSections(a: PeriodMetrics, b: PeriodMetrics): StatSection[] {
  return [
    {
      title: 'P&L',
      rows: [
        { label: 'Net P&L',         a: a.netPnL,       b: b.netPnL,       format: 'money', higherIsBetter: true },
        { label: 'Gross P&L',       a: a.grossPnL,     b: b.grossPnL,     format: 'money', higherIsBetter: true },
        { label: 'Avg trade P&L',   a: a.avgTradePnL,  b: b.avgTradePnL,  format: 'money', higherIsBetter: true },
        { label: 'Avg daily P&L',   a: a.avgDailyPnL,  b: b.avgDailyPnL,  format: 'money', higherIsBetter: true },
        { label: 'Profit factor',   a: a.profitFactor, b: b.profitFactor, format: 'ratio', higherIsBetter: true },
        { label: 'Fees',            a: a.fees,         b: b.fees,         format: 'money', higherIsBetter: false },
      ],
    },
    {
      title: 'Counts',
      rows: [
        { label: 'Total trades',  a: a.trades,       b: b.trades,       format: 'int', higherIsBetter: null },
        { label: 'Winners',       a: a.winners,      b: b.winners,      format: 'int', higherIsBetter: true },
        { label: 'Losers',        a: a.losers,       b: b.losers,       format: 'int', higherIsBetter: false },
        { label: 'Scratches',     a: a.scratches,    b: b.scratches,    format: 'int', higherIsBetter: null },
        { label: 'Trading days',  a: a.tradingDays,  b: b.tradingDays,  format: 'int', higherIsBetter: null },
      ],
    },
    {
      title: 'Quality',
      rows: [
        { label: 'Win rate',        a: a.winRate,        b: b.winRate,        format: 'pct',   higherIsBetter: true },
        { label: 'Avg winner',      a: a.avgWinner,      b: b.avgWinner,      format: 'money', higherIsBetter: true },
        { label: 'Avg loser',       a: a.avgLoser,       b: b.avgLoser,       format: 'money', higherIsBetter: true },
        { label: 'Largest winner',  a: a.largestWinner,  b: b.largestWinner,  format: 'money', higherIsBetter: true },
        { label: 'Largest loser',   a: a.largestLoser,   b: b.largestLoser,   format: 'money', higherIsBetter: true },
        { label: 'Win/Loss ratio',  a: a.winLossRatio,   b: b.winLossRatio,   format: 'ratio', higherIsBetter: true },
      ],
    },
    {
      title: 'Hold Time',
      rows: [
        { label: 'All trades', a: a.avgHoldSeconds,         b: b.avgHoldSeconds,         format: 'duration', higherIsBetter: null },
        { label: 'Winners',    a: a.avgHoldSecondsWinners,  b: b.avgHoldSecondsWinners,  format: 'duration', higherIsBetter: true },
        { label: 'Losers',     a: a.avgHoldSecondsLosers,   b: b.avgHoldSecondsLosers,   format: 'duration', higherIsBetter: false },
      ],
    },
    {
      title: 'Streaks',
      rows: [
        { label: 'Max consecutive wins',   a: a.maxConsecutiveWins,    b: b.maxConsecutiveWins,    format: 'int', higherIsBetter: true },
        { label: 'Max consecutive losses', a: a.maxConsecutiveLosses,  b: b.maxConsecutiveLosses,  format: 'int', higherIsBetter: false },
      ],
    },
  ]
}

function HeadlineStatTable({ a, b }: { a: PeriodMetrics; b: PeriodMetrics }) {
  const sections = buildSections(a, b)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {sections.map((s) => (
        <StatSectionCard key={s.title} section={s} />
      ))}
    </div>
  )
}

function StatSectionCard({ section }: { section: StatSection }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 pb-2">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-secondary">
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
    case 'pct':      return `${(v * 100).toFixed(0)}%`
    case 'int':      return `${Math.round(v)}`
    case 'ratio':    return Number.isFinite(v) ? v.toFixed(2) : '∞'
    case 'duration': return duration(v)
  }
}

function fmtDelta(delta: number | null, kind: FormatKind): string {
  if (delta == null) return '—'
  switch (kind) {
    case 'money':    return signed(delta)
    case 'pct':      return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0)}%`
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

  return (
    <div
      className={`grid h-8 grid-cols-[1fr_auto_auto] items-center gap-3 ${
        last ? '' : 'border-b border-border-subtle/40'
      }`}
    >
      <span className="text-sm text-fg-secondary">{spec.label}</span>
      <span className="font-mono text-xs tnum">
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

// ── Side-by-side bar chart ───────────────────────────────────────────────

function SideBySideBarChart({ comparison }: { comparison: ComparisonResult }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const goldHex = resolved === 'light' ? '#b8962e' : '#d4af37'
  const winHex = palette.win
  const data = useMemo(
    () =>
      comparison.dailyPnL.rows.map((r) => ({
        day: `D${r.dayIndex}`,
        A: r.valueA ?? 0,
        B: r.valueB ?? 0,
        dateA: r.dateA,
        dateB: r.dateB,
      })),
    [comparison],
  )

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            width={52}
          />
          <RechartsTooltip cursor={{ fill: 'rgba(127,127,127,0.05)' }} content={<SideBySideTooltip />} />
          <Legend
            verticalAlign="top"
            height={24}
            wrapperStyle={{ fontSize: 11, color: palette.axis }}
          />
          <Bar
            dataKey="A"
            name="Period A"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={`a-${i}`} fill={goldHex} fillOpacity={d.A === 0 ? 0.25 : 1} />
            ))}
          </Bar>
          <Bar
            dataKey="B"
            name="Period B"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={`b-${i}`} fill={winHex} fillOpacity={d.B === 0 ? 0.25 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SideBySideTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: { day: string; A: number; B: number; dateA: string | null; dateB: string | null } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">Day {d.day.slice(1)}</div>
      <div className="mt-1 flex flex-col gap-0.5 text-[11px]">
        <span className="font-mono text-gold tnum">
          A · {d.dateA ?? '—'}: {signed(d.A)}
        </span>
        <span className="font-mono text-win tnum">
          B · {d.dateB ?? '—'}: {signed(d.B)}
        </span>
      </div>
    </div>
  )
}

// ── Cumulative overlay ───────────────────────────────────────────────────

function CumulativeOverlayChart({ comparison }: { comparison: ComparisonResult }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const goldHex = resolved === 'light' ? '#b8962e' : '#d4af37'
  const winHex = palette.win
  const data = useMemo(
    () =>
      comparison.cumulativePnL.rows.map((r) => ({
        day: `D${r.dayIndex}`,
        A: r.valueA,
        B: r.valueB,
      })),
    [comparison],
  )

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            width={52}
          />
          <RechartsTooltip content={<OverlayTooltip />} />
          <Legend
            verticalAlign="top"
            height={24}
            wrapperStyle={{ fontSize: 11, color: palette.axis }}
          />
          <Line
            type="monotone"
            dataKey="A"
            name="Period A"
            stroke={goldHex}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="B"
            name="Period B"
            stroke={winHex}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function OverlayTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: { day: string; A: number | null; B: number | null } }[]
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
          <span className="font-mono text-win tnum">B: {signed(d.B)}</span>
        )}
      </div>
    </div>
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
  const goldHex = resolved === 'light' ? '#b8962e' : '#d4af37'
  const winHex = palette.win

  const breakdown = useMemo(
    () => computeBreakdownComparison(trades, rangeA, rangeB, dimension, sentimentByDate),
    [trades, rangeA, rangeB, dimension, sentimentByDate],
  )

  // Drop rows that have no trades AND no P&L in either period — they'd
  // otherwise render as a label with two empty placeholders, eating
  // horizontal space for nothing.
  const data = useMemo(
    () =>
      breakdown.rows
        .filter((r) => r.tradesA > 0 || r.tradesB > 0)
        .map((r) => ({
          key: r.key,
          A: r.netPnLA,
          B: r.netPnLB,
          tradesA: r.tradesA,
          tradesB: r.tradesB,
        })),
    [breakdown],
  )

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
        <span className="font-mono text-[10px] text-fg-tertiary">
          {data.length} {data.length === 1 ? 'row' : 'rows'}
        </span>
      </button>
      {open && (
        <div className="flex-1 border-t border-border-subtle p-3">
          {data.length === 0 ? (
            <div className="py-3 text-center text-xs text-fg-tertiary">
              No data for this dimension in either period.
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
                    angle={data.length > 6 ? -30 : 0}
                    textAnchor={data.length > 6 ? 'end' : 'middle'}
                    height={data.length > 6 ? 44 : 18}
                  />
                  <YAxis
                    stroke={palette.axis}
                    fontSize={9}
                    tickLine={false}
                    axisLine={{ stroke: palette.grid }}
                    tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                    width={44}
                  />
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
                            <span className="font-mono text-win tnum">
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
