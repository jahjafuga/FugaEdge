// Pure suggestion mapper for the first-run tier seed. Matches the
// behaviour in electron/db/database.ts `seedDefaultPlaybookTiersOnce`
// so the migration is testable without a database.
//
// Returns the suggested tier for a playbook NAME (case-insensitive
// substring match), or null when the name doesn't match any known
// starter setup. The migration writes the suggestion only when the
// existing tier is still the column default 'B'.

import type { PlaybookTier } from '@shared/playbook-types'

export function suggestTierForPlaybookName(name: string): PlaybookTier | null {
  const n = name.toLowerCase()
  // Most specific matches first so a name containing both "bull flag"
  // AND "1m" lands on A+, not the generic Bull Flag A bucket.
  if (n.includes('micro pullback')) return 'A+'
  if (n.includes('bull flag') && (n.includes('1m') || n.includes('1-min') || n.includes('1 min'))) return 'A+'
  if (n.includes('bull flag') && (n.includes('5m') || n.includes('5-min') || n.includes('5 min'))) return 'A'
  if (n.includes('1-min pullback') || n === '1m pullback' || n === '1min pullback') return 'A+'
  if (n.includes('5-min pullback') || n === '5m pullback' || n === '5min pullback') return 'A'
  if (n.includes('bull flag')) return 'A'
  if (n.includes('vwap break')) return 'B'
  if (n.includes('first pullback to vwap')) return 'B'
  if (n.includes('dip trade on 9ema') || n.includes('9ema')) return 'B'
  return null
}
