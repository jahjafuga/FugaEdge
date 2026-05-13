import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import { signed } from '@/lib/format'
import {
  computePeriodMetrics,
  rangeForPreset,
  type PeriodMetrics,
} from '@/core/performance'
import type { TradeListRow } from '@shared/trades-types'

type CompareMode = 'off' | 'week' | 'month'

const STORAGE_KEY = 'fugaedge-calendar-compare'

interface CalendarCompareStripProps {
  /** Bumps when imports/edits invalidate the trades cache. Re-fetch on change. */
  dataVersion?: number
}

// Compact "this week vs last week" / "this month vs last month" header
// shown directly above the Calendar's month grid. Uses /src/core/performance
// for the period roll-up — same pure module the Reports → Overview compare
// view uses, so numbers stay consistent.

export default function CalendarCompareStrip({ dataVersion = 0 }: CalendarCompareStripProps) {
  const [mode, setMode] = useState<CompareMode>(() => {
    if (typeof window === 'undefined') return 'off'
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'week' || stored === 'month' || stored === 'off') return stored
    return 'off'
  })

  const [trades, setTrades] = useState<TradeListRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  // Only fetch trades when the strip is active — keeps the calendar's
  // initial paint fast for users who don't use this feature.
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
    const a = computePeriodMetrics(
      trades,
      rangeForPreset(mode === 'week' ? 'thisWeek' : 'thisMonth'),
    )
    const b = computePeriodMetrics(
      trades,
      rangeForPreset(mode === 'week' ? 'lastWeek' : 'lastMonth'),
    )
    return { a, b }
  }, [mode, trades])

  return (
    <div className="rounded-md border border-border-subtle bg-bg-2 px-3 py-2 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
          Compare
        </span>
        <Chip active={mode === 'week'} onClick={() => setMode('week')}>
          This Week vs Last Week
        </Chip>
        <Chip active={mode === 'month'} onClick={() => setMode('month')}>
          This Month vs Last Month
        </Chip>
        <Chip active={mode === 'off'} onClick={() => setMode('off')}>
          Off
        </Chip>
      </div>
      {mode !== 'off' && (
        <div className="mt-2 border-t border-border-subtle/60 pt-2">
          {loading ? (
            <div className="text-xs text-fg-tertiary">Loading comparison…</div>
          ) : computed ? (
            <CompareSummary a={computed.a} b={computed.b} mode={mode} />
          ) : null}
        </div>
      )}
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors duration-150 ${
        active
          ? 'border-gold/60 bg-gold/[0.12] text-gold'
          : 'border-border-strong bg-bg-1 text-fg-tertiary hover:border-gold/40 hover:text-gold'
      }`}
    >
      {children}
    </button>
  )
}

function CompareSummary({
  a,
  b,
  mode,
}: {
  a: PeriodMetrics
  b: PeriodMetrics
  mode: 'week' | 'month'
}) {
  const labelA = mode === 'week' ? 'This week' : 'This month'
  const labelB = mode === 'week' ? 'Last week' : 'Last month'

  const fmtWR = (w: number | null): string =>
    w == null ? '—' : `${Math.round(w * 100)}%`

  const netDelta = a.netPnL - b.netPnL
  const tradesDelta = a.trades - b.trades
  const wrA = a.winRate
  const wrB = b.winRate
  const wrDelta = wrA != null && wrB != null ? wrA - wrB : null

  return (
    <div className="flex flex-col gap-1 text-sm">
      <div className="text-fg-secondary">
        <span className="font-medium text-fg-primary">{labelA}:</span>{' '}
        <span className={`font-mono ${a.netPnL >= 0 ? 'text-win' : 'text-loss'}`}>
          {signed(a.netPnL)}
        </span>{' '}
        <span className="font-mono text-fg-tertiary">
          ({a.trades} {a.trades === 1 ? 'trade' : 'trades'}, {fmtWR(wrA)} WR)
        </span>{' '}
        <span className="text-fg-tertiary">vs</span>{' '}
        <span className="font-medium text-fg-secondary">{labelB}:</span>{' '}
        <span className={`font-mono ${b.netPnL >= 0 ? 'text-win' : 'text-loss'}`}>
          {signed(b.netPnL)}
        </span>{' '}
        <span className="font-mono text-fg-tertiary">
          ({b.trades} {b.trades === 1 ? 'trade' : 'trades'}, {fmtWR(wrB)} WR)
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px]">
        <DeltaChip
          label="Δ"
          value={signed(netDelta)}
          // For P&L: positive = improvement
          dir={netDelta === 0 ? 'flat' : netDelta > 0 ? 'up' : 'down'}
          improvement={netDelta >= 0}
        />
        <DeltaChip
          label="trades"
          value={`${tradesDelta >= 0 ? '+' : ''}${tradesDelta}`}
          // For trade count: more or fewer trades isn't intrinsically good
          // or bad — show grey direction.
          dir={tradesDelta === 0 ? 'flat' : tradesDelta > 0 ? 'up' : 'down'}
          improvement={null}
        />
        <DeltaChip
          label="WR"
          value={wrDelta == null ? '—' : `${wrDelta >= 0 ? '+' : ''}${Math.round(wrDelta * 100)}%`}
          dir={
            wrDelta == null
              ? 'flat'
              : wrDelta === 0
                ? 'flat'
                : wrDelta > 0
                  ? 'up'
                  : 'down'
          }
          improvement={wrDelta != null && wrDelta >= 0}
        />
      </div>
    </div>
  )
}

function DeltaChip({
  label,
  value,
  dir,
  improvement,
}: {
  label: string
  value: string
  dir: 'up' | 'down' | 'flat'
  /** true = improvement (green), false = regression (red), null = neutral (grey). */
  improvement: boolean | null
}) {
  const tone =
    improvement === null
      ? 'text-fg-tertiary'
      : improvement
        ? 'text-win'
        : 'text-loss'
  const Icon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : ArrowRight
  return (
    <span className={`inline-flex items-center gap-1 ${tone}`}>
      <span className="text-fg-tertiary">{label}</span>
      <span className="tnum">{value}</span>
      <Icon size={11} strokeWidth={2.25} />
    </span>
  )
}
