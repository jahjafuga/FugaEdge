import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TradeListRow } from '@shared/trades-types'
import { signed, money } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

// Reusable intraday P&L curve. Shows running net P&L across the trading day
// computed at every closing fill. Used in both the Calendar day panel and
// the Journal page.
//
// Algorithm: each round-trip trade's net_pnl is distributed across its
// closing fills (sells for longs, buys for shorts), prorated by qty. Then
// every closing fill across all the day's trades is sorted by time and
// accumulated. This gives fill-level resolution while keeping the math
// trivial — each trade's slice always sums to that trade's exact net_pnl.

interface IntradayPnLChartProps {
  /** All round-trip trades for the day. Order doesn't matter — internally
   *  flattened and sorted by closing-fill timestamp. */
  trades: TradeListRow[]
  /** YYYY-MM-DD — used only for tooltip labels. */
  date: string
  /** Chart height in px. Defaults to 160 per the spec. */
  height?: number
}

interface CurvePoint {
  /** Epoch ms for the fill that produced this point. */
  t: number
  /** Cumulative running P&L through (and including) this fill. */
  pnl: number
  /** Pre-formatted time-of-day label for the X axis. */
  label: string
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function buildCurve(trades: TradeListRow[]): CurvePoint[] {
  // Collect every closing fill with its prorated P&L portion.
  const closings: { t: number; pnlPortion: number }[] = []
  for (const trade of trades) {
    const closingSide = trade.side === 'short' ? 'B' : 'S'
    const closingFills = trade.executions.filter((e) => e.side === closingSide)
    if (closingFills.length === 0) continue
    const totalQty = closingFills.reduce((s, f) => s + f.qty, 0)
    if (totalQty <= 0) continue
    for (const f of closingFills) {
      const epoch = Date.parse(f.time.includes('Z') ? f.time : `${f.time}Z`)
      if (!Number.isFinite(epoch)) continue
      closings.push({
        t: epoch,
        pnlPortion: (f.qty / totalQty) * trade.net_pnl,
      })
    }
  }

  if (closings.length === 0) return []

  closings.sort((a, b) => a.t - b.t)

  // Seed the curve with a zero point at the first close minus 1 minute so
  // the chart starts visibly at zero, not at the first realized P&L value.
  const firstT = closings[0].t - 60_000
  const out: CurvePoint[] = [{ t: firstT, pnl: 0, label: timeOf(firstT) }]
  let running = 0
  for (const c of closings) {
    running += c.pnlPortion
    out.push({ t: c.t, pnl: running, label: timeOf(c.t) })
  }
  return out
}

function timeOf(epochMs: number): string {
  const d = new Date(epochMs)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function IntradayPnLChart({ trades, date, height = 160 }: IntradayPnLChartProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const data = useMemo(() => buildCurve(trades), [trades])

  // Position of the zero baseline as a fraction from the top of the chart's
  // value range. Used to split the area fill into a green-above / red-below
  // gradient. When max <= 0 the whole fill is red; min >= 0 → all green.
  const { gradientId, zeroOffset, hasData } = useMemo(() => {
    if (data.length === 0) {
      return { gradientId: 'intradayPnl', zeroOffset: 0.5, hasData: false }
    }
    const vals = data.map((p) => p.pnl)
    const max = Math.max(...vals, 0)
    const min = Math.min(...vals, 0)
    const range = max - min
    const offset = range > 0 ? max / range : 0.5
    return {
      gradientId: 'intradayPnl',
      zeroOffset: Math.max(0, Math.min(1, offset)),
      hasData: true,
    }
  }, [data])

  if (!hasData) {
    return (
      <div
        className="rounded-lg border border-border-subtle bg-bg-2 px-4 py-6 text-center text-sm text-fg-tertiary shadow-sm"
        style={{ minHeight: height }}
      >
        No realized P&L curve for {date} — closing fills haven't landed yet.
      </div>
    )
  }

  const finalPnl = data[data.length - 1]?.pnl ?? 0

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-2 p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
        <div className="font-mono text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
          Intraday P&amp;L
        </div>
        <div
          className={`font-mono text-sm font-semibold tnum ${
            finalPnl >= 0 ? 'text-win' : 'text-loss'
          }`}
        >
          {signed(finalPnl)}
        </div>
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                {/* Top of value range → near-saturated green */}
                <stop offset="0" stopColor={palette.win} stopOpacity={0.30} />
                {/* Just above zero → faded green */}
                <stop offset={zeroOffset} stopColor={palette.win} stopOpacity={0.05} />
                {/* Just below zero → faded red */}
                <stop offset={zeroOffset} stopColor={palette.loss} stopOpacity={0.05} />
                {/* Bottom of value range → near-saturated red */}
                <stop offset="1" stopColor={palette.loss} stopOpacity={0.30} />
              </linearGradient>
              <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={palette.win} stopOpacity={1} />
                <stop offset={zeroOffset} stopColor={palette.win} stopOpacity={1} />
                <stop offset={zeroOffset} stopColor={palette.loss} stopOpacity={1} />
                <stop offset="1" stopColor={palette.loss} stopOpacity={1} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              stroke={palette.axis}
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              interval="preserveStartEnd"
              minTickGap={32}
            />
            <YAxis
              stroke={palette.axis}
              fontSize={10}
              tickLine={false}
              axisLine={{ stroke: palette.grid }}
              tickFormatter={(v: number) => compactMoney(v)}
              width={50}
            />
            <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />
            <Tooltip
              cursor={{ stroke: palette.grid, strokeWidth: 1 }}
              content={<IntradayTooltip date={date} />}
            />
            <Area
              type="monotone"
              dataKey="pnl"
              stroke={`url(#${gradientId}-stroke)`}
              strokeWidth={1.75}
              fill={`url(#${gradientId})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function IntradayTooltip({
  date,
  active,
  payload,
}: {
  date: string
  active?: boolean
  payload?: { payload: CurvePoint }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const positive = p.pnl >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary tnum">
        {date} · {p.label}
      </div>
      <div
        className={`mt-1 font-mono text-sm font-semibold tnum ${
          positive ? 'text-win' : 'text-loss'
        }`}
      >
        {signed(p.pnl)}
      </div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
