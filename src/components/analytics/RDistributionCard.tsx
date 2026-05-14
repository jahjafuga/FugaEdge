import { useMemo } from 'react'
import { Info } from 'lucide-react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '@/components/ui/Card'
import IconTooltip from '@/components/ui/Tooltip'
import type { RAnalytics, RBucket } from '@shared/analytics-types'
import { int, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

interface RDistributionCardProps {
  data: RAnalytics
}

const DASH = '—'

export default function RDistributionCard({ data }: RDistributionCardProps) {
  const hasData = data.coverage > 0
  const coveragePct =
    data.total_trades > 0 ? (data.coverage / data.total_trades) * 100 : 0

  return (
    <Card
      title="R-multiple distribution"
      subtitle="P&L per trade expressed as a multiple of planned risk."
      hover
      right={
        <IconTooltip
          content={
            <>
              Set a Planned risk ($) on each trade in the Trades-page expand row.
              R = net P&L / planned risk. Trades without planned risk are
              excluded from this card so the distribution isn't inflated by
              zeros.
            </>
          }
        >
          <Info size={14} strokeWidth={2} aria-hidden="true" className="cursor-help text-fg-tertiary" />
        </IconTooltip>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Expectancy"
          value={hasData && data.expectancy != null ? `${formatR(data.expectancy)} R` : DASH}
          tone={data.expectancy == null ? 'text-fg-tertiary' : data.expectancy >= 0 ? 'text-win' : 'text-loss'}
          detail="per trade · avg R"
        />
        <Stat
          label="Median R"
          value={hasData && data.median_r != null ? `${formatR(data.median_r)} R` : DASH}
          tone={data.median_r == null ? 'text-fg-tertiary' : data.median_r >= 0 ? 'text-win' : 'text-loss'}
        />
        <Stat
          label="Best R"
          value={data.best_r != null ? `${formatR(data.best_r)} R` : DASH}
          tone="text-win"
        />
        <Stat
          label="Worst R"
          value={data.worst_r != null ? `${formatR(data.worst_r)} R` : DASH}
          tone="text-loss"
        />
      </div>

      <div className="mt-4 text-[10px] uppercase tracking-wider text-fg-tertiary">
        Coverage{' '}
        <span className="ml-1 font-mono text-fg-primary">
          {int(data.coverage)} / {int(data.total_trades)}
        </span>
        <span className="ml-1 font-mono text-gold">
          {coveragePct.toFixed(0)}%
        </span>
      </div>

      <div className="mt-3">
        {hasData ? (
          <RBuckets buckets={data.buckets} />
        ) : (
          <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
            <div className="mb-1 uppercase tracking-wider text-gold">
              Awaiting data
            </div>
            Set a Planned risk ($) on a few trades to populate the R distribution.
          </div>
        )}
      </div>
    </Card>
  )
}

function Stat({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  tone: string
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div
        className={`mt-1 font-mono font-medium ${tone}`}
        style={{ fontSize: '20px', letterSpacing: '-0.02em', lineHeight: 1.1 }}
      >
        {value}
      </div>
      {detail && <div className="mt-1 text-[11px] text-fg-tertiary">{detail}</div>}
    </div>
  )
}

function formatR(r: number): string {
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}`
}

function RBuckets({ buckets }: { buckets: RBucket[] }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const data = buckets.map((b) => ({ ...b, label: b.key }))
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 4 }}>
          <defs>
            <linearGradient id="rGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.win} stopOpacity={1} />
              <stop offset="100%" stopColor={palette.win} stopOpacity={0.25} />
            </linearGradient>
            <linearGradient id="rRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={palette.loss} stopOpacity={1} />
              <stop offset="100%" stopColor={palette.loss} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const b = payload[0].payload as RBucket
              const positive = (b.range[0] ?? 0) >= 0
              return (
                <div className="rounded-md border border-white/[0.08] bg-bg-1/95 px-3 py-2 shadow-lg backdrop-blur">
                  <div className="font-mono text-xs text-fg-primary">{b.key}</div>
                  <div className="mt-1 font-mono text-[11px] text-fg-secondary">
                    {int(b.count)} {b.count === 1 ? 'trade' : 'trades'}
                  </div>
                  <div
                    className={`mt-1 font-mono text-sm ${positive ? 'text-win' : 'text-loss'}`}
                  >
                    {signed(b.net_pnl)}{' '}
                    <span className="text-[10px] text-fg-tertiary">total</span>
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="count" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((b) => (
              <Cell
                key={b.key}
                fill={(b.range[0] ?? 0) >= 0 ? 'url(#rGreen)' : 'url(#rRed)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

