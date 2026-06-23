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
import type { CalendarYearMonth } from '@shared/calendar-types'
import { money, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface YearCumulativeChartProps {
  /** The 12 months (Jan..Dec) from the year payload. */
  months: CalendarYearMonth[]
  height?: number
}

interface Point {
  label: string
  cumulative: number
  monthNet: number
}

// v0.3.0 Yearly View — cumulative net-P&L curve under the 12-tile grid. Renders
// with the SAME green-above-zero / red-below-zero sign-split treatment as the
// calendar's daily Intraday P&L curve and the weekly cumulative curve (the
// shared IntradayPnLChart): a vertical fill+stroke gradient split at the zero
// line, over a dashed zero baseline, themed via chartColors. Data is a 12-point
// Jan->Dec running total of each month's net P&L (no-trade months carry forward
// flat). IntradayPnLChart is coupled to trade/fill data, so the year supplies its
// own monthly series and mirrors that chart's rendering (the curve is the shared
// language, not the component). Pure presentational — recharts + theme palette.
export default function YearCumulativeChart({ months, height = 240 }: YearCumulativeChartProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const data = useMemo<Point[]>(() => {
    let running = 0
    return months.map((m, i) => {
      running += m.net_pnl
      return { label: MONTHS[i], cumulative: running, monthNet: m.net_pnl }
    })
  }, [months])

  // Zero-split: where $0 sits as a fraction from the TOP of the value range, so
  // the gradient renders green above zero / red below. The 0-clamped max/min put
  // $0 inside the range (all-positive -> offset 1 / all-green; all-negative ->
  // offset 0 / all-red), and the SAME [min,max] is the YAxis domain so the color
  // switch lands ON the dashed zero line (recharts would otherwise pad the domain
  // and float it a few px off). Mirrors IntradayPnLChart + CumulativePnlChart.
  const { zeroOffset, yMin, yMax } = useMemo(() => {
    const vals = data.map((p) => p.cumulative)
    const max = Math.max(...vals, 0)
    const min = Math.min(...vals, 0)
    const range = max - min
    if (range === 0) return { zeroOffset: 0.5, yMin: -1, yMax: 1 }
    return { zeroOffset: Math.max(0, Math.min(1, max / range)), yMin: min, yMax: max }
  }, [data])

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            {/* Fill — green fading toward zero above, red fading from zero below. */}
            <linearGradient id="yearCumPnl" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={palette.win} stopOpacity={0.3} />
              <stop offset={zeroOffset} stopColor={palette.win} stopOpacity={0.05} />
              <stop offset={zeroOffset} stopColor={palette.loss} stopOpacity={0.05} />
              <stop offset="1" stopColor={palette.loss} stopOpacity={0.3} />
            </linearGradient>
            {/* Stroke — hard green/red switch exactly at the zero line. */}
            <linearGradient id="yearCumPnl-stroke" x1="0" y1="0" x2="0" y2="1">
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
            interval={0}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            tickFormatter={compactMoney}
            width={56}
            domain={[yMin, yMax]}
          />
          <ReferenceLine y={0} stroke={palette.grid} strokeDasharray="3 3" />
          <Tooltip cursor={{ stroke: palette.grid, strokeWidth: 1 }} content={<CumTooltip />} />
          <Area
            type="monotone"
            dataKey="cumulative"
            stroke="url(#yearCumPnl-stroke)"
            strokeWidth={1.75}
            fill="url(#yearCumPnl)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function CumTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: Point }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.cumulative >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary tnum">{d.label}</div>
      <div
        className={`mt-1 font-mono text-sm font-semibold tnum ${positive ? 'text-win' : 'text-loss'}`}
      >
        {signed(d.cumulative)}
      </div>
      <div className="mt-1 font-mono text-[11px] text-fg-tertiary tnum">month {signed(d.monthNet)}</div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) return `${n < 0 ? '−' : ''}$${(Math.abs(n) / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
