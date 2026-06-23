import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowRight, ArrowUp, GitCompareArrows } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { percent, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import {
  computePeriodMetrics,
  rangeForPreset,
  type DateRange,
  type PeriodMetrics,
} from '@/core/performance'
import Card from '@/components/ui/Card'
import type { TradeListRow } from '@shared/trades-types'

// Premium "Compare periods" card above the Calendar grid. Replaces the old dry
// inline strip: a gold-A / teal-B side-by-side glance (this week/month vs the
// prior period) with three labeled green/red deltas (net P&L, win rate, P/L
// ratio), plus a launcher into the full Analytics → Compare tab deep-linked to
// the SAME two ranges. Roll-up uses /src/core/performance (the same pure module
// the Compare tab uses), so the numbers agree. Period identity = gold (A) /
// teal (B); green/red is reserved for the delta direction only.

type CompareMode = 'off' | 'week' | 'month'

const STORAGE_KEY = 'fugaedge-calendar-compare'

// The two presets per mode — the SAME rangeForPreset ranges the full Compare
// tab consumes, so "Open full comparison" is a clean DateRange-to-DateRange
// handoff (no conversion).
function rangesFor(mode: 'week' | 'month'): { a: DateRange; b: DateRange } {
  return mode === 'week'
    ? { a: rangeForPreset('thisWeek'), b: rangeForPreset('lastWeek') }
    : { a: rangeForPreset('thisMonth'), b: rangeForPreset('lastMonth') }
}

interface CalendarCompareStripProps {
  /** Bumps when imports/edits invalidate the trades cache. Re-fetch on change. */
  dataVersion?: number
}

export default function CalendarCompareStrip({ dataVersion = 0 }: CalendarCompareStripProps) {
  const navigate = useNavigate()
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const [mode, setMode] = useState<CompareMode>(() => {
    if (typeof window === 'undefined') return 'off'
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'week' || stored === 'month' || stored === 'off') return stored
    return 'off'
  })

  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Only fetch trades when the card is active — keeps the calendar's first
  // paint fast for users who don't use this feature.
  useEffect(() => {
    if (mode === 'off') return
    let cancelled = false
    setLoading(true)
    ipc
      .tradesList()
      .then((rows) => {
        if (cancelled) return
        setTrades(rows.filter((t) => !t.is_open))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setTrades([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [mode, dataVersion])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const computed = useMemo(() => {
    if (mode === 'off' || !trades) return null
    const { a: rangeA, b: rangeB } = rangesFor(mode)
    return {
      a: computePeriodMetrics(trades, rangeA),
      b: computePeriodMetrics(trades, rangeB),
      rangeA,
      rangeB,
    }
  }, [mode, trades])

  // Land in the full Compare tab pre-filled with the current mode's two ranges.
  const openFull = () => {
    if (!computed) return
    const { rangeA, rangeB } = computed
    const qs = new URLSearchParams({
      tab: 'compare',
      aFrom: rangeA.from,
      aTo: rangeA.to,
      bFrom: rangeB.from,
      bTo: rangeB.to,
    })
    navigate(`/analytics?${qs.toString()}`)
  }

  return (
    <Card
      title="Compare periods"
      subtitle="This period vs the one before, at a glance."
      hover={false}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ModeChip active={mode === 'week'} onClick={() => setMode('week')}>
            This Week vs Last Week
          </ModeChip>
          <ModeChip active={mode === 'month'} onClick={() => setMode('month')}>
            This Month vs Last Month
          </ModeChip>
          <ModeChip active={mode === 'off'} onClick={() => setMode('off')}>
            Off
          </ModeChip>
        </div>

        {mode === 'off' ? (
          <p className="text-xs text-fg-tertiary">
            Pick This Week or This Month to compare it against the prior period.
          </p>
        ) : loading || !computed ? (
          <div className="text-xs text-fg-tertiary">Loading comparison…</div>
        ) : (
          <Glance
            a={computed.a}
            b={computed.b}
            mode={mode}
            sideA={palette.sideA}
            sideB={palette.sideB}
            onOpenFull={openFull}
          />
        )}
      </div>
    </Card>
  )
}

// ── The glance: A (gold) | three labeled deltas | B (teal), then the launcher.

interface DeltaView {
  value: string
  tone: string
  Icon: typeof ArrowUp | null
}

// One delta (this period minus last period) with a green(better) / red(worse) /
// grey(flat or n/a) direction. Coverage-honest: when either side is
// null/non-finite the delta is "—" — never computed against null, never a
// misleading 0.
function deltaView(
  aVal: number | null,
  bVal: number | null,
  fmtDelta: (d: number) => string,
): DeltaView {
  if (aVal == null || bVal == null || !Number.isFinite(aVal) || !Number.isFinite(bVal)) {
    return { value: '—', tone: 'text-fg-tertiary', Icon: null }
  }
  const d = aVal - bVal
  return {
    value: fmtDelta(d),
    tone: d === 0 ? 'text-fg-tertiary' : d > 0 ? 'text-win' : 'text-loss',
    Icon: d === 0 ? null : d > 0 ? ArrowUp : ArrowDown,
  }
}

// P/L ratio = winLossRatio (avg winner / |avg loser|, the full Compare tab's
// "Profit/Loss ratio") to 2 decimals; "—" when null/non-finite.
function fmtRatio(v: number | null): string {
  return v == null || !Number.isFinite(v) ? '—' : v.toFixed(2)
}

function Glance({
  a,
  b,
  mode,
  sideA,
  sideB,
  onOpenFull,
}: {
  a: PeriodMetrics
  b: PeriodMetrics
  mode: 'week' | 'month'
  sideA: string
  sideB: string
  onOpenFull: () => void
}) {
  const labelA = mode === 'week' ? 'This week' : 'This month'
  const labelB = mode === 'week' ? 'Last week' : 'Last month'

  // Three deltas (this period minus last period). Net P&L always computes; win
  // rate and P/L ratio are coverage-honest ("—" when either side lacks data).
  const netD = deltaView(a.netPnL, b.netPnL, (d) => signed(d))
  const wrD = deltaView(a.winRate, b.winRate, (d) => `${d >= 0 ? '+' : ''}${percent(d, 0)}`)
  const plrD = deltaView(
    a.winLossRatio,
    b.winLossRatio,
    (d) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}`,
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border-subtle/50 bg-bg-1/40 px-4 py-3">
        <PeriodSide label={labelA} color={sideA} m={a} />
        <div className="flex flex-col items-center gap-1.5 px-1">
          <MiniDelta label="Net P&L" view={netD} />
          <MiniDelta label="Win rate" view={wrD} />
          <MiniDelta label="P/L ratio" view={plrD} />
        </div>
        <PeriodSide label={labelB} color={sideB} m={b} align="right" />
      </div>

      <button
        type="button"
        onClick={onOpenFull}
        className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/[0.08] px-3 text-[11px] font-semibold uppercase tracking-wider text-gold transition-colors duration-150 hover:border-gold/60 hover:bg-gold/[0.14]"
      >
        <GitCompareArrows size={13} strokeWidth={2} />
        Open full comparison
        <ArrowRight size={13} strokeWidth={2.25} />
      </button>
    </div>
  )
}

// One period column: gold/teal identity label, the prominent net P&L (green/red
// by sign), then a readable trades · WR line and the P/L ratio.
function PeriodSide({
  label,
  color,
  m,
  align = 'left',
}: {
  label: string
  color: string
  m: PeriodMetrics
  align?: 'left' | 'right'
}) {
  const wr = m.winRate == null ? '—' : percent(m.winRate, 0)
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div
        className="text-[11px] font-semibold uppercase tracking-wider"
        style={{ color }}
      >
        {label}
      </div>
      <div
        className={`mt-1 font-mono text-xl font-semibold ${
          m.netPnL >= 0 ? 'text-win' : 'text-loss'
        }`}
      >
        {signed(m.netPnL)}
      </div>
      <div className="mt-1 font-mono text-[13px] text-fg-secondary">
        {m.trades} {m.trades === 1 ? 'trade' : 'trades'} · {wr} WR
      </div>
      <div className="font-mono text-[13px] text-fg-secondary">
        {fmtRatio(m.winLossRatio)} P/L
      </div>
    </div>
  )
}

// One labeled delta in the middle stack: a small label above the signed value +
// an up/down arrow, colored by improvement direction (green better / red worse).
function MiniDelta({ label, view }: { label: string; view: DeltaView }) {
  const { value, tone, Icon } = view
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-[9px] uppercase tracking-wider text-fg-tertiary">{label}</span>
      <span className={`inline-flex items-center gap-0.5 font-mono text-[13px] font-semibold ${tone}`}>
        {value}
        {Icon && <Icon size={11} strokeWidth={2.5} />}
      </span>
    </div>
  )
}

function ModeChip({
  children,
  active,
  onClick,
}: {
  children: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-md border px-2.5 py-1 text-[10px] uppercase tracking-wider transition-colors duration-150 ${
        active
          ? 'border-gold/60 bg-gold/[0.12] text-gold'
          : 'border-border-strong bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
      }`}
    >
      {children}
    </button>
  )
}
