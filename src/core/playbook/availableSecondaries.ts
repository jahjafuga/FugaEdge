// Beat 3 — the playbooks offerable as SECONDARY confluence tags on a trade.
// Pure module: no electron, no DB, no react imports (sibling of tiers.ts).

import type { Playbook } from '@shared/playbook-types'

/** The minimal structural shape the filter needs. PlaybookWithStats is
 *  structurally compatible, and tests pass plain objects. */
export type SecondaryCandidate = Pick<Playbook, 'id' | 'name' | 'archived' | 'is_system'>

/**
 * Every non-system, non-archived playbook EXCEPT the trade's current primary
 * and any already-selected secondary — ordered by name (the picker convention).
 *
 * This only keeps the UI from OFFERING invalid choices; the two invariants are
 * also repo-enforced (Inv 2: a system "No Setup" can never be a secondary;
 * Inv 1: a playbook that is the trade's primary can never also be a secondary).
 */
export function filterAvailableSecondaries<T extends SecondaryCandidate>(
  playbooks: readonly T[],
  primaryId: number | null,
  selectedIds: readonly number[],
): T[] {
  const selected = new Set(selectedIds)
  return playbooks
    .filter(
      (p) =>
        !p.is_system &&
        !p.archived &&
        p.id !== primaryId &&
        !selected.has(p.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}
