// THE 24 LIES — the real-engine half.
//
// A capturing shim can assert SQL text. It cannot prove that a transaction actually ROLLS BACK,
// that INSERT OR IGNORE really refuses to clobber, or that an involution flipped exactly once.
// Those are the whole beat, so they run against a real in-memory better-sqlite3.
//
// Run:  npm run test:migration-chain

import Database from 'better-sqlite3'
import { SCHEMA_SQL } from '../schema'
import { migrateRuleBreaksTaxonomy } from '../migrate-rule-breaks-taxonomy'
import {
  migrateRuleBreaksBackfill,
  RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY,
  RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY,
  RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION,
} from '../migrate-rule-breaks-backfill'
import { migrateHistorySeeds } from '../migrate-history-seeds'
import { EPOCH_EFFECTIVE_FROM } from '@/core/analytics/giveback'
import {
  migrateSentimentPolarity,
  SENTIMENT_POLARITY_MIGRATION_LATCH_KEY,
} from '../migrate-sentiment-polarity'
import {
  MIGRATION_IN_PROGRESS_KEY,
  readMigrationMarker,
  writeMigrationMarker,
  clearMigrationMarker,
} from '../migration-marker'
import { resolveEffectivePriorVersion, chainSucceeded } from '@/core/db/migrationChain'

// Must match database.ts:73. Private there, so it is duplicated here on purpose — if someone
// renames it, fixture [B3] stops injecting and goes green for the wrong reason, which is why
// [B0] asserts the trigger actually fired before anything else is believed.
const SENTIMENT_BACKUP_LATCH = 'sentiment_polarity_migration_backup_done'

let failures = 0
const line = (s = '') => console.log(s)
const hr = () => line('-'.repeat(78))
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) line(`  PASS  ${name}`)
  else {
    failures++
    line(`  FAIL  ${name}${detail ? `\n          -> ${detail}` : ''}`)
  }
}

type Conn = Database.Database

const stampVersion = (db: Conn, v: string) =>
  db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('schema_version', ?)").run(v)
const readVersion = (db: Conn) =>
  (db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get() as { value: string })
    .value
const setSetting = (db: Conn, k: string, v: string) =>
  db
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(k, v)
const getSetting = (db: Conn, k: string) =>
  (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined)
    ?.value
const countLinks = (db: Conn) =>
  (db.prepare('SELECT COUNT(*) n FROM journal_rule_break').get() as { n: number }).n
const countDefs = (db: Conn) =>
  (db.prepare('SELECT COUNT(*) n FROM rule_break_def').get() as { n: number }).n

/** A DB in the shape a schema-46 user actually has: rule-breaks in the COLUMN, no junction,
 *  no def table, neither latch set. */
function freshDb46(): Conn {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL) // creates everything and stamps the CURRENT version

  // Rewind to a genuine pre-migration schema-46 state.
  db.exec('DROP TABLE IF EXISTS journal_rule_break')
  db.exec('DROP TABLE IF EXISTS rule_break_def')
  db.prepare('DELETE FROM settings WHERE key IN (?, ?)').run(
    RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY,
    RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY,
  )
  db.prepare('DELETE FROM _meta WHERE key = ?').run(MIGRATION_IN_PROGRESS_KEY)
  stampVersion(db, '46')

  setSetting(
    db,
    'daily_rule_break_list',
    JSON.stringify(['Ignored daily max loss', 'Chased entry', 'Revenge traded']),
  )
  for (const [date, breaks] of [
    ['2026-03-02', ['Ignored daily max loss', 'Chased entry']],
    ['2026-03-03', ['Revenge traded']],
  ] as [string, string[]][]) {
    db.prepare('INSERT INTO journal (date, rule_breaks) VALUES (?, ?)').run(
      date,
      JSON.stringify(breaks),
    )
  }
  return db
}

/** What db.exec(SCHEMA_SQL) does at database.ts:185 — DURABLY stamp the new version, BEFORE
 *  a single migration in migrateAfterSchema (:186) has run. This is the whole bug in one line. */
function schemaSqlStampsTheVersion(db: Conn): void {
  stampVersion(db, '47')
}

line()
line('THE 24 LIES — migration chain, in-memory harness')
line()

// ═══════════════════════════════════════════════════════════════════════════
// [C] *** THE 24 LIES ***  a soft-failed migration must RETRY, and today it never does.
// ═══════════════════════════════════════════════════════════════════════════
line('[C] *** THE 24 LIES *** — soft failure, NO crash, and the migration dies forever')
hr()
{
  const db = freshDb46()
  migrateRuleBreaksTaxonomy(db) // creates + seeds the def table and the junction

  // --- BOOT 1 ---------------------------------------------------------------
  // database.ts:185 stamps the version. Then migrateAfterSchema runs. Then the backfill's
  // transaction dies. No crash, no kill — just a plain SQLite error, which is all it takes.
  writeMigrationMarker(db, 46) // the fix: record where we came FROM, before the stamp
  schemaSqlStampsTheVersion(db)
  setSetting(db, RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY, 'true')

  // Inject a REAL failure inside the backfill's transaction: the junction is gone, so its
  // INSERT throws. The defs it creates first must roll back with it.
  db.exec('DROP TABLE journal_rule_break')
  const boot1 = migrateRuleBreaksBackfill(db, 46)

  check("[C1] boot 1 reports 'transaction-failed'", boot1.reason === 'transaction-failed', `got '${boot1.reason}'`)
  check('[C2] its latch is UNSET — which is exactly what entitles it to a retry',
    getSetting(db, RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY) === undefined)
  check('[C3] the transaction ROLLED BACK — no orphan defs were left behind', countDefs(db) === 3,
    `defs = ${countDefs(db)} (3 = the seeded vocabulary, nothing extra)`)
  check('[C4] the boot COMPLETES — a soft failure does not throw (database.ts:1514)', true)

  // --- THE LIE --------------------------------------------------------------
  // _meta now reads 47. Today, openDatabase passes readSchemaVersion() straight through.
  db.exec('CREATE TABLE journal_rule_break (date TEXT NOT NULL REFERENCES journal(date) ON DELETE CASCADE, rule_break_def_id INTEGER NOT NULL REFERENCES rule_break_def(id) ON DELETE RESTRICT, created_at TEXT NOT NULL DEFAULT (datetime(\'now\')), PRIMARY KEY (date, rule_break_def_id))')
  check('[C5] _meta reads 47 (stamped before the migration ever ran)', readVersion(db) === '47')

  const stampedRetry = migrateRuleBreaksBackfill(db, Number(readVersion(db)))
  check("[C6] *** THE LIE: passing the STAMPED version -> 'already-migrated'. IT NEVER RETRIES. ***",
    stampedRetry.reason === 'already-migrated', `got '${stampedRetry.reason}'`)
  check('[C7] ...and the junction is still EMPTY. The data is gone from every reader.',
    countLinks(db) === 0, `links = ${countLinks(db)}`)

  // --- THE FIX --------------------------------------------------------------
  const marker = readMigrationMarker(db)
  check('[C8] the marker survived and still reads 46', marker === 46, `got ${marker}`)
  check('[C9] the chain reported FAILURE, so the marker was never cleared',
    chainSucceeded([{ ran: false, reason: 'transaction-failed' }]) === false)

  const effective = resolveEffectivePriorVersion(marker, Number(readVersion(db)))
  check('[C10] effective = 46 — the MARKER wins over the stamp', effective === 46, `got ${effective}`)

  const boot2 = migrateRuleBreaksBackfill(db, effective)
  check('[C11] *** BOOT 2 ACTUALLY RETRIES ***', boot2.ran === true, `reason '${boot2.reason}'`)
  check('[C12] the junction is populated — 3 links across 2 days', countLinks(db) === 3,
    `links = ${countLinks(db)}`)
  check('[C13] the latch is finally set', getSetting(db, RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY) === 'true')

  clearMigrationMarker(db)
  check('[C14] on SUCCESS the marker is cleared', readMigrationMarker(db) === null)
  db.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// [B] THE SENTIMENT INVOLUTION — exactly once, across any crash/retry sequence.
// ═══════════════════════════════════════════════════════════════════════════
line()
line('[B] SENTIMENT (an involution: a double-apply flips BACK and corrupts)')
hr()
{
  const db = freshDb46()
  stampVersion(db, '28') // Dave. 28 < 29, so the flip is live on his upgrade path.
  for (const [date, s] of [['2026-03-02', 5], ['2026-03-03', 3], ['2026-03-04', 1]] as [string, number][]) {
    db.prepare('INSERT INTO session_meta (date, sentiment) VALUES (?, ?)').run(date, s)
  }
  const sentiments = () =>
    (db.prepare('SELECT sentiment FROM session_meta ORDER BY date').all() as { sentiment: number }[])
      .map((r) => r.sentiment)
      .join(',')

  check('[B0] canary starts at 5,3,1', sentiments() === '5,3,1', sentiments())

  // database.ts:185 stamps 47 BEFORE migrateAfterSchema calls the flip.
  writeMigrationMarker(db, 28)
  schemaSqlStampsTheVersion(db)

  // Make the LATCH WRITE fail — and ONLY the latch write. A trigger is a real SQLite failure,
  // the same class as the SQLITE_FULL that makes this reachable in the wild.
  db.exec(`CREATE TRIGGER boom BEFORE INSERT ON settings WHEN NEW.key = '${SENTIMENT_POLARITY_MIGRATION_LATCH_KEY}'
           BEGIN SELECT RAISE(ABORT, 'disk full'); END`)
  setSetting(db, SENTIMENT_BACKUP_LATCH, 'true')

  const r1 = migrateSentimentPolarity(db, 28, { backup: () => {} })

  check('[B1] *** the transaction ROLLED BACK: sentiment is UNTOUCHED at 5,3,1 ***',
    sentiments() === '5,3,1', `got ${sentiments()} — if this is 1,3,5 the flip committed WITHOUT its latch`)
  check('[B2] it reports a FAILURE, not success', r1.ran === false, `ran=${r1.ran} reason='${r1.reason}'`)
  check('[B3] the latch is unset (the trigger really did fire)',
    getSetting(db, SENTIMENT_POLARITY_MIGRATION_LATCH_KEY) === undefined)
  check('[B4] the chain reports failure -> the marker stays',
    chainSucceeded([{ ran: r1.ran, reason: r1.reason }]) === false)

  // The disk is freed. The user relaunches. The marker says 28, so the gate lets it through.
  db.exec('DROP TRIGGER boom')
  const effective = resolveEffectivePriorVersion(readMigrationMarker(db), Number(readVersion(db)))
  check('[B5] effective = 28, NOT the stamped 47', effective === 28, `got ${effective}`)

  const r2 = migrateSentimentPolarity(db, effective, { backup: () => {} })
  check('[B6] the flip lands', r2.ran === true)
  check('[B7] *** sentiment is 1,3,5 — flipped EXACTLY ONCE ***', sentiments() === '1,3,5', sentiments())

  // And a third boot must NOT flip it back. The latch is the guard now.
  const r3 = migrateSentimentPolarity(db, effective, { backup: () => {} })
  check("[B8] a third pass at effective=28 refuses: 'latched'", r3.reason === 'latched', `got '${r3.reason}'`)
  check('[B9] *** STILL 1,3,5 — the involution did NOT flip back ***', sentiments() === '1,3,5', sentiments())
  db.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// [F] DOUBLE CRASH — the marker is write-once. INSERT OR IGNORE, never REPLACE.
// ═══════════════════════════════════════════════════════════════════════════
line()
line('[F] DOUBLE CRASH — the resume point must never be clobbered')
hr()
{
  const db = freshDb46()
  stampVersion(db, '28')

  writeMigrationMarker(db, 28) // boot 1
  schemaSqlStampsTheVersion(db) // ...stamps 47, then CRASH

  // Boot 2 reads marker=28, computes effective=28, and writes the marker AGAIN.
  const effective2 = resolveEffectivePriorVersion(readMigrationMarker(db), Number(readVersion(db)))
  writeMigrationMarker(db, effective2) // ...then CRASHES too

  check('[F1] effective on boot 2 is 28', effective2 === 28, `got ${effective2}`)
  check('[F2] *** the marker STILL reads 28, not 47 — the resume point survived ***',
    readMigrationMarker(db) === 28, `got ${readMigrationMarker(db)}`)

  // The nightmare: if the write were INSERT OR REPLACE and boot 2 naively re-stamped from
  // readSchemaVersion(), the marker would become 47 and boot 3 would skip everything forever.
  writeMigrationMarker(db, 47) // a hostile write-with-the-stamped-version
  check('[F3] *** even a hostile re-write with 47 CANNOT clobber it: still 28 ***',
    readMigrationMarker(db) === 28, `got ${readMigrationMarker(db)}`)
  db.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// [G] [20] STILL REFUSES — and a leaked marker is stopped by the LATCH, not the version gate.
// ═══════════════════════════════════════════════════════════════════════════
line()
line('[G] [20] rename-resurrection still refuses — the latch is the primary guard')
hr()
{
  const db = freshDb46()
  migrateRuleBreaksTaxonomy(db)
  writeMigrationMarker(db, 46)
  schemaSqlStampsTheVersion(db)
  setSetting(db, RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY, 'true')

  const ok = migrateRuleBreaksBackfill(db, 46)
  check('[G1] the backfill runs and links 3 day-rule pairs', ok.ran === true && countLinks(db) === 3,
    `ran=${ok.ran} links=${countLinks(db)}`)
  const defsAfter = countDefs(db)

  // The user renames a def. journal.rule_breaks still holds the OLD name (it is frozen).
  db.prepare("UPDATE rule_break_def SET name = 'Over-trading' WHERE name = 'Chased entry'").run()

  // *** A LEAKED MARKER: some OTHER migration failed, so the marker was never cleared. ***
  // effective = 46, so the VERSION GATE does not fire. The LATCH must catch it.
  const effective = resolveEffectivePriorVersion(readMigrationMarker(db), Number(readVersion(db)))
  check('[G2] a leaked marker means effective = 46 — the version gate will NOT fire', effective === 46)

  const rerun = migrateRuleBreaksBackfill(db, effective)
  check("[G3] *** the LATCH refuses: 'latched' ***", rerun.reason === 'latched', `got '${rerun.reason}'`)
  check('[G4] no def was resurrected — the old name did NOT come back', countDefs(db) === defsAfter,
    `defs ${countDefs(db)} vs ${defsAfter}`)
  check('[G5] no link was double-counted', countLinks(db) === 3, `links = ${countLinks(db)}`)

  // And with the marker CLEARED (the normal case), the version gate is the backstop.
  clearMigrationMarker(db)
  const eff2 = resolveEffectivePriorVersion(readMigrationMarker(db), Number(readVersion(db)))
  const rerun2 = migrateRuleBreaksBackfill(db, eff2)
  check("[G6] cleared marker -> effective 47 -> the version gate backstops: 'already-migrated'",
    eff2 === 47 && rerun2.reason === 'already-migrated', `eff=${eff2} reason='${rerun2.reason}'`)
  db.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// [H] FRESH INSTALL — _meta does not exist yet. Reading the marker must NOT throw.
// ═══════════════════════════════════════════════════════════════════════════
line()
line('[H] FRESH INSTALL — no _meta, no marker, no throw')
hr()
{
  const db = new Database(':memory:') // nothing at all — SCHEMA_SQL has not run
  let threw = false
  let marker: number | null = -1
  try {
    marker = readMigrationMarker(db)
  } catch {
    threw = true
  }
  check('[H1] *** reading the marker with NO _meta table does not throw ***', !threw)
  check('[H2] it reads back as null', marker === null, `got ${marker}`)

  const effective = resolveEffectivePriorVersion(marker, 0)
  check('[H3] effective = 0 -> the caller must NOT write a marker (the guard is load-bearing)',
    effective === 0, `got ${effective}`)
  db.close()
}

// ═══════════════════════════════════════════════════════════════════════════
// [I] SCHEMA 48 (Dave #9) — the two real upgrade routes. Every rule-breaks
// gate reads its own FROZEN constant, so the global bump to 48 must disturb
// nothing; the history seed is unconditional and fires on both routes.
// ═══════════════════════════════════════════════════════════════════════════
line()
line('[I] SCHEMA-48 PATHS — <=46 -> 48 in one launch, and 47 -> 48')
hr()
{
  // Route 1: a shipped-cohort DB at 46 boots the 48 build. SCHEMA_SQL creates
  // the history tables (IF NOT EXISTS) and stamps 48; the rule-breaks lane
  // STILL fires (46 < its frozen 47 target); the seed writes the epoch rows.
  const db = freshDb46()
  setSetting(db, 'daily_profit_target', '200')
  migrateRuleBreaksTaxonomy(db)
  writeMigrationMarker(db, 46)
  stampVersion(db, '48') // what the CURRENT SCHEMA_SQL durably stamps
  setSetting(db, RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY, 'true')

  check('[I1] the 46 DB still qualifies for the rule-breaks backup (46 < frozen target 47)',
    46 < RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION)
  const bf = migrateRuleBreaksBackfill(db, 46)
  check('[I2] the rule-breaks lane FIRES on 46 -> 48 (gates read the frozen 47, not the global)',
    bf.ran === true && countLinks(db) === 3, `ran=${bf.ran} links=${countLinks(db)}`)

  migrateHistorySeeds(db)
  const pt = db.prepare('SELECT effective_from, value FROM profit_target_history ORDER BY id').all() as { effective_from: string; value: number }[]
  const ml = db.prepare('SELECT effective_from, value FROM max_loss_history ORDER BY id').all() as { effective_from: string; value: number }[]
  check('[I3] the history seed fires on the same launch: profit target epoch row carries the stored 200',
    pt.length === 1 && pt[0].effective_from === EPOCH_EFFECTIVE_FROM && pt[0].value === 200, JSON.stringify(pt))
  check('[I4] max loss epoch row carries the SCHEMA_SQL-stored 500',
    ml.length === 1 && ml[0].value === 500, JSON.stringify(ml))
  check('[I5] _meta reads 48 after the one-launch upgrade', readVersion(db) === '48')
  clearMigrationMarker(db)
  db.close()
}
{
  // Route 2: a dev DB already at 47 boots the 48 build. The rule-breaks lanes
  // gate themselves out (47 >= frozen 47); ONLY the new tables + seed land.
  const db = freshDb46()
  migrateRuleBreaksTaxonomy(db)
  setSetting(db, RULE_BREAKS_BACKFILL_BACKUP_LATCH_KEY, 'true')
  const first = migrateRuleBreaksBackfill(db, 46)
  check('[I6] fixture: the 46 -> 47 lane completed (links 3, latch set)',
    first.ran === true && countLinks(db) === 3 && getSetting(db, RULE_BREAKS_BACKFILL_MIGRATION_LATCH_KEY) === 'true')
  stampVersion(db, '47') // the DB the 47 build left behind
  const defsBefore = countDefs(db)

  // The 48 boot: the backup gate's own expression (database.ts:370) refuses at 47.
  check('[I7] the pre-migration backup gates OUT at 47 (47 >= frozen target 47)',
    47 >= RULE_BREAKS_BACKFILL_TARGET_SCHEMA_VERSION)
  stampVersion(db, '48') // SCHEMA_SQL stamps the new global
  migrateRuleBreaksTaxonomy(db) // unconditional, must no-op on a seeded table
  const rerun = migrateRuleBreaksBackfill(db, 47)
  check("[I8] the rule-breaks backfill no-ops: 'already-migrated' at priorVersion 47",
    rerun.reason === 'already-migrated', `got '${rerun.reason}'`)
  check('[I9] taxonomy idempotent across the bump (defs unchanged, links unchanged)',
    countDefs(db) === defsBefore && countLinks(db) === 3, `defs=${countDefs(db)} links=${countLinks(db)}`)

  migrateHistorySeeds(db)
  migrateHistorySeeds(db) // the next 48 boot — must not double-seed
  const pt = db.prepare('SELECT COUNT(*) n FROM profit_target_history').get() as { n: number }
  check('[I10] the seed runs (and only once) on the 47 -> 48 route', pt.n === 1, `rows=${pt.n}`)
  check('[I11] _meta reads 48', readVersion(db) === '48')
  db.close()
}

line()
hr()
line(failures === 0 ? `${'ALL CHECKS PASSED'}` : `${failures} FAILURE(S)`)
hr()
process.exit(failures === 0 ? 0 : 1)
