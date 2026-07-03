// Stage 3 beat 3 — the balance-over-time curve, a SIBLING of the Cumulative
// P&L card (that file is untouched; this one mirrors its recharts mechanics
// and house tokens). The line is GOLD by ruling — green/red are P&L-semantic
// and a balance is not P&L, so no zero-split gradient and no zero baseline.
// Scope-following ([scope] refetch, cancelled-flag guard); an empty series
// (no anchors in scope) renders the honest empty state.

import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Card from '@/components/ui/Card'
import { ipc } from '@/lib/ipc'
import { money, shortDate, longDate } from '@/lib/format'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { useAccountScope } from '@/lib/accountScope'

const S = {
  title: 'Balance over time',
  subtitle: 'Your ledger balance, day by day.',
  empty: 'No balance history yet — set a starting balance in Settings.',
}

// Distinct gradient id — never collides with the P&L curves' gradients on
// the same page (their documented convention).
const FILL_ID = 'dashBalanceFill'
const GOLD = '#d4af37'

interface BalancePoint {
  date: string
  balance: number
}

export default function BalanceCurveCard() {
  const { scope } = useAccountScope()
  const [series, setSeries] = useState<BalancePoint[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setSeries(null) // stale guard
    ipc
      .cashBalanceSeries(scope)
      .then((s) => {
        if (!cancelled) setSeries(s)
      })
      .catch(() => {
        if (!cancelled) setSeries([])
      })
    return () => {
      cancelled = true
    }
  }, [scope])

  return (
    <Card title={S.title} subtitle={S.subtitle}>
      {series === null ? (
        <div style={{ height: 220 }} aria-hidden />
      ) : series.length === 0 ? (
        <div
          className="flex items-center justify-center text-sm text-fg-tertiary"
          style={{ height: 220 }}
        >
          {S.empty}
        </div>
      ) : (
        <BalanceChart series={series} />
      )}
    </Card>
  )
}

function BalanceChart({ series }: { series: BalancePoint[] }) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])
  const data = useMemo(
    () => series.map((p) => ({ ...p, label: shortDate(p.date) })),
    [series],
  )

  return (
    <div className="w-full" style={{ height: 220 }} data-testid="balance-curve">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={FILL_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={GOLD} stopOpacity={0.25} />
              <stop offset="1" stopColor={GOLD} stopOpacity={0.02} />
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
            width={64}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: palette.grid, strokeWidth: 1 }}
            content={<BalanceTooltip />}
          />
          <Area
            type="stepAfter"
            dataKey="balance"
            stroke={GOLD}
            strokeWidth={1.75}
            fill={`url(#${FILL_ID})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: BalancePoint & { label: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border bg-bg-4 px-3 py-2 shadow-md">
      <div className="font-mono text-[11px] text-fg-tertiary tnum">{longDate(d.date)}</div>
      <div className="mt-1 font-mono text-sm font-semibold tnum text-gold">
        {money(d.balance)}
      </div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${n < 0 ? '−' : ''}${money(Math.abs(n) / 1000).replace(/\.\d\d$/, '')}k`
  return money(n).replace('.00', '')
}
