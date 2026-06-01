// v0.2.3 (schema 22 → 23) — soft-delete support: a nullable trades.deleted_at
// column plus a supporting partial index.
//
// Unlike migrate-float-rename this migration moves NO data — it only adds a
// column and an index — so it needs NO backup closure, NO settings latch, and
// NO version gate. It's the same idempotent PRAGMA-gated ALTER idiom used
// inline for industry/country/catalyst_type/float_shares in migrateAfterSchema,
// extracted into this type-only module purely so it's unit-testable under
// vitest (importing database.ts would load better-sqlite3's native binary,
// which can't load there — the same constraint the other migrate-*.ts modules
// work around). Called once per launch from migrateAfterSchema; the PRAGMA
// guard and IF NOT EXISTS keep it a no-op on every subsequent boot.

import type Database from 'better-sqlite3'

export function migrateAddDeletedAt(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  if (!cols.some((c) => c.name === 'deleted_at')) {
    // NULL = live; an ISO-8601 UTC timestamp = soft-deleted (in Trash).
    conn.exec('ALTER TABLE trades ADD COLUMN deleted_at TEXT')
  }
  // Partial index supporting the `deleted_at IS NULL` predicate that now sits
  // on every read path. IF NOT EXISTS so fresh installs (which never hit the
  // ALTER) and every relaunch are safe no-ops.
  conn.exec(
    `CREATE INDEX IF NOT EXISTS idx_trades_deleted_at
     ON trades(deleted_at) WHERE deleted_at IS NULL`,
  )
}
