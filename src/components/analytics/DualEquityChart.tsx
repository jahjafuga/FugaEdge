// TWO EQUITY CURVES, ONE FRAME (beat 283). Long beside short on the same
// dollar axis and the same day base, so the eye compares slopes instead of
// flipping between charts.
//
// COMPOSED FROM EquityChart's OWN PATTERN (the recon found no two-Line chart
// to mirror): ResponsiveContainer + ComposedChart + the house axis and
// tooltip styling. EquityChart itself is NOT edited; its gradient fill and
// drawdown band belong to the one-curve story. Lines only here, no fills, so
// nothing needs a DOM id and the 'equityFill' collision class stays dead.
//
// THE SIDE COLOURS LIVE HERE, ONCE, as hex literals on the stroke prop -- the
// exact mechanism EquityChart uses for its gold (:94). Blue and orange are
// deliberately OUTSIDE the win/loss palette: green and red stay P&L
// semantics, and a side is not an outcome.
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DualCurvePoint } from '@/core/performance/direction'
import { DirectionWording, fillDirection } from '@shared/direction-wording'
import { money, signed, longDate, shortDate } from '@/lib/format'
import { useMemo } from 'react'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'
import { CUMULATIVE_LINE_TYPE } from '@/core/charts/cumulativeStyle'
// The side colours moved to sideColors.ts in beat 287 so the tab and this
// chart import ONE constant instead of each spelling a hex.
import { SIDE_COLORS } from '@/components/analytics/sideColors'

/** An end label at a line's LAST point (beat 287): the final cumulative
 *  value, money-formatted, in the side's colour. recharts calls this for
 *  every point; every index but the last returns an empty group. */
function endLabel(color: string, lastIndex: number) {
  return function EndLabel(props: { x?: number; y?: number; value?: number; index?: number }) {
    if (props.index !== lastIndex || props.x == null || props.y == null || props.value == null) {
      return <g />
    }
    return (
      <text x={props.x + 6} y={props.y} dy={4} fontSize={11} fontFamily="ui-monospace, monospace" fill={color}>
        {money(props.value)}
      </text>
    )
  }
}

interface DualEquityChartProps {
  curve: DualCurvePoint[]
  hasLong: boolean
  hasShort: boolean
}

export default function DualEquityChart({ curve, hasLong, hasShort }: DualEquityChartProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  if (curve.length === 0 || (!hasLong && !hasShort)) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-fg-tertiary">
        No equity history yet.
      </div>
    )
  }

  const data = curve.map((p) => ({ ...p, label: shortDate(p.date) }))

  return (
    <div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {/* right: 72 (beat 288) -- room for the end labels: the worst-case
                shape -$3,461.24 at 11px mono needs ~66px plus the 6px
                offset, floored at 72. Labels sit right of the last point. */}
            <ComposedChart data={data} margin={{ top: 10, right: 72, left: 0, bottom: 0 }}>
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
              content={<DualTooltip />}
            />
            {hasLong && (
              <Line
                type={CUMULATIVE_LINE_TYPE}
                dataKey="long"
                stroke={SIDE_COLORS.long}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
                label={endLabel(SIDE_COLORS.long, data.length - 1)}
              />
            )}
            {hasShort && (
              <Line
                type={CUMULATIVE_LINE_TYPE}
                dataKey="short"
                stroke={SIDE_COLORS.short}
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
                label={endLabel(SIDE_COLORS.short, data.length - 1)}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-fg-tertiary">
        {hasLong && <LegendSwatch color={SIDE_COLORS.long} label={DirectionWording.colLong} />}
        {hasShort && <LegendSwatch color={SIDE_COLORS.short} label={DirectionWording.colShort} />}
        {!hasLong && (
          <span>{fillDirection(DirectionWording.curveNoSide, { side: 'long' })}</span>
        )}
        {!hasShort && (
          <span>{fillDirection(DirectionWording.curveNoSide, { side: 'short' })}</span>
        )}
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-[3px] w-4 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}

function DualTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: DualCurvePoint & { label: string } }[]
}) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded-md border border-border-subtle bg-bg-1/95 px-3 py-2 shadow-lg backdrop-blur">
      <div className="font-mono text-xs text-fg-secondary">{longDate(d.date)}</div>
      <div className="mt-1 font-mono text-sm font-medium" style={{ color: SIDE_COLORS.long }}>
        {DirectionWording.colLong} {signed(d.long)}
      </div>
      <div className="font-mono text-sm font-medium" style={{ color: SIDE_COLORS.short }}>
        {DirectionWording.colShort} {signed(d.short)}
      </div>
    </div>
  )
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`
  return money(n).replace('.00', '')
}
