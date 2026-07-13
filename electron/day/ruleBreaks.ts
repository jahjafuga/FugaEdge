import { openDatabase } from '../db/database'
import type { RuleBreaksResult, SaveRuleBreaksInput } from '@shared/day-types'
import { tallyRuleBreakUsage, type RuleBreakUsage } from '@/core/ruleBreaks/usage'

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

// Parse the stored JSON array. Always written as JSON by saveRuleBreaks, so a
// value that isn't a JSON array (absent row, '', or hand-edited garbage) reads
// back as [] — never throws. Mirrors the no-fabricated-data discipline of the
// day_tags / settings parsers.
function parse(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed.startsWith('[')) return []
  try {
    const arr = JSON.parse(trimmed)
    if (Array.isArray(arr)) return arr.map((s) => String(s)).filter(Boolean)
  } catch {
    // fall through to []
  }
  return []
}

// Upsert the day's rule-breaks onto the journal row — the SAME column/upsert
// shape as day_tags (electron/calendar/dayTags.ts:saveDayTags). Other journal
// fields are preserved on update; a fresh row takes the column defaults so
// tagging a break doesn't force a phantom premarket/postsession journal entry
// into existence. This is the write the day-detail IPC handler calls.
export function saveRuleBreaks(input: SaveRuleBreaksInput): RuleBreaksResult {
  if (!DATE_RE.test(input.date)) {
    throw new Error(`Invalid date: ${input.date}`)
  }
  const breaks = cleanRuleBreaks(input.breaks)
  const json = JSON.stringify(breaks)
  const db = openDatabase()
  db.prepare(`
    INSERT INTO journal (date, rule_breaks) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET rule_breaks = excluded.rule_breaks
  `).run(input.date, json)
  return { date: input.date, breaks }
}

// Beat 2 "stop the bleeding" — the usage read behind the Settings freeze guard: for each
// rule-break label, how many DISTINCT journal days carry it. A label with a count > 0 cannot be
// renamed or deleted in Settings until Beat 3 ships a history-preserving rename, because days
// link by NAME and Analytics groups by the raw string, so either edit orphans that history.
//
// The SELECT text is COPIED VERBATIM from the analytics rollup (electron/analytics/get.ts:963-968)
// rather than imported from it, so the guard can never read a different row set than the rollup
// the user is looking at. The tally itself is the PURE core (src/core/ruleBreaks/usage), which
// reuses the same JSON-or-[] parse — one parse path, so a malformed cell counts the same way in
// both places (json_each would instead THROW on the rows JS reads as []).
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

// Read the per-day rule-breaks for the day view. A single-column journal read
// (mirrors electron/journal/get.ts:readSentiment), JSON-parsed; an absent row /
// malformed value reads back as []. getDayDetail calls this so the value lands
// on DayDetail.ruleBreaks.
export function readRuleBreaks(date: string): string[] {
  const db = openDatabase()
  const row = db
    .prepare('SELECT rule_breaks FROM journal WHERE date = ?')
    .get(date) as { rule_breaks: string | null } | undefined
  return parse(row?.rule_breaks)
}
