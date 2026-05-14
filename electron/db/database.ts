import { app } from 'electron'
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { SCHEMA_SQL } from './schema'

let db: Database.Database | null = null

export function getDbPath(): string {
  return join(app.getPath('userData'), 'fugaedge.db')
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
  migrateBeforeSchema(db)
  db.exec(SCHEMA_SQL)
  migrateAfterSchema(db)
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
function migrateAfterSchema(conn: Database.Database): void {
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

  const marketCols = conn.prepare('PRAGMA table_info(market_data)').all() as {
    name: string
  }[]
  const hasMarket = (n: string) => marketCols.some((c) => c.name === n)
  if (!hasMarket('country'))      conn.exec('ALTER TABLE market_data ADD COLUMN country TEXT')
  if (!hasMarket('country_name')) conn.exec('ALTER TABLE market_data ADD COLUMN country_name TEXT')
  if (!hasMarket('region'))       conn.exec('ALTER TABLE market_data ADD COLUMN region TEXT')

  const journalCols = conn.prepare('PRAGMA table_info(journal)').all() as {
    name: string
  }[]
  if (!journalCols.some((c) => c.name === 'day_tags')) {
    conn.exec("ALTER TABLE journal ADD COLUMN day_tags TEXT NOT NULL DEFAULT '[]'")
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

  // polygon_api_key is intentionally NOT seeded with a value here — the
  // user pastes their own in Settings → Market Data on first launch.
  // Source must never carry a real key; rotate immediately if a previous
  // commit ever leaked one.

  seedDefaultPlaybooksOnce(conn)
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
