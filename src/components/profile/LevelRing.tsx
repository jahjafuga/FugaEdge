// v0.2.5 Phase B Session 4 — the level ring (L23): SVG progress ring, gold
// accent, level number centered. The one gamification-register element on
// an otherwise MASTER-conformant page; the register itself is documented in
// the Phase B Session 6 MASTER.md amendment (D24/A4).

import type { ReactNode } from 'react'
import { ringFraction } from './helpers'
import { profileStrings } from './strings'

interface LevelRingProps {
  level: number
  intoLevel: number
  neededForNext: number
  /** Outer square size in px. */
  size?: number
  /** When set, renders in the ring center (e.g. the hero avatar) instead of the
   *  default LVL + level number. Presentation only — the ring math is unchanged. */
  center?: ReactNode
}

export default function LevelRing({
  level,
  intoLevel,
  neededForNext,
  size = 132,
  center,
}: LevelRingProps) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const fraction = ringFraction(intoLevel, neededForNext, level)

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      data-testid="level-ring"
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border-subtle"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - fraction)}
          className="stroke-gold transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {center ?? (
          <>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-fg-tertiary">
              {profileStrings.level.ringLabel}
            </span>
            <span className="font-mono text-3xl font-bold leading-none text-gold">
              {level}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
