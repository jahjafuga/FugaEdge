// Multi-account Beat 4 — THE scoping seam. Every per-account filtering slice
// (Dashboard now; Calendar/Analytics/Reports/Trades in later slices) resolves
// an AccountScope through this one function so the semantics can never drift:
//   - a single account filters account_id = ?
//   - 'all' means every NON-SIM account BY DEFINITION — the sim wall is built
//     in from day one (vacuously true until sim imports unlock; the unlock
//     audit beat flips nothing here, it just makes the wall load-bearing).
// Pure string/params builder — no DB import, unit-tested directly.

import type { AccountScope } from '@shared/accounts-types'

export const SIM_WALL =
  "account_id IN (SELECT id FROM accounts WHERE account_type != 'sim')"

export function scopeFilter(scope: AccountScope): { clause: string; params: string[] } {
  if (scope === 'all') return { clause: SIM_WALL, params: [] }
  return { clause: 'account_id = ?', params: [scope.accountId] }
}

// Analytics slice — the stable per-scope suffix for memoized read handlers'
// TTL-cache keys (analytics/reports). Without a per-scope key, a switcher
// flip within the TTL would serve the previous scope's payload.
export function scopeCacheKey(scope: AccountScope): string {
  return scope === 'all' ? 'all' : `acct:${scope.accountId}`
}
