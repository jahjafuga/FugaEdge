import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import Card from '@/components/ui/Card'
import Tooltip, { InfoIcon } from '@/components/ui/Tooltip'
import { money, shortDate, longDate, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import type {
  CumulativePoint,
  DailyPnLPoint,
  DailyVolumePoint,
  DailyWinRatePoint,
} from '@/core/performance'

interface NormalChartsProps {
  daily: DailyPnLPoint[]
  cumulative: CumulativePoint[]
  volume: DailyVolumePoint[]
  winRate: DailyWinRatePoint[]
  /** Label used in the chart titles, e.g. "30 days", "Custom". */
  rangeLabel: string
}

export default function NormalCharts(props: NormalChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <DailyPnLCard daily={props.daily} rangeLabel={props.rangeLabel} />
      <CumulativePnLCard cumulative={props.cumulative} rangeLabel={props.rangeLabel} />
      <DailyVolumeCard volume={props.volume} rangeLabel={props.rangeLabel} />
      <DailyWinRateCard winRate={props.winRate} rangeLabel={props.rangeLabel} />
    </div>
  )
}

// ── Daily P&L bar chart ──────────────────────────────────────────────────

function DailyPnLCard({
  daily,
  rangeLabel,
}: {
  daily: DailyPnLPoint[]
  rangeLabel: string
}) {
  const navigate = useNavigate()
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const data = useMemo(
    () => daily.map((d) => ({ ...d, label: shortDate(d.date) })),
    [daily],
  )

  return (
    <Card
      title={`Daily P&L (${rangeLabel})`}
      right={
        <Tooltip content="Net P&L per trading day. Green bars closed positive, red bars closed negative. Click a bar to jump to that day in Calendar.">
          <InfoIcon />
        </Tooltip>
      }
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
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
                tickFormatter={compactMoney}
                width={52}
              />
              <RechartsTooltip cursor={{ fill: 'rgba(127,127,127,0.05)' }} content={<DailyPnLTooltip />} />
              <Bar
                dataKey="pnl"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
                onClick={(payload: { date?: string }) => {
                  if (payload?.date) navigate(`/calendar?date=${payload.date}`)
                }}
                cursor="pointer"
              >
                {data.map((d) => (
                  <Cell key={d.date} fill={d.pnl >= 0 ? palette.win : palette.loss} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function DailyPnLTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: DailyPnLPoint }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.pnl >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">{longDate(d.date)}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tnum ${positive ? 'text-win' : 'text-loss'}`}>
        {signed(d.pnl)}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-fg-tertiary tnum">
        {d.tradeCount} {d.tradeCount === 1 ? 'trade' : 'trades'}
      </div>
    </div>
  )
}

// ── Cumulative P&L line + area ───────────────────────────────────────────

function CumulativePnLCard({
  cumulative,
  rangeLabel,
}: {
  cumulative: CumulativePoint[]
  rangeLabel: string
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const goldStroke = resolved === 'light' ? '#b8962e' : '#d4af37'
  const goldFill = '#d4af37'
  const data = useMemo(
    () => cumulative.map((c) => ({ ...c, label: shortDate(c.date) })),
    [cumulative],
  )

  return (
    <Card
      title={`Cumulative P&L (${rangeLabel})`}
      right={
        <Tooltip content="Running net P&L total across the period. Above zero means you're net green; below zero means net red.">
          <InfoIcon />
        </Tooltip>
      }
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cum-gold-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={goldFill} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={goldFill} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
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
                tickFormatter={compactMoney}
                width={52}
              />
              <RechartsTooltip content={<CumulativeTooltip />} />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke={goldStroke}
                strokeWidth={2}
                fill="url(#cum-gold-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function CumulativeTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: CumulativePoint }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const positive = d.cumulative >= 0
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">{longDate(d.date)}</div>
      <div className={`mt-1 font-mono text-sm font-semibold tnum ${positive ? 'text-win' : 'text-loss'}`}>
        {signed(d.cumulative)}
      </div>
    </div>
  )
}

// ── Daily volume ─────────────────────────────────────────────────────────

function DailyVolumeCard({
  volume,
  rangeLabel,
}: {
  volume: DailyVolumePoint[]
  rangeLabel: string
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const barColor = resolved === 'light' ? '#b8962e' : '#d4af37'
  const data = useMemo(
    () => volume.map((v) => ({ ...v, label: shortDate(v.date) })),
    [volume],
  )

  return (
    <Card
      title={`Daily Volume (${rangeLabel})`}
      right={
        <Tooltip content="Total shares traded per day (buys + sells). Volume spikes can hint at overtrading or scaling into runners.">
          <InfoIcon />
        </Tooltip>
      }
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
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
                tickFormatter={compactInt}
                width={52}
              />
              <RechartsTooltip cursor={{ fill: 'rgba(127,127,127,0.05)' }} content={<VolumeTooltip />} />
              <Bar dataKey="volume" fill={barColor} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function VolumeTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: DailyVolumePoint }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">{longDate(d.date)}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-gold tnum">
        {d.volume.toLocaleString()} sh
      </div>
    </div>
  )
}

// ── Daily Win % ──────────────────────────────────────────────────────────

function DailyWinRateCard({
  winRate,
  rangeLabel,
}: {
  winRate: DailyWinRatePoint[]
  rangeLabel: string
}) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const data = useMemo(
    () =>
      winRate.map((w) => ({
        ...w,
        label: shortDate(w.date),
        // Recharts plots null as zero — explicitly leave as 0 when null so
        // the bar is invisible. Tooltip distinguishes via the original null.
        pct: w.winRate == null ? 0 : Math.round(w.winRate * 100),
      })),
    [winRate],
  )

  return (
    <Card
      title={`Win % (${rangeLabel})`}
      right={
        <Tooltip content="Per-day win rate — winners ÷ (winners + losers). Days with no decided trades show as zero.">
          <InfoIcon />
        </Tooltip>
      }
    >
      {data.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={palette.grid} strokeDasharray="2 4" vertical={false} />
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
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                width={42}
              />
              <RechartsTooltip cursor={{ fill: 'rgba(127,127,127,0.05)' }} content={<WinRateTooltip />} />
              <Bar dataKey="pct" fill={palette.win} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function WinRateTooltip({ active, payload }: {
  active?: boolean
  payload?: { payload: DailyWinRatePoint & { pct: number } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary">{longDate(d.date)}</div>
      <div className="mt-1 font-mono text-sm font-semibold text-win tnum">
        {d.winRate == null ? '—' : `${d.pct}%`}
      </div>
      <div className="mt-0.5 font-mono text-[11px] text-fg-tertiary">
        {d.tradeCount} {d.tradeCount === 1 ? 'trade' : 'trades'}
      </div>
    </div>
  )
}

// ── Shared empty state ───────────────────────────────────────────────────

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-fg-tertiary">
      No trades in this range.
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}

function compactInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`
  return String(n)
}
