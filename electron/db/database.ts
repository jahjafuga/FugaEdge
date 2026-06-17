import { app } from 'electron'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_SQL } from './schema'
import { suggestTierForPlaybookName } from '@/core/playbook/tierSeed'
import { migrateTimestampsToUtc } from './migrate-tz-utc'
import { migrateContentHash } from './migrate-content-hash'
import { migrateFloatRename } from './migrate-float-rename'
import { migrateAddDeletedAt } from './migrate-add-deleted-at'
import { migrateScratchReclassify } from './migrate-scratch-reclassify'
import { migrateResetMaeMfe } from './migrate-reset-mae-mfe'
import { migrateSentimentPolarity } from './migrate-sentiment-polarity'
import { migrateAddWarmupBars } from './migrate-add-warmup-bars'
import { migrateAddWarmupAttemptedAt } from './migrate-add-warmup-attempted-at'
import { migrateAddWarmupError } from './migrate-add-warmup-error'

// v0.2.0 introduces the universal-import schema (schema_version 18).
// maybeBackupForV020() copies the on-disk DB before any structural change
// runs, latched in settings so it executes at most once per machine.
const V020_TARGET_SCHEMA_VERSION = 18
const V020_BACKUP_LATCH_KEY = 'v020_backup_done'

// Latch for the Day 8.5 tz-utc migration's pre-migration backup (schema 18→19).
const TZ_BACKUP_LATCH_KEY = 'tz_migration_backup_done'

// Latch for the v0.2.1 content_hash migration's pre-migration backup (schema 19→20).
const CONTENT_HASH_BACKUP_LATCH_KEY = 'content_hash_migration_backup_done'

// Latch for the v0.2.2 float-rename migration's pre-migration backup (schema 20→21).
const FLOAT_RENAME_BACKUP_LATCH_KEY = 'float_rename_migration_backup_done'
const SCRATCH_RECLASSIFY_BACKUP_LATCH_KEY = 'scratch_reclassify_migration_backup_done'

// Latch for the v0.2.3 mae/mfe-reset migration's pre-migration backup (schema 24→25).
const RESET_MAE_MFE_BACKUP_LATCH_KEY = 'mae_mfe_reset_migration_backup_done'

// Latch for the v0.2.5 sentiment-polarity migration's pre-migration backup (schema 28→29).
const SENTIMENT_POLARITY_BACKUP_LATCH_KEY = 'sentiment_polarity_migration_backup_done'

let db: Database.Database | null = null

// D1 (v0.2.5 Session 0) — optional DB-path override, set once at boot from
// resolveDataDirs (FUGAEDGE_DB_PATH, dev-only; packaged builds always pass
// null). Module-scoped like the `db` singleton above. Every consumer of the
// DB file location goes through getDbPath(), so the override carries to the
// settings Data card, pre-import backups, and the migration backups alike.
let dbPathOverride: string | null = null

export function setDbPathOverride(path: string | null): void {
  dbPathOverride = path
}

export function getDbPath(): string {
  return dbPathOverride ?? join(app.getPath('userData'), 'fugaedge.db')
}

// Read the persisted schema version from _meta. Returns 0 for a fresh DB (no
// _meta row yet) or any read failure. Captured before SCHEMA_SQL re-stamps
// the value so migrateAfterSchema can tell an upgrading DB from a fresh one.
function readSchemaVersion(conn: Database.Database): number {
  try {
    const row = conn
      .prepare("SELECT value FROM _meta WHERE key='schema_version'")
      .get() as { value: string } | undefined
    return row ? Number.parseInt(row.value, 10) || 0 : 0
  } catch {
    return 0
  }
}

// One-shot copy of the pre-rebrand DB on first launch under the new product
// name. The rebrand changed `app.getPath('userData')` itself — from
// %APPDATA%\fugajournal to %APPDATA%\fugaedge (or %APPDATA%\FugaEdge once
// packaged). So the legacy file lives in a sibling directory, not inside
// the new userData dir. We look for it explicitly and copy (not rename) so
// the original stays as a safety backup. WAL/SHM sidecars come along.
//
// Skips if a new DB already exists at the destination — never clobbers.
function migrateLegacyDbFile(): void {
  // D1 (v0.2.5 Session 0) — packaged-only. In dev, userData is the isolated
  // fugaedge-dev dir (or a FUGAEDGE_DB_PATH fixture): silently seeding a
  // fresh dev profile from the FugaJournal-era DB would defeat the isolation
  // and resurrect stale real data on every clean dev start. The rebrand copy
  // is a real-install upgrade path; packaged builds keep it unchanged.
  if (!app.isPackaged) return
  const userData = app.getPath('userData')
  const newPath = getDbPath()
  if (existsSync(newPath)) return
  // Walk one level up from the current userData dir and check the well-known
  // FugaJournal-era directory name.
  const oldDir = join(userData, '..', 'fugajournal')
  const oldPath = join(oldDir, 'fugajournal.db')
  if (!existsSync(oldPath)) return
  try {
    mkdirSync(userData, { recursive: true })
    copyFileSync(oldPath, newPath)
    for (const suffix of ['-wal', '-shm']) {
      const oldSidecar = oldPath + suffix
      const newSidecar = newPath + suffix
      if (existsSync(oldSidecar) && !existsSync(newSidecar)) {
        copyFileSync(oldSidecar, newSidecar)
      }
    }
    console.info(`[FE db] copied legacy DB ${oldPath} → ${newPath}`)
  } catch (e) {
    console.error('[FE db] legacy copy failed:', e)
  }
}

export function openDatabase(): Database.Database {
  if (db) return db
  migrateLegacyDbFile()
  const path = getDbPath()
  // D1 — one boot line so a glance at the console answers "which DB am I
  // actually on?" in both dev (fugaedge-dev / FUGAEDGE_DB_PATH) and packaged.
  console.info(`[db] ${app.isPackaged ? 'packaged' : 'dev'} — ${path}`)
  db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Performance pragmas — safe defaults for a single-user desktop DB.
  //   synchronous = NORMAL: WAL flushes at checkpoint instead of every commit.
  //     Crash-safe (no torn writes), ~2-3x faster on bulk imports.
  //   cache_size = -32000: 32 MB page cache (negative = KB, not pages).
  //   mmap_size = 256 MB: SQLite memory-maps the file for cheap reads.
  //   temp_store = MEMORY: keep temp B-trees in RAM, not /tmp.
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -32000')
  db.pragma('mmap_size = 268435456')
  db.pragma('temp_store = MEMORY')
  // Capture the on-disk schema version BEFORE SCHEMA_SQL re-stamps it — the
  // Day 8.5 tz-utc migration is gated on the pre-launch version.
  const priorVersion = readSchemaVersion(db)
  maybeBackupForV020(db, path)
  migrateBeforeSchema(db)
  db.exec(SCHEMA_SQL)
  migrateAfterSchema(db, priorVersion, path)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

export function listTables(): string[] {
  const conn = openDatabase()
  const rows = conn
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]
  return rows.map((r) => r.name)
}

// One-shot DB file copy taken right before the v0.2.0 universal-import
// migration runs. Skips on fresh installs (no _meta row), on already-migrated
// DBs (schema_version >= 18), and on machines where the latch has already
// been set. WAL is force-checkpointed before the copy so the main DB file
// is self-contained and the backup needs no sidecars.
//
// Failure to back up is loud (console.error) but non-fatal — the migration
// still proceeds. SQLite's ALTER TABLE ADD COLUMN is itself non-destructive
// (rows are not rewritten), so a missing backup doesn't put existing data
// at risk; it just removes the manual-rollback option.
function maybeBackupForV020(conn: Database.Database, dbPath: string): void {
  // 1) Detect current schema version. _meta missing == fresh install.
  let currentVersion = 0
  try {
    const row = conn
      .prepare("SELECT value FROM _meta WHERE key='schema_version'")
      .get() as { value: string } | undefined
    if (row) currentVersion = Number.parseInt(row.value, 10) || 0
  } catch {
    return
  }
  if (currentVersion === 0) return
  if (currentVersion >= V020_TARGET_SCHEMA_VERSION) return

  // 2) Latch check — has a v0.2.0 backup already been written?
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(V020_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings table not yet created but _meta says version > 0 — wildly
    // inconsistent state we shouldn't try to recover from here.
    return
  }

  // 3) Compute backup destination.
  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `fugaedge.db.pre-v0.2.0-${ts}.bak`)

  // 4) Checkpoint WAL into the main file so the copy is self-contained.
  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(`[FE db] wal_checkpoint before v0.2.0 backup failed: ${e}`)
  }

  // 5) Copy. Sidecars are usually empty after a TRUNCATE checkpoint but
  //    copy any that still exist defensively.
  try {
    mkdirSync(backupDir, { recursive: true })
    copyFileSync(dbPath, backupPath)
    for (const suffix of ['-wal', '-shm']) {
      const src = dbPath + suffix
      const dst = backupPath + suffix
      if (existsSync(src)) copyFileSync(src, dst)
    }
    console.info(
      `[FE db] v0.2.0 pre-migration backup → ${backupPath} ` +
        `(schema v${currentVersion} → v${V020_TARGET_SCHEMA_VERSION})`,
    )
  } catch (e) {
    // Don't latch on failure — the next launch retries until backup succeeds.
    console.error(`[FE db] v0.2.0 backup failed: ${e}`)
    return
  }

  // 6) Latch — settings table is guaranteed to exist here because we only
  //    reach this point when schema_version > 0 (i.e., the v1+ schema has
  //    already run on a prior launch).
  try {
    conn
      .prepare(`
        INSERT INTO settings (key, value) VALUES (?, 'true')
        ON CONFLICT(key) DO UPDATE SET value = 'true'
      `)
      .run(V020_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(`[FE db] v0.2.0 backup latch write failed: ${e}`)
  }
}

// Pre-migration backup for the Day 8.5 tz-utc data migration. Passed as the
// `backup` closure to migrateTimestampsToUtc and invoked once, immediately
// before the conversion transaction. Mirrors maybeBackupForV020: checkpoint
// the WAL so the copy is self-contained, then copy the DB file aside.
//
// THROWS on copy failure — migrateTimestampsToUtc catches it and aborts the
// migration rather than mutating data with no safety net. Existing v0.2.0
// users are already at schema 18, so maybeBackupForV020's latch has fired and
// this is their only fresh backup before the timestamp rows are rewritten.
function backupBeforeTzMigration(conn: Database.Database, dbPath: string): void {
  // Skip if a prior launch already wrote this backup.
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(TZ_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable — fall through and attempt the copy anyway.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(backupDir, `fugaedge.db.pre-v0.2.0-tz-${ts}.bak`)

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(`[FE db] wal_checkpoint before tz-migration backup failed: ${e}`)
  }

  // Deliberately NOT wrapped — a copy failure must propagate so the migration
  // aborts instead of mutating data with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(`[FE db] tz-utc pre-migration backup → ${backupPath}`)

  try {
    conn
      .prepare(`
        INSERT INTO settings (key, value) VALUES (?, 'true')
        ON CONFLICT(key) DO UPDATE SET value = 'true'
      `)
      .run(TZ_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(`[FE db] tz-migration backup latch write failed: ${e}`)
  }
}

// Pre-migration backup for the v0.2.2 float-rename data move. Same shape
// as backupBeforeContentHashMigration: checkpoint WAL → copy DB aside →
// throw on failure so migrateFloatRename aborts without mutating data.
// Latch lives in settings so a successful backup on a prior launch is
// never repeated.
function backupBeforeFloatRenameMigration(
  conn: Database.Database,
  dbPath: string,
): void {
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(FLOAT_RENAME_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent — fall
    // through and attempt the copy anyway so we never silently skip safety.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupDir,
    `fugaedge.db.pre-v0.2.2-float-rename-${ts}.bak`,
  )

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(
      `[FE db] wal_checkpoint before float-rename backup failed: ${e}`,
    )
  }

  // Deliberately NOT try/catch wrapped — a copy failure MUST propagate so
  // the migration aborts instead of mutating data with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(`[FE db] float-rename pre-migration backup → ${backupPath}`)

  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(FLOAT_RENAME_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(
      `[FE db] float-rename backup latch write failed: ${e}`,
    )
  }
}

// Pre-migration backup for the v0.2.1 content_hash backfill. Same shape as
// backupBeforeTzMigration: checkpoint WAL → copy DB aside → throw on failure
// so migrateContentHash aborts without mutating data. Latch lives in
// settings so a successful backup on a prior launch is never repeated.
function backupBeforeContentHashMigration(
  conn: Database.Database,
  dbPath: string,
): void {
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(CONTENT_HASH_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent — fall
    // through and attempt the copy anyway so we never silently skip safety.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupDir,
    `fugaedge.db.pre-v0.2.1-content-hash-${ts}.bak`,
  )

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(
      `[FE db] wal_checkpoint before content-hash backup failed: ${e}`,
    )
  }

  // Deliberately NOT try/catch wrapped — a copy failure MUST propagate so
  // the migration aborts instead of mutating data with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(`[FE db] content-hash pre-migration backup → ${backupPath}`)

  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(CONTENT_HASH_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(
      `[FE db] content-hash backup latch write failed: ${e}`,
    )
  }
}

// Pre-migration backup for the v0.2.3 scratch-reclassify daily_summary
// backfill. Same shape as backupBeforeContentHashMigration: checkpoint WAL →
// copy DB aside → throw on failure so migrateScratchReclassify aborts without
// recomputing. The backfill only rewrites the DERIVED daily_summary cache, so
// this backup is defense-in-depth (consistency with the other migrations).
// Latch lives in settings so a successful backup on a prior launch is never
// repeated.
function backupBeforeScratchReclassifyMigration(
  conn: Database.Database,
  dbPath: string,
): void {
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SCRATCH_RECLASSIFY_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent — fall
    // through and attempt the copy anyway so we never silently skip safety.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupDir,
    `fugaedge.db.pre-v0.2.3-scratch-reclassify-${ts}.bak`,
  )

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(
      `[FE db] wal_checkpoint before scratch-reclassify backup failed: ${e}`,
    )
  }

  // Deliberately NOT try/catch wrapped — a copy failure MUST propagate so the
  // migration aborts instead of recomputing with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(
    `[FE db] scratch-reclassify pre-migration backup → ${backupPath}`,
  )

  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(SCRATCH_RECLASSIFY_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(
      `[FE db] scratch-reclassify backup latch write failed: ${e}`,
    )
  }
}

// Pre-migration backup for the v0.2.3 mae/mfe-reset wipe. Same shape as
// backupBeforeScratchReclassifyMigration: checkpoint WAL → copy DB aside →
// throw on failure so migrateResetMaeMfe aborts without wiping. Unlike the
// other v0.2.x migrations this one nulls real computed values that are only
// recoverable if intraday_bars coverage still holds — so this backup is the
// genuine safety net, not just defense-in-depth. Latch lives in settings so a
// successful backup on a prior launch is never repeated.
function backupBeforeMaeMfeResetMigration(
  conn: Database.Database,
  dbPath: string,
): void {
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(RESET_MAE_MFE_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent — fall
    // through and attempt the copy anyway so we never silently skip safety.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupDir,
    `fugaedge.db.pre-v0.2.3-mae-mfe-reset-${ts}.bak`,
  )

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(
      `[FE db] wal_checkpoint before mae/mfe-reset backup failed: ${e}`,
    )
  }

  // Deliberately NOT try/catch wrapped — a copy failure MUST propagate so the
  // migration aborts instead of wiping with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(`[FE db] mae/mfe-reset pre-migration backup → ${backupPath}`)

  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(RESET_MAE_MFE_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(`[FE db] mae/mfe-reset backup latch write failed: ${e}`)
  }
}

// Pre-migration backup for the v0.2.5 sentiment-polarity flip. Same shape as
// backupBeforeMaeMfeResetMigration: checkpoint WAL → copy DB aside → throw on
// failure so migrateSentimentPolarity aborts without flipping. This flip
// rewrites real user-entered sentiment values IN PLACE (the transform is its
// own inverse, so a hand-rollback is re-applying the same UPDATE — but the .bak
// is the certain safety net), so a backup failure MUST abort before the UPDATE.
// Latch lives in settings so a successful backup on a prior launch is never
// repeated.
function backupBeforeSentimentPolarityMigration(
  conn: Database.Database,
  dbPath: string,
): void {
  try {
    const row = conn
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(SENTIMENT_POLARITY_BACKUP_LATCH_KEY) as { value: string } | undefined
    if (row?.value === 'true') return
  } catch {
    // settings unreadable on a versioned DB is wildly inconsistent — fall
    // through and attempt the copy anyway so we never silently skip safety.
  }

  const backupDir = join(app.getPath('userData'), 'backups')
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = join(
    backupDir,
    `fugaedge.db.pre-v0.2.5-sentiment-polarity-${ts}.bak`,
  )

  try {
    conn.pragma('wal_checkpoint(TRUNCATE)')
  } catch (e) {
    console.info(
      `[FE db] wal_checkpoint before sentiment-polarity backup failed: ${e}`,
    )
  }

  // Deliberately NOT try/catch wrapped — a copy failure MUST propagate so the
  // migration aborts instead of flipping with no safety net.
  mkdirSync(backupDir, { recursive: true })
  copyFileSync(dbPath, backupPath)
  for (const suffix of ['-wal', '-shm']) {
    const src = dbPath + suffix
    if (existsSync(src)) copyFileSync(src, backupPath + suffix)
  }
  console.info(`[FE db] sentiment-polarity pre-migration backup → ${backupPath}`)

  try {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run(SENTIMENT_POLARITY_BACKUP_LATCH_KEY)
  } catch (e) {
    console.error(`[FE db] sentiment-polarity backup latch write failed: ${e}`)
  }
}

// Migrations that need to run BEFORE the v2 schema CREATEs (since they drop
// incompatible tables that the CREATE TABLE IF NOT EXISTS would otherwise
// leave in their old shape).
function migrateBeforeSchema(conn: Database.Database): void {
  let version = 0
  try {
    const row = conn
      .prepare("SELECT value FROM _meta WHERE key='schema_version'")
      .get() as { value: string } | undefined
    if (row) version = Number.parseInt(row.value, 10) || 0
  } catch {
    // _meta doesn't exist yet — fresh database, nothing to migrate.
  }

  if (version > 0 && version < 2) {
    // v1 trades had UNIQUE(date, symbol) and stored one row per symbol-per-day.
    // v2 stores one row per round trip. Schemas are incompatible — drop the
    // affected tables. journal is preserved (it's keyed by date, not trade id).
    console.info(
      `[FJ db] migrating schema v${version} → v2 — dropping trades/daily_summary/trade_notes`,
    )
    conn.exec(`
      DROP TABLE IF EXISTS trade_notes;
      DROP TABLE IF EXISTS daily_summary;
      DROP TABLE IF EXISTS trades;
    `)
  }
}

// After-schema migrations are additive (ALTER TABLE … ADD COLUMN). They run
// every launch and are gated by PRAGMA inspection so they're idempotent.
function migrateAfterSchema(
  conn: Database.Database,
  priorVersion: number,
  dbPath: string,
): void {
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  const has = (name: string) => cols.some((c) => c.name === name)

  if (!has('entry_timeframe')) {
    conn.exec('ALTER TABLE trades ADD COLUMN entry_timeframe TEXT')
  }
  if (!has('entry_ema9_distance_pct')) {
    conn.exec('ALTER TABLE trades ADD COLUMN entry_ema9_distance_pct REAL')
  }
  if (!has('playbook_id')) {
    // SQLite doesn't allow REFERENCES on ALTER ADD COLUMN, but the column
    // can still hold the foreign key value — playbook joins use the ID
    // directly and a missing playbook just yields a null name.
    conn.exec('ALTER TABLE trades ADD COLUMN playbook_id INTEGER')
  }
  // Index lives here (not in SCHEMA_SQL) so it can ride after the ALTER
  // on fresh installs. IF NOT EXISTS keeps it idempotent on every launch.
  conn.exec('CREATE INDEX IF NOT EXISTS idx_trades_playbook_id ON trades(playbook_id)')
  if (!has('confidence')) {
    // 1..5 integer or null. Set per trade in the UI's expand row.
    conn.exec('ALTER TABLE trades ADD COLUMN confidence INTEGER')
  }
  if (!has('mistakes_json')) {
    // JSON array of mistake labels from settings.mistake_list. Stored as JSON
    // (rather than a join table) because the list is bounded and the per-trade
    // read path always wants the whole array anyway.
    conn.exec("ALTER TABLE trades ADD COLUMN mistakes_json TEXT NOT NULL DEFAULT '[]'")
  }
  if (!has('planned_risk')) {
    // The $ amount the trader was willing to lose on the trade. R-multiple
    // is computed at read time as net_pnl / planned_risk.
    conn.exec('ALTER TABLE trades ADD COLUMN planned_risk REAL')
  }
  if (!has('float_shares')) {
    // Tradable share float at the time of the trade. INTEGER (nullable).
    // Auto-populated on import from market_data.float when available; the
    // user can override via the trade detail modal's Float field.
    conn.exec('ALTER TABLE trades ADD COLUMN float_shares INTEGER')
  }
  if (!has('daily_change_pct')) {
    // v0.2.5 EdgeIQ Trader DNA (schema 30) — at-entry daily % change vs the
    // prior session's close: (entryPrice − prevClose) / prevClose × 100. NULL
    // until a later beat's rate-limited backfill fills it (the fetch still
    // drops OHLC today). Additive REAL column; same PRAGMA-gated idiom as the
    // columns above — no data transform, no backup.
    conn.exec('ALTER TABLE trades ADD COLUMN daily_change_pct REAL')
  }
  if (!has('rvol')) {
    // v0.2.5 EdgeIQ Trader DNA (schema 32) — full-day relative volume:
    // daily_volumes[date] / avg_volume from cached market_data (the Reports
    // definition). NULL until the fire-once CACHE re-derive fills it (ZERO API,
    // mirrors mae/mfe). Additive REAL column; same PRAGMA-gated idiom.
    conn.exec('ALTER TABLE trades ADD COLUMN rvol REAL')
  }
  if (!has('shares_outstanding')) {
    // v0.2.2 Commit A — issued share count, preserved when the legacy
    // shares-outstanding-mislabeled-as-float was renamed. Populated by
    // migrate-float-rename (legacy data move) and by Commit B's FMP
    // enrichment (going forward). float_shares stays the float column;
    // shares_outstanding is the new, honestly-labeled column for issued
    // share count.
    conn.exec('ALTER TABLE trades ADD COLUMN shares_outstanding INTEGER')
  }
  if (!has('catalyst_type')) {
    // Free-form catalyst tag for the trade (News, Earnings, Halt Resume,
    // FDA/Clinical, Offering, etc.). Stored as TEXT so the picker can grow
    // its option list without a schema change.
    conn.exec('ALTER TABLE trades ADD COLUMN catalyst_type TEXT')
  }
  if (!has('days_since_catalyst')) {
    // Integer days since the catalyst event. 0 = same-day, 1 = day-2
    // continuation, etc. Nullable when not applicable.
    conn.exec('ALTER TABLE trades ADD COLUMN days_since_catalyst INTEGER')
  }
  if (!has('mae')) {
    // Maximum Adverse Excursion — $/share the trade moved AGAINST the
    // direction between entry and exit. Always >= 0. Computed from
    // intraday_bars (long: entry - min_low; short: max_high - entry) and
    // cached here so the Analytics → Execution tab can roll up without a
    // bars rescan per render.
    conn.exec('ALTER TABLE trades ADD COLUMN mae REAL')
  }
  if (!has('mfe')) {
    // Maximum Favorable Excursion — $/share the trade moved IN FAVOR of
    // the direction between entry and exit. Always >= 0. Symmetric to mae.
    conn.exec('ALTER TABLE trades ADD COLUMN mfe REAL')
  }
  if (!has('planned_stop_loss_price')) {
    // Pre-trade stop loss PRICE (e.g. $10.20). Risk per share is then
    // |avg_entry - planned_stop_loss_price|, total $ risk is risk × shares,
    // and R-multiple is net_pnl / total_risk. Takes precedence over the
    // older planned_risk column when set; planned_risk is kept for
    // backwards-compat on legacy trades.
    conn.exec('ALTER TABLE trades ADD COLUMN planned_stop_loss_price REAL')
  }
  if (!has('country')) {
    // ISO 3166-1 alpha-2 of the company's country of OPERATIONS (not
    // incorporation). Resolved from Polygon's /v3/reference/tickers and
    // overridable per trade via the detail modal. Nullable when no data.
    conn.exec('ALTER TABLE trades ADD COLUMN country TEXT')
  }
  if (!has('country_name')) {
    // Human-readable country name cached at write time so list/breakdown
    // queries don't have to join through a static lookup table.
    conn.exec('ALTER TABLE trades ADD COLUMN country_name TEXT')
  }
  if (!has('region')) {
    // Bucket key (USA, China, Europe, ...). One country maps to exactly
    // one region; see src/core/country/regions.ts REGION_MAP.
    conn.exec('ALTER TABLE trades ADD COLUMN region TEXT')
  }
  if (!has('country_source')) {
    // Where the country value came from. 'polygon' = auto-detected,
    // 'manual' = user override (NEVER overwritten by backfill),
    // 'unknown' = not set / could not resolve. NULL on rows imported
    // before this migration — treated as 'unknown' by readers.
    conn.exec('ALTER TABLE trades ADD COLUMN country_source TEXT')
  }
  // Index on region for fast breakdown queries (group-by region).
  conn.exec('CREATE INDEX IF NOT EXISTS idx_trades_region ON trades(region)')

  // v0.2.3 soft-delete — add trades.deleted_at + its partial index. Additive
  // and idempotent (own module so it's unit-testable; see migrate-add-deleted-at.ts).
  migrateAddDeletedAt(conn)

  // v0.2.0 universal-import provenance. Defaults pin existing v0.1.6 rows
  // to DAS/execution — every legacy round trip was produced by parsing a
  // DAS Trades.csv (the daily-summary path produced only fee rows, never
  // trip rows). source_file and account_name stay NULL on legacy data
  // because that information wasn't captured at import time. fees_reported
  // = 0 (i.e. false) because v0.1.6 fees came from the day_fees pro-rata
  // allocation, not from a per-execution feed.
  if (!has('source_broker')) {
    conn.exec("ALTER TABLE trades ADD COLUMN source_broker TEXT NOT NULL DEFAULT 'DAS'")
  }
  if (!has('source_format')) {
    conn.exec("ALTER TABLE trades ADD COLUMN source_format TEXT NOT NULL DEFAULT 'execution'")
  }
  if (!has('source_file')) {
    conn.exec('ALTER TABLE trades ADD COLUMN source_file TEXT')
  }
  if (!has('account_name')) {
    conn.exec('ALTER TABLE trades ADD COLUMN account_name TEXT')
  }
  if (!has('fees_reported')) {
    conn.exec('ALTER TABLE trades ADD COLUMN fees_reported INTEGER NOT NULL DEFAULT 0')
  }
  conn.exec('CREATE INDEX IF NOT EXISTS idx_trades_source_broker ON trades(source_broker)')

  const marketCols = conn.prepare('PRAGMA table_info(market_data)').all() as {
    name: string
  }[]
  const hasMarket = (n: string) => marketCols.some((c) => c.name === n)
  if (!hasMarket('country'))      conn.exec('ALTER TABLE market_data ADD COLUMN country TEXT')
  if (!hasMarket('country_name')) conn.exec('ALTER TABLE market_data ADD COLUMN country_name TEXT')
  if (!hasMarket('region'))       conn.exec('ALTER TABLE market_data ADD COLUMN region TEXT')
  // v0.2.3 Stage 2 (schema 21 → 22) — FMP /stable/profile `industry`, the
  // finer-grained companion to `sector`. Purely additive: a NULL column, no
  // data transform, no backfill — existing rows stay NULL until a future
  // import re-touches them. Same lightweight pattern as country/region above
  // (PRAGMA-gated ALTER is the idempotency mechanism; no module/latch/backup
  // needed because nothing can be lost adding a NULL column).
  if (!hasMarket('industry'))     conn.exec('ALTER TABLE market_data ADD COLUMN industry TEXT')
  // v0.2.2 Commit A — issued share count, parallel to the float column.
  // On a fresh install SCHEMA_SQL already creates this column (so the
  // guard is false here); on the v20 → v21 upgrade path the ALTER fires
  // before migrate-float-rename copies the legacy values in.
  if (!hasMarket('shares_outstanding')) {
    conn.exec('ALTER TABLE market_data ADD COLUMN shares_outstanding REAL')
  }

  const journalCols = conn.prepare('PRAGMA table_info(journal)').all() as {
    name: string
  }[]
  if (!journalCols.some((c) => c.name === 'day_tags')) {
    conn.exec("ALTER TABLE journal ADD COLUMN day_tags TEXT NOT NULL DEFAULT '[]'")
  }
  // Voice Journal Phase 1 — per-field voice recording length in SECONDS.
  // Nullable; NULL = no recording (incl. every row predating these columns).
  // The transcript text lands in premarket_notes/postsession_notes — these hold
  // only the duration metadata. Additive nullable columns → no SCHEMA_VERSION
  // bump (the day_tags above / session_meta no_trade_* additive-ALTER precedent).
  const hasJournal = (n: string) => journalCols.some((c) => c.name === n)
  if (!hasJournal('premarket_recording_duration')) {
    conn.exec('ALTER TABLE journal ADD COLUMN premarket_recording_duration INTEGER')
  }
  if (!hasJournal('postsession_recording_duration')) {
    conn.exec('ALTER TABLE journal ADD COLUMN postsession_recording_duration INTEGER')
  }

  // session_meta — no-trade-day flag + reason. Lets the trader log "I sat
  // out today" with context; powers the Dashboard's Today's Session card
  // and counts toward the discipline streak (sitting out IS discipline).
  const sessionCols = conn.prepare('PRAGMA table_info(session_meta)').all() as {
    name: string
  }[]
  const hasSession = (n: string) => sessionCols.some((c) => c.name === n)
  if (!hasSession('no_trade_day')) {
    conn.exec(
      'ALTER TABLE session_meta ADD COLUMN no_trade_day INTEGER NOT NULL DEFAULT 0',
    )
  }
  if (!hasSession('no_trade_reason')) {
    conn.exec(
      "ALTER TABLE session_meta ADD COLUMN no_trade_reason TEXT NOT NULL DEFAULT ''",
    )
  }
  // v0.2.2 Day 4 — day-level mistake tags for the Day Detail Modal. Additive,
  // nullable-with-default; existing rows get '[]'. No data migration / version
  // bump needed (same as the no_trade_* adds above).
  if (!hasSession('day_mistakes_json')) {
    conn.exec(
      "ALTER TABLE session_meta ADD COLUMN day_mistakes_json TEXT NOT NULL DEFAULT '[]'",
    )
  }

  // polygon_api_key is intentionally NOT seeded with a value here — the
  // user pastes their own in Settings → Market Data on first launch.
  // Source must never carry a real key; rotate immediately if a previous
  // commit ever leaked one.

  // v0.1.5: per-playbook tier classification. Adds a TEXT column with a
  // default of 'B' (the neutral tier) so any pre-existing playbook keeps
  // showing in the UI without nulls. The tier feeds the Setup Library
  // badge, the trades table playbook cell, the A+ Setups quick filter,
  // and the Tier Performance analytics card.
  const playbookCols = conn.prepare('PRAGMA table_info(playbooks)').all() as {
    name: string
  }[]
  const hasPlaybook = (n: string) => playbookCols.some((c) => c.name === n)
  if (!hasPlaybook('tier')) {
    conn.exec("ALTER TABLE playbooks ADD COLUMN tier TEXT NOT NULL DEFAULT 'B'")
  }

  // v0.2.5 Session 6 (R2) — goals.preset_id records which preset created a
  // goal; the engine maps it to the named catalog badge at completion
  // (challengeBadgeId), null for custom. Additive PRAGMA-gated ALTER, no
  // version bump (the trade_technicals/warmup precedent). The goals table was
  // just created by SCHEMA_SQL, so it always exists here.
  const goalCols = conn.prepare('PRAGMA table_info(goals)').all() as {
    name: string
  }[]
  if (!goalCols.some((c) => c.name === 'preset_id')) {
    conn.exec('ALTER TABLE goals ADD COLUMN preset_id TEXT')
  }

  seedDefaultPlaybooksOnce(conn)
  seedDefaultPlaybookTiersOnce(conn)

  // Day 8.5 Commit B — convert any pre-existing bare-local-Eastern timestamps
  // to true UTC. Gated on priorVersion (< 19) so it runs at most once; the
  // backup closure is the only fresh safety net for existing v0.2.0 users.
  migrateTimestampsToUtc(conn, priorVersion, {
    backup: () => backupBeforeTzMigration(conn, dbPath),
  })

  // v0.2.1 — add content_hash column + backfill from executions_json + create
  // partial UNIQUE index. Three ordered steps so the constraint can't fail
  // mid-backfill on historical duplicates (the migration phase detects them
  // and leaves the loser row's content_hash NULL).
  if (!has('content_hash')) {
    conn.exec('ALTER TABLE trades ADD COLUMN content_hash TEXT')
  }
  const result = migrateContentHash(conn, priorVersion, {
    backup: () => backupBeforeContentHashMigration(conn, dbPath),
    onStart: (n) => {
      // Boot-time log line so a future renderer-side IPC banner has a clear
      // single source of truth for "what just got migrated". For 100-trade
      // DBs this completes in <100ms; for 5000+ trade DBs the banner
      // prevents "did the app freeze" panic — the line lands in the
      // packaged log file at userData/logs/main.log.
      if (n > 0) {
        console.info(
          `[FE db] content-hash migration: starting backfill of ${n} trade(s)`,
        )
      }
    },
  })
  // Partial UNIQUE index — created idempotently every launch so fresh
  // installs (which never run the migration) also get it. NULLs are
  // excluded by the WHERE clause, so legacy rows the migration couldn't
  // backfill don't violate the constraint.
  conn.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_content_hash
     ON trades(content_hash) WHERE content_hash IS NOT NULL`,
  )
  if (result.ran && result.historicalDuplicates > 0) {
    console.warn(
      `[FE db] content-hash migration completed with ` +
        `${result.historicalDuplicates} historical duplicate(s) detected — ` +
        `see prior warn lines for trade IDs`,
    )
  }

  // v0.2.2 Commit A — float-rename data move. The shares_outstanding
  // columns themselves are added by the additive ALTERs above; this call
  // copies legacy float_shares/float values into them, then NULLs the
  // old columns so Commit B's FMP enrichment can repopulate. Gated by
  // priorVersion + settings latch so it runs exactly once on the v20→v21
  // upgrade and never on fresh installs or subsequent launches.
  migrateFloatRename(conn, priorVersion, {
    backup: () => backupBeforeFloatRenameMigration(conn, dbPath),
  })

  // v0.2.3 scratch-fix — recompute daily_summary for every live date so the
  // stored winners/losers match the new |net_pnl| <= SCRATCH_EPSILON definition
  // (Commit 2b changed the write path; pre-existing rows still hold old counts).
  // Gated by priorVersion + settings latch; the latch is set only AFTER the
  // recompute succeeds, so a failure retries on the next launch. Non-destructive
  // (derived cache rebuilt from trades), but takes a backup for consistency
  // with the other data migrations.
  migrateScratchReclassify(conn, priorVersion, {
    backup: () => backupBeforeScratchReclassifyMigration(conn, dbPath),
  })

  // v0.2.3 (schema 24 → 25) — null every trades.mae/mfe so the columns drop the
  // values computed under the old (pre-α) excursion rule, then arm the
  // background recompute (runPendingMaeMfeBackfill, scheduled by main at
  // ready-to-show). Gated by priorVersion + settings latch; the latch is set
  // only AFTER the wipe succeeds, so a failure retries next launch. The backup
  // closure throws-to-abort because this wipe — unlike the additive/derived
  // migrations above — destroys values only recoverable from cached bars.
  migrateResetMaeMfe(conn, priorVersion, {
    backup: () => backupBeforeMaeMfeResetMigration(conn, dbPath),
  })

  // v0.2.5 (schema 28 → 29) — flip session_meta.sentiment polarity to the
  // intuitive 5 = best / 1 = worst. Gated by priorVersion + settings latch; the
  // flip is an involution, so the version gate (priorVersion < 29) is the
  // load-bearing guard against a double-apply (which would flip back and
  // corrupt). The backup closure throws-to-abort because this rewrites real
  // user-entered values in place.
  migrateSentimentPolarity(conn, priorVersion, {
    backup: () => backupBeforeSentimentPolarityMigration(conn, dbPath),
  })

  // v0.2.5 (schema 30 → 31) — arm the daily_change_pct backfill EXACTLY ONCE.
  // No data change: just set the pending flag on the upgrade (skip fresh
  // installs — nothing to fill). runPendingDailyChangeBackfill consumes + clears
  // it at ready-to-show (the migrate-reset-mae-mfe pattern, but flag-only — no
  // wipe, no backup). Literal key must match electron/market/daily-change-backfill.ts.
  if (priorVersion > 0 && priorVersion < 31) {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('daily_change_backfill_pending', 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run()
  }

  // v0.2.5 (schema 31 → 32) — arm the rvol CACHE re-derive EXACTLY ONCE (same
  // flag-only idiom; ZERO API). runPendingRvolBackfill consumes + clears it at
  // ready-to-show. Literal key must match electron/market/rvol-backfill.ts.
  if (priorVersion > 0 && priorVersion < 32) {
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('rvol_backfill_pending', 'true')
         ON CONFLICT(key) DO UPDATE SET value = 'true'`,
      )
      .run()
  }

  // v0.2.4 — additive intraday_bars.warmup_bars column (prior-day MACD warmup).
  // Idempotent PRAGMA-gated ALTER; no version gate, no backup (legacy rows keep
  // warmup_bars NULL → parseBars maps to []). Same idiom as migrateAddDeletedAt.
  migrateAddWarmupBars(conn)

  // v0.2.4 §K — additive intraday_bars.warmup_attempted_at marker (NULL = never
  // tried). Same PRAGMA-gated, no-version-gate, no-backup idiom; lets
  // runWarmupBackfill skip keys already attempted so empty-warmup dates don't
  // re-fetch every launch.
  migrateAddWarmupAttemptedAt(conn)

  // v0.2.4 §K.1 — additive intraday_bars.warmup_error column (NULL = succeeded /
  // legit-empty, set = threw). Same PRAGMA-gated, no-version-gate, no-backup
  // idiom; lets the §K.1.1 worklist predicate retry transient throws while
  // leaving out-of-coverage keys locked.
  migrateAddWarmupError(conn)
}

// First-run-only seed for the starter set of momentum playbooks. The
// previous design used SCHEMA_SQL with `INSERT OR IGNORE`, which ran on
// every launch — so any playbook the user deleted came right back. The
// `defaults_seeded` settings latch ensures this body only ever runs once.
//
// Behaviour matrix:
//   defaults_seeded = 'true'             → nothing to do
//   defaults_seeded missing OR 'false':
//     existing playbooks present         → user is upgrading; mark latch and skip seed
//     no playbooks                       → fresh install; insert defaults + mark latch
function seedDefaultPlaybooksOnce(conn: Database.Database): void {
  const flag = conn
    .prepare("SELECT value FROM settings WHERE key = 'defaults_seeded'")
    .get() as { value: string } | undefined
  if (flag?.value === 'true') return

  const existing = conn
    .prepare('SELECT COUNT(*) AS n FROM playbooks')
    .get() as { n: number }

  if (existing.n === 0) {
    const defaults: { name: string; description: string }[] = [
      {
        name: '1-min Pullback',
        description:
          'Pullback to moving average / prior consolidation on the 1-minute chart after a momentum push.',
      },
      {
        name: '5-min Pullback',
        description:
          'Same pullback structure but read on the 5-minute chart — slower, larger setups.',
      },
      {
        name: 'Bull Flag',
        description:
          'Tight consolidation flag after a sharp upward push. Enter on the breakout of the flag.',
      },
      {
        name: 'Micro Pullback',
        description:
          'Very shallow pullback within a strong sustained trend. Tight stop, big winners on continuation.',
      },
      {
        name: 'First Pullback to VWAP',
        description:
          'First touch of VWAP after the opening push. High R:R when momentum is intact.',
      },
      {
        name: 'ABCD',
        description:
          'Classic A-B-C-D continuation — push (A→B), pullback (B→C), continuation (C→D).',
      },
      {
        name: 'Halt Resume Long',
        description:
          'Long entry into halt resumption with clear catalyst and over-halt high break.',
      },
      {
        name: 'Parabolic Short',
        description:
          'Short into parabolic exhaustion — vertical move, multi-day extension, ideally late in the day.',
      },
    ]
    const insert = conn.prepare(
      'INSERT INTO playbooks (name, description) VALUES (?, ?)',
    )
    const tx = conn.transaction(() => {
      for (const p of defaults) insert.run(p.name, p.description)
    })
    tx()
    console.info(`[FE db] seeded ${defaults.length} default playbooks (first run)`)
  } else {
    console.info(
      `[FE db] defaults_seeded latch was missing/false but ${existing.n} playbooks exist — marking latch`,
    )
  }

  conn
    .prepare(`
      INSERT INTO settings (key, value) VALUES ('defaults_seeded', 'true')
      ON CONFLICT(key) DO UPDATE SET value = 'true'
    `)
    .run()
}

// First-run-only suggestion of tier values for the default playbooks. We
// only touch rows that still carry the column default 'B' AND whose name
// matches a known starter setup — any user-grade override (or rename)
// keeps its value. Latched by the `playbook_tiers_seeded` settings flag so
// re-running this is a no-op even if a user later resets a row to 'B'.
//
// Matching is name-substring based to tolerate small wording variants the
// user may have introduced ("1-min Pullback" vs "1m Pullback", etc.). The
// suggested mapping comes from the v0.1.5 spec; users can change any of
// these in the Setup Library editor.
function seedDefaultPlaybookTiersOnce(conn: Database.Database): void {
  const flag = conn
    .prepare("SELECT value FROM settings WHERE key = 'playbook_tiers_seeded'")
    .get() as { value: string } | undefined
  if (flag?.value === 'true') return

  interface Row { id: number; name: string; tier: string }
  const rows = conn
    .prepare("SELECT id, name, tier FROM playbooks")
    .all() as Row[]

  const update = conn.prepare('UPDATE playbooks SET tier = ? WHERE id = ?')

  let updates = 0
  const tx = conn.transaction(() => {
    for (const r of rows) {
      if (r.tier !== 'B') continue // user-graded; leave alone
      const next = suggestTierForPlaybookName(r.name)
      if (next && next !== 'B') {
        update.run(next, r.id)
        updates += 1
      }
    }
  })
  tx()
  if (updates > 0) console.info(`[FE db] seeded tier suggestions for ${updates} playbook(s)`)

  conn
    .prepare(`
      INSERT INTO settings (key, value) VALUES ('playbook_tiers_seeded', 'true')
      ON CONFLICT(key) DO UPDATE SET value = 'true'
    `)
    .run()
}
