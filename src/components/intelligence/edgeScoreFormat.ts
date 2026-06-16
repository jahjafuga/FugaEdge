import { EDGE_SCORE_BANDS, type AxisKey } from '@/core/score/edgeScore'

// v0.2.5 Edge Intelligence — Beat 2. Shared presentational helpers for the split
// Edge Score cards: the RadarCard tooltip AND the ScoreCard weights/bands
// disclosure both use these, so they live in one place (no duplication after the
// EdgeScorePanel split). Pure formatting — no React, no data access.

/** Short spoke labels so the 6 radar axes don't overflow the hexagon. */
export const SHORT: Record<AxisKey, string> = {
  discipline: 'Discipline',
  profit_factor: 'Profit F.',
  win_rate: 'Win Rate',
  avg_win_loss: 'Avg W/L',
  max_drawdown: 'Drawdown',
  consistency: 'Consistency',
}

/** Format a raw axis metric per its band's rawFormat. */
export function fmtRaw(raw: number | null, fmt: 'pct' | 'frac' | 'x'): string {
  if (raw === null) return '—'
  if (!Number.isFinite(raw)) return '∞'
  if (fmt === 'pct') return `${raw.toFixed(0)}%`
  if (fmt === 'frac') return `${(raw * 100).toFixed(0)}%`
  return `${raw.toFixed(2)}×`
}

/** The rawFormat for an axis key (from the published bands). */
export const bandFmt = (key: AxisKey) =>
  EDGE_SCORE_BANDS.find((b) => b.key === key)!.rawFormat

// v0.2.5 — the shared EdgeScore tier → TEXT-tone map. Lives here (not in the
// pure core tier.ts, which must stay token-free) so the Intelligence ScoreCard
// label and the dashboard EdgeIQ daily-debrief card read the SAME color for a
// given tier and can never diverge. Themed tokens only (text-gold/text-win
// auto-darken in light mode); top tiers read gold/win, mid neutral, bottom loss.
export function tierToneClass(tierName: string): string {
  switch (tierName) {
    case 'Elite':
    case 'Exceptional':
      return 'text-gold'
    case 'Advanced':
    case 'Consistent':
      return 'text-win'
    case 'Leaking':
    case 'Critical':
      return 'text-loss'
    default: // Developing / Improving / Unstable
      return 'text-fg-secondary'
  }
}
