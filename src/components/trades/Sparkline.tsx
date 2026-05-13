import { useMemo } from 'react'
import type { RoundTripExecution } from '@shared/import-types'
import { useThemeMode } from '@/lib/theme'
import { chartColors } from '@/lib/chartColors'

interface SparklineProps {
  executions: RoundTripExecution[]
  netPnl: number
  width?: number
  height?: number
  /** When true, the first/last fills get larger ring markers and the rest stay small dots. */
  emphasizeEntryExit?: boolean
}

// Inline SVG plot of execution prices over time. Single color derived from
// net P&L sign — green for profit, red for loss, muted for scratch / single fill.
export default function Sparkline({
  executions,
  netPnl,
  width = 80,
  height = 24,
  emphasizeEntryExit = false,
}: SparklineProps) {
  const { resolved } = useThemeMode()
  const palette = useMemo(() => chartColors(resolved), [resolved])

  if (executions.length === 0) {
    return <svg width={width} height={height} aria-hidden="true" />
  }

  const times = executions.map((e) => new Date(e.time).getTime())
  const prices = executions.map((e) => e.price)
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const pMin = Math.min(...prices)
  const pMax = Math.max(...prices)
  const tRange = tMax - tMin || 1
  const pRange = pMax - pMin || 1

  const pad = emphasizeEntryExit ? 6 : 2
  const points = executions.map((e) => {
    const x = ((new Date(e.time).getTime() - tMin) / tRange) * (width - pad * 2) + pad
    const y =
      height - pad - ((e.price - pMin) / pRange) * (height - pad * 2)
    return { x, y, side: e.side }
  })

  if (points.length === 1) {
    points[0] = { x: width / 2, y: height / 2, side: points[0].side }
  }

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ')

  const lineColor =
    netPnl > 0 ? palette.win : netPnl < 0 ? palette.loss : palette.axis
  const strokeWidth = emphasizeEntryExit ? 1.75 : 1.25

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <svg
      width={width}
      height={height}
      className="overflow-visible"
      aria-label="price trajectory"
    >
      {points.length > 1 && (
        <path
          d={path}
          stroke={lineColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}

      {/* Non-endpoint dots */}
      {points.map((p, i) => {
        if (emphasizeEntryExit && (i === 0 || i === points.length - 1)) return null
        return (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.6}
            fill={lineColor}
            opacity={p.side === 'B' ? 1 : 0.55}
          />
        )
      })}

      {/* Entry = green dot, Exit = red dot — always, regardless of long/short.
          The visual contract is "where you got in / where you got out". */}
      {emphasizeEntryExit && points.length > 1 && (
        <>
          <circle cx={first.x} cy={first.y} r={4.5} fill="none" stroke={palette.win} strokeWidth={1.25} />
          <circle cx={first.x} cy={first.y} r={2.2} fill={palette.win} />
          <circle cx={last.x} cy={last.y} r={4.5} fill="none" stroke={palette.loss} strokeWidth={1.25} />
          <circle cx={last.x} cy={last.y} r={2.2} fill={palette.loss} />
        </>
      )}
    </svg>
  )
}
