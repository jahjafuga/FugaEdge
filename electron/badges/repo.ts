// v0.2.5 Phase A — badge awards repo (spec §B). The badge CATALOG is code
// (src/core/badges/catalog.ts, Phase B); this table records only awards.
// Dedup rides the expression index idx_badge_awards_identity on
// (badge_id, IFNULL(tier,'')) — a plain UNIQUE(badge_id, tier) would NOT
// dedupe untiered awards because SQLite treats NULLs as distinct (P2).

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import type { AwardBadgeInput, BadgeAward } from '@shared/identity-types'

export function listBadgeAwards(): BadgeAward[] {
  const db = openDatabase()
  return db
    .prepare(
      'SELECT id, badge_id, tier, awarded_at, source_ref FROM badge_awards ORDER BY awarded_at DESC',
    )
    .all() as BadgeAward[]
}

/** Insert an award; the duplicate (badge_id, tier-or-untiered) pair is
 *  silently ignored. Returns whether a row actually landed. */
export function awardBadge(input: AwardBadgeInput): { inserted: boolean } {
  const db = openDatabase()
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO badge_awards (id, badge_id, tier, awarded_at, source_ref)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      newUlid(),
      input.badge_id,
      input.tier,
      new Date().toISOString(),
      input.source_ref ?? null,
    )
  return { inserted: info.changes > 0 }
}
