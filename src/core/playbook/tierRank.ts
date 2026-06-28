import type { PlaybookTier } from '@shared/playbook-types'
import { primaryState } from './primaryState'

// Rank a trade's primary playbook for Brendan's worst-to-best tier sort.
// Ascending order (first-click): No Setup -> C -> B -> A -> A+ -> Untagged.
// Graded tiers (C..A+) cluster in the middle so they read as groups on stream;
// "No Setup" (a deliberate tag) leads, and truly-untagged trades (no plan
// recorded) sit last. No Setup and Untagged are BOTH playbook_tier === null on
// the row, so we use primaryState (which reads playbook_id) to tell them apart.

const GRADED_RANK: Record<PlaybookTier, number> = {
  C: 1,
  B: 2,
  A: 3,
  'A+': 4,
}

export function tierRank(t: {
  playbook_id: number | null
  playbook_tier: PlaybookTier | null
}): number {
  const state = primaryState(t)
  if (state === 'no-setup') return 0
  if (state === 'untagged') return 5
  // graded: tier is non-null here (primaryState 'graded' guarantees it)
  return t.playbook_tier != null ? GRADED_RANK[t.playbook_tier] : 0
}
