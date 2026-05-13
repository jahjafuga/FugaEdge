// Playbook templates seeded per the trading style the user picks during
// onboarding. Names are deliberately distinct from the auto-seeded
// defaults (electron/db/database.ts → seedDefaultPlaybooksOnce) where
// possible, so the user can keep both sets without duplicates colliding
// on the UNIQUE name index.
//
// "mixed" returns an empty list — the user explicitly opted out of any
// pre-fill. The auto-seeded defaults are still in the DB regardless.

import type { TradingStyle } from './types'

export interface PlaybookTemplate {
  name: string
  description: string
}

export const SMALL_CAP_TEMPLATES: PlaybookTemplate[] = [
  {
    name: 'Bull Flag 1min',
    description:
      'Tight consolidation flag after a sharp upward push on the 1-minute chart. Enter on flag breakout.',
  },
  {
    name: 'Micro Pullback',
    description:
      'Very shallow pullback within a strong sustained trend. Tight stop, big winners on continuation.',
  },
  {
    name: 'ABCD',
    description: 'Classic A→B→C→D continuation — push, pullback, continuation.',
  },
  {
    name: 'Halt Resume',
    description: 'Entry into halt resumption with clear catalyst and over-halt high break.',
  },
  {
    name: 'VWAP Break',
    description: 'Reclaim of VWAP after a base — momentum continuation entry on the break.',
  },
]

export const LARGE_CAP_TEMPLATES: PlaybookTemplate[] = [
  {
    name: 'Opening Range Breakout',
    description:
      'Break of the first 5 / 15 / 30 min range after the open. Confirmation on volume.',
  },
  {
    name: 'VWAP Bounce',
    description: 'Pullback to VWAP in a trending name — enter on the rejection.',
  },
  {
    name: 'Trend Continuation',
    description:
      'Established intraday trend; entries on pullbacks to moving averages with the trend.',
  },
]

export function templatesForStyle(style: TradingStyle): PlaybookTemplate[] {
  if (style === 'small-cap') return SMALL_CAP_TEMPLATES
  if (style === 'large-cap') return LARGE_CAP_TEMPLATES
  return []
}
