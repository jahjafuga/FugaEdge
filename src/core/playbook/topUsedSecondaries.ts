// Beat — rank the addable SECONDARY confluences by how often they've been used,
// so the Setup card can surface the most common adds as one-tap quick chips.
// Pure module: no electron, no DB, no react imports (sibling of
// availableSecondaries.ts, which produces the `available` set this ranks).

import type { PlaybookStats } from '@shared/playbook-types'

/** The minimal structural shape the ranker needs: a `stats.trade_count` to sort
 *  on. PlaybookWithStats satisfies it; tests pass plain objects. */
export type UsageRankable = { stats: Pick<PlaybookStats, 'trade_count'> }

/**
 * The `n` most-used candidates, ranked by PRIMARY-assignment count
 * (stats.trade_count) descending. Operates on a COPY — never mutates the input.
 * The sort is stable, so ties keep their incoming order (the by-name order from
 * filterAvailableSecondaries). Zero-usage rows sink to the bottom but stay
 * eligible; an `n` larger than the input simply returns everything.
 */
export function topUsedSecondaries<T extends UsageRankable>(
  available: readonly T[],
  n: number,
): T[] {
  return [...available]
    .sort((a, b) => b.stats.trade_count - a.stats.trade_count)
    .slice(0, n)
}
