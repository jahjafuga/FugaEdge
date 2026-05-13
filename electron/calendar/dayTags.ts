import { openDatabase } from '../db/database'
import type { DayTagsResult, SaveDayTagsInput } from '@shared/calendar-types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function clean(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const t = String(raw).trim()
    if (!t) continue
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

// Upserts the day's tags onto the journal row. Other journal fields are
// preserved if the row already exists; otherwise a row is created with the
// existing column defaults so the tags don't force phantom premarket/postsession
// journals into existence.
export function saveDayTags(input: SaveDayTagsInput): DayTagsResult {
  if (!DATE_RE.test(input.date)) {
    throw new Error(`Invalid date: ${input.date}`)
  }
  const tags = clean(input.tags)
  const json = JSON.stringify(tags)
  const db = openDatabase()

  db.prepare(`
    INSERT INTO journal (date, day_tags) VALUES (?, ?)
    ON CONFLICT(date) DO UPDATE SET day_tags = excluded.day_tags
  `).run(input.date, json)

  return { date: input.date, tags }
}
