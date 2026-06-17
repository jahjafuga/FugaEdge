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
import type { EquityPoint } from '@shared/analytics-types'
import { money, signed, shortDate, longDate } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

// Dashboard Cumulative P&L curve. BORROWS the calendar IntradayPnLChart's
// RENDERING — a smooth monotone line with a green-above-$0 / red-below-$0
// zero-split gradient (fill + stroke) over a dashed zero baseline — but consumes
// the dashboard's pre-built EquityPoint[] (window-relative cumulative series
// from toCumulativeEquity), NOT trade/fill data. Dashboard-specific on purpose:
// it touches neither the shared analytics EquityChart (Analytics curve stays
// gold) nor the calendar IntradayPnLChart (calendar/Journal stay as-is). Pure
// presentational — recharts + theme palette only, no electron/DB.

interface CumulativePnlChartProps {
  equity: EquityPoint[]
  /** Chart height in px. Defaults to 260 (matches the old EquityChart slot). */
  height?: number
}

// Chart-specific gradient ids so the two gradients never collide with
// EquityChart's 'equityFill' or IntradayPnLChart's 'intradayPnl' on a page that
// renders more than one P&L curve.
const FILL_ID = 'dashCumPnlFill'
const STROKE_ID = 'dashCumPnlStroke'

export default function CumulativePnlChart({ equity, height = 260 }: CumulativePnlChartProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const data = useMemo(
    () => equity.map((p) => ({ ...p, label: shortDate(p.date) })),
    [equity],
  )

  // Zero-split: where $0 sits as a fraction from the TOP of the value range, so
  // the gradient renders green above the zero line / red below — for ANY number
  // of zero-crossings and a mostly-underwater series. The ,0-clamped max/min
  // put $0 inside the range (all-positive → offset 1 / all-green; all-negative →
  // offset 0 / all-red). The SAME [min, max] is handed to the YAxis domain so
  // the color switch lands ON the dashed zero line — recharts would otherwise
  // pad the domain and float the switch a few px off (the recon's alignment
  // risk). A flat all-$0 series falls back to a tiny symmetric span.
  const { zeroOffset, yMin, yMax } = useMemo(() => {
    if (data.length === 0) return { zeroOffset: 0.5, yMin: -1, yMax: 1 }
    const vals = data.map((p) => p.cumulative_net_pnl)
    const max = Math.max(...vals, 0)
    const min = Math.min(...vals, 0)
    const range = max - min
    if (range === 0) return { zeroOffset: 0.5, yMin: -1, yMax: 1 }
    return { zeroOffset: Math.max(0, Math.min(1, max / range)), yMin: min, yMax: max }
  }, [data])

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-fg-tertiary"
        style={{ height }}
      >
        No P&L history in this range yet.
      </div>
    )
  }

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {/* Fill — green fading toward zero above, red fading from zero below. */}
            <linearGradient id={FILL_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={palette.win} stopOpacity={0.3} />
              <stop offset={zeroOffset} stopColor={palette.win} stopOpacity={0.05} />
              <stop offset={zeroOffset} stopColor={palette.loss} stopOpacity={0.05} />
              <stop offset="1" stopColor={palette.loss} stopOpacity={0.3} />
            </linearGradient>
            {/* Stroke — hard green/red switch exactly at the zero line. */}
            <linearGradient id={STROKE_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={palette.win} stopOpacity={1} />
              <stop offset={zeroOffset} stopColor={palette.win} stopOpacity={1} />
              <stop offset={zeroOffset} stopColor={palette.loss} stopOpacity={1} />
              <stop offset="1" stopColor={palette.loss} stopOpacity={1} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            interval="preserveStartEnd"
            minTickGap={32}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            tickFormatter={(v: number) => compactMoney(v)}
            width={56}
            domain={[yMin, yMax]}
          />
          <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ stroke: palette.grid, strokeWidth: 1 }}
            content={<CumulativeTooltip />}
          />
          <Area
            type="monotone"
            dataKey="cumulative_net_pnl"
            stroke={`url(#${STROKE_ID})`}
            strokeWidth={1.75}
            fill={`url(#${FILL_ID})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CumulativeTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: EquityPoint & { label: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.cumulative_net_pnl >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary tnum">{longDate(d.date)}</div>
      <div
        className={`mt-1 font-mono text-sm font-semibold tnum ${positive ? 'text-win' : 'text-loss'}`}
      >
        {signed(d.cumulative_net_pnl)}
      </div>
      <div className="mt-1 font-mono text-[11px] text-fg-tertiary tnum">day {signed(d.daily_pnl)}</div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
