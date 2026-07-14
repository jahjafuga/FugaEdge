import { openDatabase } from '../db/database'
import type { RuleBreaksResult, SaveRuleBreaksInput } from '@shared/day-types'
import { tallyRuleBreakUsage, type RuleBreakUsage } from '@/core/ruleBreaks/usage'
import { readRuleBreakNamesForDate, writeRuleBreakLinksForDate } from '../ruleBreaks/repo'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Dedup + trim + drop-empty, preserving first-seen order. A clone of
// electron/calendar/dayTags.ts:clean — the day_tags storage precedent Phase 2
// mirrors. Pure (no I/O) so it's unit-tested directly.
export function cleanRuleBreaks(breaks: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of breaks) {
    const t = String(raw).trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

// Upsert the day's rule-breaks — the journal.rule_breaks column AND the
// journal_rule_break junction, atomically.
//
// *** THE DUAL-WRITE IS DELIBERATE AND TEMPORARY. IT DIES IN 3b-2. ***
//
// The junction is now AUTHORITATIVE: Analytics (analytics/get.ts) and the day view
// (readRuleBreaks below) both read it, so they see each rule's CURRENT name. The column
// is still written because it remains the permanent fallback and the restore source for
// the pre-migration .bak — but nothing reads it any more.
//
// It can only be kept honest until RENAME exists. The moment a def can be renamed, the
// column would need catalyst-style propagation into every day of history to stay in sync
// (catalyst/repo.ts:105-109 does exactly that to trades.catalyst_type) — and that would
// un-freeze the column, which is what makes the migration re-runnable and what fixture [20]
// depends on. So 3b-2 ships rename AND retires this write together; they are one decision.
//
// ORDER IS LOAD-BEARING: the column upsert runs FIRST because it creates the journal row,
// and journal_rule_break.date REFERENCES journal(date). SQLite does not apply INSERT OR
// IGNORE to foreign-key violations, so links written before the row exists would throw.
export function saveRuleBreaks(input: SaveRuleBreaksInput): RuleBreaksResult {
  if (!DATE_RE.test(input.date)) {
    throw new Error(`Invalid date: ${input.date}`)
  }
  const breaks = cleanRuleBreaks(input.breaks)
  const json = JSON.stringify(breaks)
  const db = openDatabase()

  const tx = db.transaction(() => {
    // 1. the COLUMN — creates the journal row the junction FK needs. Written from the
    //    cleaned INPUT, not from the resolved def names, so the return value (and the
    //    existing contract test's assertion on it) is unchanged. The two can only diverge
    //    on legacy case-drift, where the column keeps both variants and the junction keeps
    //    one; the junction is authoritative, and the next save self-heals the column.
    db.prepare(`
      INSERT INTO journal (date, rule_breaks) VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET rule_breaks = excluded.rule_breaks
    `).run(input.date, json)

    // 2. the JUNCTION — the authoritative write. Find-or-creates a def for a label the
    //    vocabulary does not know (RuleList can still add one, and 3b-2's editor will).
    writeRuleBreakLinksForDate(db, input.date, breaks)
  })
  tx()

  return { date: input.date, breaks }
}

// Beat 2 "stop the bleeding" — the usage read behind the Settings freeze guard: for each
// rule-break label, how many DISTINCT journal days carry it. A label with a count > 0 cannot be
// renamed or deleted in Settings until Beat 3 ships a history-preserving rename, because days
// link by NAME and Analytics groups by the raw string, so either edit orphans that history.
//
// *** THIS IS NOW THE ONLY READER OF journal.rule_breaks, AND THAT IS DELIBERATE. ***
//
// It USED to be justified by parity: the SELECT was copied verbatim from the analytics rollup so
// the guard could never read a different row set than the rollup the user was looking at. 3b-1
// ended that — the rollup reads the JUNCTION now. This one does NOT follow it, on purpose.
//
// WHY IT STAYS ON THE COLUMN: the junction FOLDS CASE by construction (ux_rule_break_def_name is
// UNIQUE(lower(name)), so "Overtrading" and "overtrading" are ONE def). This guard must NOT fold
// case, and that is a decided question with its reasoning on file at src/core/ruleBreaks/usage.ts:42-44:
// a case-drifted history label is ALREADY an orphan — it is not in the vocabulary at all — so folding
// case would FREEZE a live vocabulary entry on account of a lookalike it can never orphan. Re-pointing
// this at the junction would silently reverse that decision.
//
// IT IS STILL CORRECT TODAY because saveRuleBreaks DUAL-WRITES: the column stays current, so for every
// label the vocabulary actually holds, column-usage == junction-usage.
//
// *** IT STOPS BEING CORRECT IN 3b-2. *** That beat retires the dual-write; the column then freezes and
// this UNDER-counts every rule tagged afterwards — a freeze guard that reports 0 is not a guard, and it
// would hand back the exact delete-orphans-history bug Beat 2 exists to prevent. 3b-2 must replace this
// with the server-side count over journal_rule_break, keyed by def ID rather than by label — which is
// also what dissolves the case-fold objection above, because an ID cannot drift.
//
// READ-ONLY: no write, therefore NO bumpDataVersion. day/ipc.ts:27-34 mandates the bump for
// WRITES that feed the analytics rollup; DAY_GET_DETAIL (a read, :19-23) deliberately does not.
export function getRuleBreakUsage(): RuleBreakUsage {
  const db = openDatabase()
  const rows = db
    .prepare(`
      SELECT date, rule_breaks FROM journal
      WHERE rule_breaks IS NOT NULL AND rule_breaks != '' AND rule_breaks != '[]'
    `)
    .all() as { date: string; rule_breaks: string }[]
  return tallyRuleBreakUsage(rows)
}

// Read the per-day rule-breaks for the day view. getDayDetail calls this so the value
// lands on DayDetail.ruleBreaks.
//
// 3b-1 — this now reads the JUNCTION, not journal.rule_breaks. The signature is
// unchanged (string[]), because the day view still deals in labels; what changed is
// WHICH label it gets. The junction JOINs to rule_break_def, so it yields the rule's
// CURRENT name — which is the entire point of the reshape. A column read would keep
// showing the name the rule had ON THE DAY IT WAS TAGGED, and once 3b-2 ships rename
// that is a stale label the user has no way to correct.
//
// A day with no links reads back as [] — same as before for a day with no breaks. The
// JSON-parse defensiveness the column read used to carry did not vanish with it: the
// column is still parsed by getRuleBreakUsage above, via the pure tallyRuleBreakUsage
// (its malformed-cell case is src/core/ruleBreaks/__tests__/usage.test.ts:42).
export function readRuleBreaks(date: string): string[] {
  const db = openDatabase()
  return readRuleBreakNamesForDate(db, date)
}
