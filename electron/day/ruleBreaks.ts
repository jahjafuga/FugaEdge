import { openDatabase } from '../db/database'
import type { RuleBreaksResult, SaveRuleBreaksInput } from '@shared/day-types'

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
