import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Card from '@/components/ui/Card'
import Tooltip from '@/components/ui/Tooltip'
import type {
  ExtendedEntryCompare,
  MomentumAnalytics,
  MomentumBucket,
  VolumeByTimeBucket,
} from '@shared/analytics-types'
import { int, money, pnlClass, signed } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

interface MomentumSectionProps {
  momentum: MomentumAnalytics
  totalTrades: number
}

const DASH = '—'

export default function MomentumSection({ momentum, totalTrades }: MomentumSectionProps) {
  const ema9Coverage = momentum.ema9_coverage
  const ema9CoveragePct =
    totalTrades > 0 ? (ema9Coverage / totalTrades) * 100 : 0

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight text-fg-primary">
          Momentum-specific
        </h2>
        <div className="text-xs text-fg-tertiary">
          EMA9 coverage:{' '}
          <span className="font-mono text-fg-primary">
            {int(ema9Coverage)}/{int(totalTrades)}
          </span>{' '}
          <span className="font-mono text-gold">
            {ema9CoveragePct.toFixed(0)}%
          </span>
        </div>
      </div>

      <Card
        title="Your trading by time of day"
        subtitle="Trades + shares + net P&L bucketed by 30-minute windows of the entry time."
        hover
      >
        <VolumeByTimeChart buckets={momentum.volumeByHalfHour} />
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card
          title="By entry timeframe"
          subtitle="What chart timeframe were you watching when you entered?"
          hover
          right={
            <Tooltip content="Set the timeframe per trade in the Trades page expand row. Trades you haven't tagged show under 'unset'.">
              <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
            </Tooltip>
          }
        >
          <BucketRows buckets={momentum.byTimeframe} keyHeader="Timeframe" />
        </Card>

        <Card
          title="By entry distance from EMA9"
          subtitle="How extended was the price when you got in?"
          hover
          right={
            <Tooltip
              content={
                <>
                  Computed from Massive 1-minute bars: 9-period EMA of close
                  prices, evaluated at the bar covering the entry timestamp.
                  Buckets use absolute distance — direction doesn't matter
                  for "how far from trend you entered."
                </>
              }
            >
              <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
            </Tooltip>
          }
        >
          {momentum.byEma9Bucket.length > 0 ? (
            <BucketRows buckets={momentum.byEma9Bucket} keyHeader="Distance" />
          ) : (
            <NoData reason="Intraday bars haven't been fetched yet — open Settings and click 'Refresh intraday', or wait for the background fetch after import." />
          )}
        </Card>
      </div>

      <Card
        title="By confidence"
        subtitle="Do high-confidence trades actually perform better?"
        hover
        right={
          <Tooltip content="Set a 1–5 confidence rating per trade in the expand row. This card groups trades by rating so you can verify whether your high-confidence picks really outperform.">
            <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
          </Tooltip>
        }
      >
        {momentum.byConfidence.length > 0 ? (
          <BucketRows buckets={momentum.byConfidence} keyHeader="Rating" />
        ) : (
          <NoData reason="Rate your trades 1–5 in the Trades page expand row." />
        )}
      </Card>

      <Card
        title="Extended entries vs clean entries"
        subtitle="Trades entered >5% from EMA9 vs those at or near it."
        hover
        right={
          <Tooltip content="Anything beyond 5% from the 9-period EMA at entry is flagged 'extended'. Compare net P&L and win rate to see if you're chasing.">
            <span className="cursor-help text-[11px] text-fg-tertiary">ⓘ</span>
          </Tooltip>
        }
      >
        <ExtendedCompare data={momentum.extendedEntry} />
      </Card>
    </div>
  )
}

// ── Volume by time chart ────────────────────────────────────────────────────

function VolumeByTimeChart({ buckets }: { buckets: VolumeByTimeBucket[] }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  if (buckets.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-fg-tertiary">
        No trades to bucket yet.
      </div>
    )
  }

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="window"
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            stroke={palette.axis}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: palette.grid }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
            width={48}
          />
          <RechartsTooltip
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const p = payload[0].payload as VolumeByTimeBucket
              return (
                <div className="rounded-md border border-border-subtle bg-bg-1/95 px-3 py-2 shadow-lg backdrop-blur">
                  <div className="font-mono text-xs text-fg-primary">{p.window}</div>
                  <div className="mt-1 font-mono text-[11px] text-fg-secondary">
                    {int(p.trade_count)} {p.trade_count === 1 ? 'trade' : 'trades'} ·{' '}
                    {int(p.shares)} sh
                  </div>
                  <div className={`mt-1 font-mono text-sm ${pnlClass(p.net_pnl)}`}>
                    {signed(p.net_pnl)}
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="shares" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {buckets.map((b) => (
              <Cell
                key={b.window}
                fill={b.net_pnl >= 0 ? '#d4af37' : '#a7892c'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Bucket rows ────────────────────────────────────────────────────────────

function BucketRows({
  buckets,
  keyHeader,
}: {
  buckets: MomentumBucket[]
  keyHeader: string
}) {
  if (buckets.length === 0) {
    return <NoData reason="No trades match." />
  }
  const absMax = Math.max(...buckets.map((b) => Math.abs(b.net_pnl)), 1)

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border-subtle/60 text-[10px] uppercase tracking-wider text-fg-tertiary">
            <Th>{keyHeader}</Th>
            <Th align="right">Trades</Th>
            <Th align="center">P&amp;L</Th>
            <Th align="right">Net P&amp;L</Th>
            <Th align="right">Win rate</Th>
            <Th align="right">Avg winner</Th>
            <Th align="right">Avg loser</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr
              key={b.key}
              className="border-b border-border-subtle/30 last:border-b-0 hover:bg-white/[0.015]"
            >
              <Td>
                <span className="font-mono text-fg-primary">{b.key}</span>
              </Td>
              <Td align="right">
                <span className="font-mono text-fg-primary">{int(b.trade_count)}</span>
              </Td>
              <Td align="center">
                <PnlBar value={b.net_pnl} absMax={absMax} />
              </Td>
              <Td align="right">
                <span className={`font-mono font-medium ${pnlClass(b.net_pnl)}`}>
                  {signed(b.net_pnl)}
                </span>
              </Td>
              <Td align="right">
                {b.win_rate == null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-gold">
                    {(b.win_rate * 100).toFixed(0)}%
                  </span>
                )}
              </Td>
              <Td align="right">
                {b.avg_winner == null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-win">{money(b.avg_winner)}</span>
                )}
              </Td>
              <Td align="right">
                {b.avg_loser == null ? (
                  <span className="font-mono text-fg-tertiary">{DASH}</span>
                ) : (
                  <span className="font-mono text-loss">{money(b.avg_loser)}</span>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PnlBar({ value, absMax }: { value: number; absMax: number }) {
  const pct = Math.min(100, (Math.abs(value) / absMax) * 50)
  return (
    <div className="relative mx-auto h-2.5 w-full max-w-[140px] rounded-sm bg-white/[0.03]">
      <div className="absolute left-1/2 top-0 h-full w-px bg-border/80" />
      {value > 0 && (
        <div
          className="absolute left-1/2 top-0 h-full rounded-r-sm bg-win/70"
          style={{ width: `${pct}%` }}
        />
      )}
      {value < 0 && (
        <div
          className="absolute right-1/2 top-0 h-full rounded-l-sm bg-loss/70"
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  )
}

// ── Extended vs Clean side-by-side ─────────────────────────────────────────

function ExtendedCompare({ data }: { data: ExtendedEntryCompare }) {
  if (data.trades_with_data === 0) {
    return (
      <NoData reason="Need EMA9 distance — refresh intraday data from Settings, or wait for the background fetch." />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Side
        label="Clean entries"
        sublabel="|distance from EMA9| ≤ 5%"
        count={data.clean_count}
        netPnl={data.clean_net_pnl}
        winRate={data.clean_win_rate}
        tone="green"
      />
      <Side
        label="Extended entries"
        sublabel="|distance from EMA9| > 5% — momentum chase"
        count={data.extended_count}
        netPnl={data.extended_net_pnl}
        winRate={data.extended_win_rate}
        tone="red"
      />
      {data.trades_missing_data > 0 && (
        <div className="col-span-full text-xs text-fg-tertiary">
          {int(data.trades_missing_data)} trade
          {data.trades_missing_data === 1 ? '' : 's'} missing EMA9 data — refresh
          intraday from Settings.
        </div>
      )}
    </div>
  )
}

function Side({
  label,
  sublabel,
  count,
  netPnl,
  winRate,
  tone,
}: {
  label: string
  sublabel: string
  count: number
  netPnl: number
  winRate: number | null
  tone: 'green' | 'red'
}) {
  const borderClass = tone === 'green' ? 'border-win/30' : 'border-loss/30'
  return (
    <div className={`rounded-md border ${borderClass} bg-bg-1/40 p-4`}>
      <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">{label}</div>
      <div className="mt-1 text-[11px] text-fg-secondary">{sublabel}</div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Trades</div>
          <div className="mt-0.5 font-mono text-lg text-fg-primary">{int(count)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Net P&L</div>
          <div className={`mt-0.5 font-mono text-lg font-medium ${pnlClass(netPnl)}`}>
            {count > 0 ? signed(netPnl) : DASH}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-fg-tertiary">Win rate</div>
          <div className="mt-0.5 font-mono text-lg text-gold">
            {winRate == null ? DASH : `${(winRate * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>
    </div>
  )
}

function NoData({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/[0.04] p-4 text-xs text-fg-secondary">
      <div className="mb-1 uppercase tracking-wider text-gold">
        Awaiting data
      </div>
      {reason}
    </div>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const cls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`px-3 py-2 font-semibold ${cls}`}>{children}</th>
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
}) {
  const cls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`px-3 py-2 ${cls}`}>{children}</td>
}
