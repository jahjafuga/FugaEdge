// Idea 1 — pure classification of a trade's PRIMARY setup. Web-portable per
// ARCHITECTURE.md: no electron/sqlite/http/React imports. Sibling of
// signalBuckets.ts / tiers.ts.
//
// Route-A inference (mirrors ConfluencePerformanceCard's signalCount note): the
// trades-list IPC nulls playbook_tier for the system "No Setup" primary
// (CASE WHEN p.is_system = 1 THEN NULL ELSE p.tier). Since playbooks.tier is
// NOT NULL, a present-and-non-system primary ALWAYS carries a real tier — so on
// a row that HAS a primary, tier == null ⟺ the primary is the system No-Setup
// row. If Route A ever stops nulling the tier, revisit this module.
//
//   playbook_id == null                      → 'untagged'  (no primary; id null
//                                               dominates — tier is null too)
//   playbook_id != null && tier != null      → 'graded'    (a real setup)
//   playbook_id != null && tier == null      → 'no-setup'  (system primary)

import type { PlaybookTier } from '@shared/playbook-types'

export type PrimaryState = 'graded' | 'no-setup' | 'untagged'

export function primaryState(t: {
  playbook_id: number | null
  playbook_tier: PlaybookTier | null
}): PrimaryState {
  if (t.playbook_id == null) return 'untagged'
  return t.playbook_tier != null ? 'graded' : 'no-setup'
}
