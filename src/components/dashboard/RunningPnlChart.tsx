import { memo, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPnlPoint } from '@shared/dashboard-types'
import { money, signed, shortDate, longDate } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

interface RunningPnlChartProps {
  daily: DailyPnlPoint[]
}

function RunningPnlChartBase({ daily }: RunningPnlChartProps) {
  // Animate on first paint only; subsequent data swaps shouldn't churn frames.
  const [animate, setAnimate] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setAnimate(false), 350)
    return () => clearTimeout(t)
  }, [])

  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  const data = useMemo(() => {
    let running = 0
    return daily.map((d) => {
      running += d.net_pnl
      return { ...d, running, label: shortDate(d.date) }
    })
  }, [daily])

  if (daily.length === 0) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-fg-tertiary">
        No daily P&L data yet.
      </div>
    )
  }

  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
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
            tickFormatter={(v) => compactMoney(v)}
            width={56}
          />
          <Tooltip
            cursor={{ fill: 'rgba(127,127,127,0.05)' }}
            content={<ChartTooltip />}
          />
          <Bar dataKey="net_pnl" radius={[3, 3, 0, 0]} isAnimationActive={animate}>
            {data.map((d) => (
              <Cell key={d.date} fill={d.net_pnl >= 0 ? palette.win : palette.loss} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default memo(RunningPnlChartBase)

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: DailyPnlPoint & { running: number } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.net_pnl >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">{longDate(d.date)}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tnum ${positive ? 'text-win' : 'text-loss'}`}>
        {signed(d.net_pnl)}
      </div>
      <div className="mt-1 font-mono text-[11px] text-fg-tertiary tnum">
        {d.trade_count} {d.trade_count === 1 ? 'trade' : 'trades'}
        {' · '}
        running {signed(d.running)}
      </div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
