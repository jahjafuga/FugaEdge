// One MACD-state cell of the Section 2 grid (spec §B Section 2 / §G) — a thin
// MACD wrapper over the shared BucketCard shell. It owns only the MACD tint
// palette: the BucketTint enum and the two literal class maps. The active map
// strengthens the tint from 0.12 to 0.18 (clearing the §G "middle tints too
// faint" polish); BucketCard renders it as the open-state tint. The wrapper
// resolves the tint enum to the rest / active class strings BucketCard expects.
//
// Tints use complete-literal class maps so Tailwind's JIT detects them:
// `bg-macd-${tint}/[0.NN]` template construction would scan as plain text and
// never emit, so both the 0.12 (rest) and 0.18 (active) classes appear verbatim.

import type { BucketStats } from '@/core/technicals/macdBuckets'
import BucketCard from './BucketCard'

type BucketTint = 'pos-rising' | 'pos-falling' | 'neg-rising' | 'neg-falling'

interface MacdBucketCardProps {
  title: string // full header text, e.g. "Positive + Rising ▲"
  tint: BucketTint
  stats: BucketStats
  isOpen: boolean
  onClick: () => void
}

// Rest tint (~0.12) and active tint (~0.18) — full literal strings for the JIT.
const TINT_BG: Record<BucketTint, string> = {
  'pos-rising': 'bg-macd-pos-rising/[0.12]',
  'pos-falling': 'bg-macd-pos-falling/[0.12]',
  'neg-rising': 'bg-macd-neg-rising/[0.12]',
  'neg-falling': 'bg-macd-neg-falling/[0.12]',
}
const TINT_BG_ACTIVE: Record<BucketTint, string> = {
  'pos-rising': 'bg-macd-pos-rising/[0.18]',
  'pos-falling': 'bg-macd-pos-falling/[0.18]',
  'neg-rising': 'bg-macd-neg-rising/[0.18]',
  'neg-falling': 'bg-macd-neg-falling/[0.18]',
}

export default function MacdBucketCard({
  title,
  tint,
  stats,
  isOpen,
  onClick,
}: MacdBucketCardProps) {
  return (
    <BucketCard
      title={title}
      stats={stats}
      isOpen={isOpen}
      onClick={onClick}
      restTintClass={TINT_BG[tint]}
      activeTintClass={TINT_BG_ACTIVE[tint]}
    />
  )
}
