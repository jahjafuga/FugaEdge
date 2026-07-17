// Pure helpers for the id-stable journal-rule model. Zero
// electron / DB / React imports (ARCHITECTURE rule 1): runs identically in the
// future web port. The migration (Beat 2) and the rewired UI (Beats 3-4) reuse
// these so the id<->name mapping + the active-filter live in ONE place.
import type { JournalRule } from '@shared/journal-types'
import { newUlid } from '@/core/ids/ulid'

/** Per-rule checklist state for a journal day, keyed by rule id. */
export type RuleState = 'followed' | 'violated' | 'neutral'

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

/** Split an id-keyed state map into followed / violated id arrays for saving.
 *  Includes EVERY marked id (active OR archived) and omits 'neutral'/absent —
 *  the re-orphan guard: a day's save preserves marks for rules that are no
 *  longer in the active checklist (archived rules' history). */
export function splitRuleMarks(states: Record<string, RuleState>): {
  followed: string[]
  violated: string[]
} {
  const followed: string[] = []
  const violated: string[] = []
  for (const [id, state] of Object.entries(states)) {
    if (state === 'followed') followed.push(id)
    else if (state === 'violated') violated.push(id)
  }
  return { followed, violated }
}

/** Structural equality of the rule list (id + name + archived + order). The
 *  Settings dirty check uses this so a rename, add, remove, or archive-toggle
 *  all register as changed (object identity would always read as dirty). */
export function rulesEqual(a: JournalRule[], b: JournalRule[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].archived !== b[i].archived) {
      return false
    }
  }
  return true
}

// Coerce one unknown entry to a valid JournalRule, or null if malformed (no id
// or empty name). Trims the name; archived is strict-true only. Shared by the
// stored-JSON parse and the pre-save clean so both validate identically.
function coerceRule(r: unknown): JournalRule | null {
  if (r == null || typeof r !== 'object') return null
  const o = r as Record<string, unknown>
  const id = String(o.id ?? '').trim()
  const name = String(o.name ?? '').trim()
  if (!id || !name) return null
  return { id, name, archived: o.archived === true }
}

/** Parse the stored settings.journal_rules JSON into JournalRule[]. Degrades to
 *  [] on null / non-JSON / non-array; drops malformed entries. Used by the
 *  settings repo read + the journal read (post-Beat-2 the stored value is
 *  JournalRule[]). */
export function parseJournalRules(raw: string | null | undefined): JournalRule[] {
  if (!raw) return []
  const t = raw.trim()
  if (!t.startsWith('[')) return []
  try {
    const arr = JSON.parse(t)
    if (!Array.isArray(arr)) return []
    return arr.map(coerceRule).filter((r): r is JournalRule => r !== null)
  } catch {
    return []
  }
}

/** Validate JournalRule[] for persistence: trim names, drop malformed entries,
 *  but KEEP archived rules — dropping an archived rule would re-orphan its
 *  history (the original bug). Used by the settings repo save. */
export function cleanJournalRules(rules: JournalRule[]): JournalRule[] {
  return rules.map(coerceRule).filter((r): r is JournalRule => r !== null)
}

// ── Beat 2 — the legacy string[] -> {id,name,archived} conversion ────────────

/** A journal row as stored: rules_followed / rule_violations are TEXT (JSON
 *  array of NAME strings, or legacy CSV). */
export interface JournalRowRaw {
  date: string
  rules_followed: string
  rule_violations: string
}

/** A journal row remapped to rule IDS (what Beat 2 writes back). */
export interface JournalRowIdUpdate {
  date: string
  rules_followed: string[]
  rule_violations: string[]
}

export interface LegacyConversionResult {
  /** Active rules (from the current list) followed by resurrected archived
   *  orphans, in that order. */
  newRulesList: JournalRule[]
  /** Per-row name->id remap; one entry per input row, same order. */
  rowUpdates: JournalRowIdUpdate[]
}

// Parse a stored TEXT cell to NAME strings — mirrors electron/journal/get.ts
// parseStringArray (JSON array, else CSV fallback). Pure.
function parseNames(v: string | null | undefined): string[] {
  if (v == null) return []
  const t = String(v).trim()
  if (!t) return []
  if (t.startsWith('[')) {
    try {
      const a = JSON.parse(t)
      return Array.isArray(a) ? a.map((x) => String(x)) : []
    } catch {
      /* fall through to CSV */
    }
  }
  return t.split(',').map((s) => s.trim()).filter(Boolean)
}

// ── THE FINAL TWO (build A) — the Remove guard's usage tally ────────────────

/** One journal row in the shape getJournalRuleUsage reads it (both mark
 *  columns are ID string[] JSON post-Beat-2). */
export interface JournalRuleMarkRow {
  date: string
  rules_followed: string
  rule_violations: string
}

/** rule id -> number of DISTINCT journal days it is marked on. */
export type JournalRuleUsage = Record<string, number>

// Strict JSON-or-[] cell parser for the tally — deliberately NOT parseNames:
// its CSV fallback belongs to the LEGACY name migration, and the ruleBreaks
// usage precedent (core/ruleBreaks/usage.ts:34-36) rejects comma fallbacks for
// DAY cells so a malformed cell can never split into phantom ids.
function parseIdArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const a = JSON.parse(raw)
    return Array.isArray(a) ? a.map((x) => String(x)).filter(Boolean) : []
  } catch {
    return []
  }
}

/**
 * PURE usage tally behind the Settings Remove guard (mirrors
 * core/ruleBreaks/usage.ts tallyRuleBreakUsage). followed and violated both
 * count; an id marked twice on one day (or in both arrays) is still ONE day;
 * duplicate date rows collapse through the per-id day Set.
 */
export function tallyJournalRuleUsage(rows: JournalRuleMarkRow[]): JournalRuleUsage {
  const daysById = new Map<string, Set<string>>()
  for (const row of rows) {
    const ids = new Set([...parseIdArray(row.rules_followed), ...parseIdArray(row.rule_violations)])
    for (const id of ids) {
      if (!id) continue
      let days = daysById.get(id)
      if (!days) {
        days = new Set<string>()
        daysById.set(id, days)
      }
      days.add(row.date)
    }
  }
  const out: JournalRuleUsage = {}
  for (const [id, days] of daysById) out[id] = days.size
  return out
}

/**
 * Pure conversion for the Beat-2 migration. Turns the legacy `journal_rules`
 * string[] + every journal row's NAME refs into the id-stable model:
 *   - each active rule name -> a JournalRule (archived:false), deduped by name;
 *   - every journal-row name that is NOT an active rule -> resurrected as an
 *     archived JournalRule (deduped by name across ALL rows);
 *   - each row's rules_followed/rule_violations remapped name -> id, 1:1
 *     (duplicates preserved, so total refs in == total refs out — CONSERVATION).
 * No id is ever dropped; orphans are archived, never discarded. No DB/IO here.
 */
export function convertLegacyJournalRules(
  rulesJson: string,
  journalRows: JournalRowRaw[],
): LegacyConversionResult {
  const nameToId = new Map<string, string>()
  const rulesList: JournalRule[] = []

  // Active rules from the current list (dedupe by name, first wins, order kept).
  for (const name of parseNames(rulesJson)) {
    if (nameToId.has(name)) continue
    const rule = makeJournalRule(name)
    nameToId.set(name, rule.id)
    rulesList.push(rule)
  }

  // Collect orphan names across ALL rows first (dedupe, first-seen order).
  const orphanNames: string[] = []
  const orphanSeen = new Set<string>()
  for (const row of journalRows) {
    const names = [...parseNames(row.rules_followed), ...parseNames(row.rule_violations)]
    for (const name of names) {
      if (!nameToId.has(name) && !orphanSeen.has(name)) {
        orphanSeen.add(name)
        orphanNames.push(name)
      }
    }
  }

  // Resurrect each distinct orphan as an ARCHIVED rule.
  for (const name of orphanNames) {
    const rule = { ...makeJournalRule(name), archived: true }
    nameToId.set(name, rule.id)
    rulesList.push(rule)
  }

  // Remap every row name -> id (1:1; every name now has an id, so the `!` holds).
  const rowUpdates: JournalRowIdUpdate[] = journalRows.map((row) => ({
    date: row.date,
    rules_followed: parseNames(row.rules_followed).map((n) => nameToId.get(n)!),
    rule_violations: parseNames(row.rule_violations).map((n) => nameToId.get(n)!),
  }))

  return { newRulesList: rulesList, rowUpdates }
}
