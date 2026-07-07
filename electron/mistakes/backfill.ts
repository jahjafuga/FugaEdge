// Orphan-mistakes backfill (mistakes-recovery Beat 1) — PURE core.
//
// schema-34 added mistake_def + trade_mistake but backfilled nothing, so pre-34 tags sit
// orphaned + unread in trades.mistakes_json (a flat JSON string array). Recovery model =
// PRESERVE: each distinct stored string that we can categorise becomes an is_custom=1
// mistake_def under an assigned axis, linked via the junction. mistakes_json is NEVER
// modified — it stays as the permanent fallback.
//
// This module is intentionally electron-free (only a type-only better-sqlite3 import): it
// takes a db handle and is unit-tested against a real in-memory engine, so a future Postgres
// repo can reuse the same shape. The electron-specific pre-migration backup + version gating
// live in the migration wrapper (electron/db/migrate-mistakes-backfill.ts), never here.

import type Database from 'better-sqlite3'
import type { MistakeAxis } from '@shared/mistakes-types'

export interface UncategorizedString {
  /** The verbatim stored string we could not map. */
  string: string
  /** Total occurrences across all trades (matches the measurement's freq). */
  count: number
  /** Distinct trades carrying it. */
  tradeCount: number
}

export interface BackfillReport {
  defsCreated: number
  linksCreated: number
  uncategorizedStrings: UncategorizedString[]
}

// AXIS DICTIONARY — case-insensitive key (verbatim stored string) -> axis. Covers the
// FugaEdge default-10, Lao's customised strings, and Dave's stated vocabulary. A string NOT
// in here is left untouched (no def, no link, no guessed axis) and surfaced in the report.
const DICTIONARY: { axis: MistakeAxis; strings: string[] }[] = [
  {
    axis: 'psychological',
    strings: [
      'Chased extended entry', 'FOMO entry', 'Revenge trade', 'Sized too big',
      'Took profit too early', 'Cut winner too early', 'Held loser too long', 'Ignored stop loss',
      'Extended entry / chasing / FOMO', 'Stop not held', 'Profit not taken', 'Cut winner',
      'Added high', 'Averaged down',
    ],
  },
  {
    axis: 'technical',
    strings: [
      'Traded outside playbook', 'Forced trade on choppy day',
      "MACD X'd / backside", 'No pattern / traded outside playbook', 'Poor stock selection / not obvious',
      'Low volume', 'Bought after high vol red candle', 'Stop too tight', 'Timing', 'Thick Level 2',
      'Technical (e.g. hotkey error)', 'Early Entry',
    ],
  },
]

const AXIS_BY_LOWER: Map<string, MistakeAxis> = (() => {
  const m = new Map<string, MistakeAxis>()
  for (const group of DICTIONARY) for (const s of group.strings) m.set(s.toLowerCase(), group.axis)
  return m
})()

/** Parse a stored mistakes_json into a string[]; null for empty/invalid (never throws). */
function parseStringArray(raw: string | null): string[] | null {
  if (raw == null) return null
  const t = raw.trim()
  if (!t || t === '[]') return null
  try {
    const arr = JSON.parse(t)
    if (!Array.isArray(arr)) return null
    return arr.filter((x): x is string => typeof x === 'string')
  } catch {
    return null
  }
}

export function backfillOrphanMistakes(db: Database.Database): BackfillReport {
  const report: BackfillReport = { defsCreated: 0, linksCreated: 0, uncategorizedStrings: [] }

  // find-or-create a def by (axis, case-insensitive name). Reuses ANY existing row (seed or
  // custom, active preferred) so we never duplicate a (name, axis) — and so a stored string
  // that matches a seed name links to that seed instead of spawning a custom twin.
  const findStmt = db.prepare(
    'SELECT id FROM mistake_def WHERE axis = ? AND lower(name) = lower(?) ORDER BY is_archived ASC, id ASC LIMIT 1',
  )
  const maxSortStmt = db.prepare(
    'SELECT COALESCE(MAX(sort_position), -1) + 1 AS n FROM mistake_def WHERE axis = ?',
  )
  const insertDefStmt = db.prepare(
    'INSERT INTO mistake_def (axis, name, sort_position, is_custom, is_archived) VALUES (?, ?, ?, 1, 0)',
  )
  const insertLinkStmt = db.prepare(
    'INSERT OR IGNORE INTO trade_mistake (trade_id, mistake_def_id) VALUES (?, ?)',
  )

  const defCache = new Map<string, number>() // `${axis}::${lowerName}` -> def id
  const findOrCreateDef = (axis: MistakeAxis, name: string): number => {
    const key = axis + '::' + name.toLowerCase()
    const cached = defCache.get(key)
    if (cached !== undefined) return cached
    const existing = findStmt.get(axis, name) as { id: number } | undefined
    let id: number
    if (existing) {
      id = existing.id
    } else {
      const { n } = maxSortStmt.get(axis) as { n: number }
      const info = insertDefStmt.run(axis, name, n)
      id = Number(info.lastInsertRowid)
      report.defsCreated++
    }
    defCache.set(key, id)
    return id
  }

  const uncategorized = new Map<string, { count: number; trades: Set<number> }>()

  // Every trade with a non-null mistakes_json — soft-deleted included (their tags are still
  // history worth recovering). Parsing/validation happens in JS (portable + tolerant).
  const rows = db
    .prepare('SELECT id, mistakes_json FROM trades WHERE mistakes_json IS NOT NULL')
    .all() as { id: number; mistakes_json: string }[]

  for (const row of rows) {
    const tags = parseStringArray(row.mistakes_json)
    if (!tags) continue
    const linkedLowerInRow = new Set<string>() // at most one link per (trade, def-name)
    for (const raw of tags) {
      const lower = raw.toLowerCase()
      const axis = AXIS_BY_LOWER.get(lower)
      if (axis) {
        if (linkedLowerInRow.has(lower)) continue
        linkedLowerInRow.add(lower)
        const defId = findOrCreateDef(axis, raw)
        const info = insertLinkStmt.run(row.id, defId)
        report.linksCreated += info.changes // 0 when the link already existed (idempotent)
      } else {
        const u = uncategorized.get(raw) ?? { count: 0, trades: new Set<number>() }
        u.count += 1
        u.trades.add(row.id)
        uncategorized.set(raw, u)
      }
    }
  }

  report.uncategorizedStrings = [...uncategorized.entries()]
    .map(([string, v]) => ({ string, count: v.count, tradeCount: v.trades.size }))
    .sort((a, b) => b.count - a.count || a.string.localeCompare(b.string))

  return report
}
