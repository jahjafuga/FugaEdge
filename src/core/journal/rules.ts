// v0.2.6 Beat 1 — pure helpers for the id-stable journal-rule model. Zero
// electron / DB / React imports (ARCHITECTURE rule 1): runs identically in the
// future web port. The migration (Beat 2) and the rewired UI (Beats 3-4) reuse
// these so the id<->name mapping + the active-filter live in ONE place.
import type { JournalRule } from '@shared/journal-types'
import { newUlid } from '@/core/ids/ulid'

/** Create a rule with a fresh stable id (ULID), a trimmed name, archived=false. */
export function makeJournalRule(name: string): JournalRule {
  return { id: newUlid(), name: name.trim(), archived: false }
}

/** Id -> display name (for rendering history). null when the id is unknown. */
export function resolveRuleName(rules: JournalRule[], id: string): string | null {
  return rules.find((r) => r.id === id)?.name ?? null
}

/** Name -> id (for the Beat-2 migration matching old name-strings to new ids).
 *  null when no rule has that name — THE orphan signal Beat 2 keys off to
 *  resurrect a stranded name as an archived rule. */
export function resolveRuleId(rules: JournalRule[], name: string): string | null {
  return rules.find((r) => r.name === name)?.id ?? null
}

/** Non-archived rules only (the active checklist), order preserved. */
export function activeRules(rules: JournalRule[]): JournalRule[] {
  return rules.filter((r) => !r.archived)
}
