// v0.2.5 (schema 32 → 33) — playbook confluence foundation. Three additive,
// idempotent changes, in one place:
//   1. NEW `trade_playbooks` junction — holds only the EXTRA confluence tags
//      (secondary signals). The PRIMARY, grade-bearing setup stays on
//      trades.playbook_id and is NOT duplicated here.
//   2. NEW `playbooks.is_system` flag (0/1) — marks app-owned, protected rows.
//   3. SEED one protected "No Setup" playbook (is_system = 1).
//
// Like migrate-add-deleted-at, this moves NO existing data — it only adds a
// table, a column, and one guarded seed row — so it needs NO backup closure,
// NO settings latch, and NO version gate. It is registered UNCONDITIONALLY in
// migrateAfterSchema (runs every launch) and self-guards via PRAGMA inspection,
// CREATE … IF NOT EXISTS, and an is_system existence-check. Extracted into its
// own type-only module purely so it's unit-testable under vitest (importing
// database.ts would load better-sqlite3's native binary, which can't load
// there — the same constraint the other migrate-*.ts modules work around).
//
// IDEMPOTENCY / FRESH-INSTALL note: because it runs every boot (not gated on
// priorVersion), fresh installs (priorVersion 0) are covered too — a version
// gate would silently skip them, leaving a new user with no junction / no
// is_system / no "No Setup". The schema-33 bump is for release-tracking only;
// it does not gate this migration.
//
// SEED uses an EXISTENCE-CHECK (COUNT WHERE is_system = 1), not a settings
// latch: the "No Setup" row is protected, so if it ever goes missing the next
// boot recreates it (self-healing). The INSERT is a PLAIN insert (never INSERT
// OR IGNORE) so a name collision with a pre-existing user playbook named
// "No Setup" SURFACES as a throw rather than being silently swallowed —
// playbooks.name is UNIQUE.
//
// FK story: the junction declares FK + ON DELETE CASCADE on both columns —
// matching the convention every other CREATE TABLE here uses (executions,
// trade_technicals, trade_notes) under foreign_keys = ON. The DB clears a
// trade's confluence rows when the trade is deleted, and a playbook's rows when
// the playbook is deleted, with no app-side cleanup needed.

import type Database from 'better-sqlite3'

/** Placeholder tier for the seeded "No Setup" row. Its effective N/A grade is
 *  handled in a later beat; 'C' is a temporary, non-null value that satisfies
 *  the NOT NULL column without claiming quality. */
const NO_SETUP_TIER = 'C'

export function migrateConfluenceJunction(conn: Database.Database): void {
  // 1. Junction for the EXTRA confluence tags. Composite PK (trade_id,
  //    playbook_id) makes a (trade, playbook) pair unique — a trade can't carry
  //    the same secondary tag twice. FK + ON DELETE CASCADE on both columns lets
  //    the DB clear these rows when the trade OR the playbook is deleted (no
  //    orphans). IF NOT EXISTS so it's a no-op every boot.
  conn.exec(`
    CREATE TABLE IF NOT EXISTS trade_playbooks (
      trade_id    INTEGER NOT NULL REFERENCES trades(id)    ON DELETE CASCADE,
      playbook_id INTEGER NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (trade_id, playbook_id)
    )
  `)
  // Reverse-lookup index: "which trades carry playbook X as a confluence tag".
  conn.exec(
    'CREATE INDEX IF NOT EXISTS idx_trade_playbooks_playbook ON trade_playbooks(playbook_id)',
  )

  // 2. is_system flag — guarded ALTER (mirror of migrate-add-deleted-at). On a
  //    fresh install SCHEMA_SQL already declares the column, so the guard is
  //    false here; on the v32 → v33 upgrade the ALTER adds it.
  const playbookCols = conn
    .prepare('PRAGMA table_info(playbooks)')
    .all() as { name: string }[]
  if (!playbookCols.some((c) => c.name === 'is_system')) {
    conn.exec('ALTER TABLE playbooks ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0')
  }

  // 3. Seed the protected "No Setup" row — only when no is_system row exists
  //    (self-healing existence-check, not a latch). Plain INSERT surfaces a
  //    UNIQUE-name collision instead of swallowing it. description / rules /
  //    ideal_conditions / archived / created_at are left at their column
  //    defaults; the effective N/A grade is a later beat (placeholder tier 'C').
  const { n } = conn
    .prepare('SELECT COUNT(*) AS n FROM playbooks WHERE is_system = 1')
    .get() as { n: number }
  if (n === 0) {
    conn
      .prepare('INSERT INTO playbooks (name, tier, is_system) VALUES (?, ?, ?)')
      .run('No Setup', NO_SETUP_TIER, 1)
  }
}
