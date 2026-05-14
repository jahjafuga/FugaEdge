import { useMemo } from 'react'
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EquityPoint, MaxDrawdown } from '@shared/analytics-types'
import { money, signed, longDate, shortDate } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { CUMULATIVE_LINE_TYPE } from '@/core/charts/cumulativeStyle'

interface EquityChartProps {
  equity: EquityPoint[]
  maxDrawdown: MaxDrawdown | null
}

export default function EquityChart({ equity, maxDrawdown }: EquityChartProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  if (equity.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-fg-tertiary">
        No equity history yet.
      </div>
    )
  }

  const data = equity.map((p) => ({
    ...p,
    label: shortDate(p.date),
  }))

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af37" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#d4af37" stopOpacity={0} />
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
            tickFormatter={compactMoney}
            width={60}
          />
          <Tooltip
            cursor={{ stroke: palette.grid, strokeWidth: 1 }}
            content={<EquityTooltip />}
          />

          {maxDrawdown && (
            <ReferenceArea
              x1={shortDate(maxDrawdown.peak_date)}
              x2={shortDate(maxDrawdown.trough_date)}
              fill="#f87171"
              fillOpacity={0.08}
              stroke="#f87171"
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          )}

          <Area
            type={CUMULATIVE_LINE_TYPE}
            dataKey="cumulative_net_pnl"
            stroke="none"
            fill="url(#equityFill)"
            isAnimationActive={false}
          />
          <Line
            type={CUMULATIVE_LINE_TYPE}
            dataKey="cumulative_net_pnl"
            stroke="#d4af37"
            strokeWidth={1.75}
            dot={false}
            activeDot={{ r: 3, fill: '#d4af37', stroke: '#0d0f14', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function EquityTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: EquityPoint & { label: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-xs text-fg-secondary">{longDate(d.date)}</div>
      <div className="mt-1 font-mono text-sm font-medium text-gold">
        {signed(d.cumulative_net_pnl)}
      </div>
      <div className="mt-1 text-[11px] text-fg-tertiary">
        day {signed(d.daily_pnl)}
      </div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
