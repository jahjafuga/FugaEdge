import type { LadderDot, LadderLeader, LadderPill } from '@/lib/assembleLadderFrame'

const COLOR_LEADER = 'rgba(243,245,250,0.40)'
const COLOR_DOT_RING = '#0c0f16'
const COLOR_PILL_TEXT = '#f3f5fa'
const PILL_RADIUS = 3
const PILL_FONT_PX = 10

export interface FillLadderOverlayProps {
  dots: LadderDot[]
  leaders: LadderLeader[]
  pills: LadderPill[]
  width: number
  height: number
  className?: string
}

// Renders the fill ladder as positioned SVG over the chart. All geometry is
// precomputed by assembleLadderFrame (pure); this component only draws. Order:
// leaders, then pills, then dots (dots crisp on top), matching the old canvas
// primitive's layering.
export function FillLadderOverlay({ dots, leaders, pills, width, height, className }: FillLadderOverlayProps) {
  return (
    <svg width={width} height={height} className={className} style={{ pointerEvents: 'none' }}>
      {leaders.map((l, i) => (
        <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={COLOR_LEADER} strokeWidth={1} />
      ))}
      {pills.map((p, i) => (
        <g key={`p${i}`}>
          <rect
            x={p.cx - p.w / 2}
            y={p.cy - p.h / 2}
            width={p.w}
            height={p.h}
            rx={PILL_RADIUS}
            fill={p.color}
          />
          <text
            x={p.cx - p.w / 2 + 6}
            y={p.cy}
            fill={COLOR_PILL_TEXT}
            fontSize={PILL_FONT_PX}
            fontFamily="JetBrains Mono, ui-monospace, monospace"
            dominantBaseline="middle"
          >
            {p.label}
          </text>
        </g>
      ))}
      {dots.map((d, i) => (
        <circle key={`d${i}`} cx={d.x} cy={d.y} r={d.r} fill={d.color} stroke={COLOR_DOT_RING} strokeWidth={1} />
      ))}
    </svg>
  )
}
