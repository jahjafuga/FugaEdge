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
import type { DrawdownInfo } from '@shared/reports-types'
import { int, longDate, money, pnlClass, shortDate, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

interface DrawdownSectionProps {
  drawdown: DrawdownInfo | null
}

export default function DrawdownSection({ drawdown }: DrawdownSectionProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  if (!drawdown) {
    return (
      <div className="px-5 py-10 text-center text-sm text-fg-tertiary">
        Not enough trading days yet to compute drawdown.
      </div>
    )
  }

  const hasDrawdown = drawdown.amount > 0
  const data = drawdown.equity.map((p) => ({
    ...p,
    label: shortDate(p.date),
  }))

  return (
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Max drawdown"
          value={hasDrawdown ? `-${money(drawdown.amount)}` : '—'}
          tone="text-loss"
          detail={
            hasDrawdown && drawdown.percent != null
              ? `−${(drawdown.percent * 100).toFixed(1)}%`
              : undefined
          }
        />
        <Stat
          label="Longest period"
          value={hasDrawdown ? `${int(drawdown.longest_period_days)}d` : '—'}
          tone="text-gold"
          detail="consecutive days below peak"
        />
        <Stat
          label="Current drawdown"
          value={
            drawdown.current_drawdown > 0
              ? `-${money(drawdown.current_drawdown)}`
              : '$0.00'
          }
          tone={drawdown.current_drawdown > 0 ? 'text-loss' : 'text-win'}
          detail={drawdown.current_drawdown > 0 ? 'below all-time peak' : 'at peak'}
        />
        <Stat
          label="Recovery"
          value={
            !hasDrawdown
              ? '—'
              : drawdown.recovered
                ? '✓ recovered'
                : 'in progress'
          }
          tone={drawdown.recovered ? 'text-win' : 'text-gold'}
          detail={
            drawdown.recovered && drawdown.recovery_date
              ? longDate(drawdown.recovery_date)
              : hasDrawdown && !drawdown.recovered
                ? 'not yet'
                : undefined
          }
        />
      </div>

      <div className="rounded-md border border-border-subtle/40 bg-bg-1/30 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">
            Equity curve · drawdown window shaded red
          </div>
          {hasDrawdown && (
            <div className="font-mono text-[11px] text-fg-tertiary">
              Peak{' '}
              <span className={pnlClass(drawdown.peak_value)}>
                {signed(drawdown.peak_value)}
              </span>{' '}
              <span className="text-fg-tertiary">·</span> Trough{' '}
              <span className={pnlClass(drawdown.trough_value)}>
                {signed(drawdown.trough_value)}
              </span>
            </div>
          )}
        </div>
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ddEquityFill" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(v: number) => compactMoney(v)}
                width={60}
              />
              <Tooltip
                cursor={{ stroke: palette.grid, strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const p = payload[0].payload as { date: string; cumulative: number; in_drawdown: boolean }
                  return (
                    <div className="rounded-md border border-border-subtle bg-bg-1/95 px-3 py-2 shadow-lg backdrop-blur">
                      <div className="font-mono text-xs text-fg-secondary">{longDate(p.date)}</div>
                      <div className="mt-1 font-mono text-sm font-medium text-gold">
                        {signed(p.cumulative)}
                      </div>
                      {p.in_drawdown && (
                        <div className="mt-1 text-[10px] uppercase tracking-wider text-loss">
                          in drawdown
                        </div>
                      )}
                    </div>
                  )
                }}
              />

              {hasDrawdown && (
                <ReferenceArea
                  x1={shortDate(drawdown.peak_date)}
                  x2={shortDate(drawdown.trough_date)}
                  fill="#f87171"
                  fillOpacity={0.1}
                  stroke="#f87171"
                  strokeOpacity={0.35}
                  strokeDasharray="3 3"
                />
              )}

              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="none"
                fill="url(#ddEquityFill)"
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#d4af37"
                strokeWidth={1.75}
                dot={false}
                activeDot={{ r: 3, fill: '#d4af37', stroke: '#0d0f14', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {!hasDrawdown && (
          <div className="mt-3 text-center text-xs text-fg-tertiary">
            Equity curve has only gone up so far — no drawdown to chart.
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  detail,
}: {
  label: string
  value: React.ReactNode
  tone: string
  detail?: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-border-subtle/40 bg-bg-1/30 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className={`mt-1 font-mono text-xl font-medium tracking-tight ${tone}`}>
        {value}
      </div>
      {detail && <div className="mt-1 text-[11px] text-fg-tertiary">{detail}</div>}
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}

