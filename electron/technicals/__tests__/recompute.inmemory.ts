// BEAT 2 — ENTRY vs 9EMA: bump + resume semantics on a REAL engine.
//
// WHY NOT vitest: better-sqlite3 is built for Electron's ABI, so it throws under
// vitest's node. This runs under Electron's own node against a real in-memory
// engine. The unit under test is the WORKLIST PREDICATE — the recompute's whole
// resumability story is "per-row versioning IS the resume marker", and that is
// an SQL semantic only a real engine can prove.
//
// The worklist SQL and the trade_technicals DDL are VERBATIM copies (cited
// below) — the rule-breaks harness precedent (repo.inmemory.ts:65-67): parity is
// asserted against the real thing, not a paraphrase. The repo functions
// themselves call the openDatabase() singleton, so they can't be pointed at
// :memory: from here; the vitest capture suite (ema9DualWrite.test.ts) covers
// the real functions at the mock seam, and this harness covers the SQL truth.
//
// Bundle + run: npm run test:technicals-recompute

import Database from 'better-sqlite3'
import { TECHNICALS_SCHEMA_VERSION } from '@/core/technicals/computeTradeTechnicals'

// ── tiny runner (the backfill-harness convention) ───────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []
function it(name: string, fn: () => void): void {
  try {
    fn()
    passed++
    console.log('  PASS  ' + name)
  } catch (e) {
    failed++
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(name + '\n        -> ' + msg)
    console.log('  FAIL  ' + name + '\n        -> ' + msg)
  }
}
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}
function eqJson(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${msg}\n           expected: ${b}\n           actual:   ${a}`)
}

// ── schema — trade_technicals VERBATIM from electron/db/schema.ts:340-391 ───
// (trades reduced to the two columns this beat touches: the PK the worklist
// joins on, and the tile column the dual-write heals.)
function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(`
CREATE TABLE trades (
  id INTEGER PRIMARY KEY,
  entry_ema9_distance_pct REAL
);
CREATE TABLE IF NOT EXISTS trade_technicals (
  trade_id              INTEGER PRIMARY KEY,

  -- 1M timeframe snapshot at the bar containing the first entry fill
  tf_1m_macd_line       REAL,
  tf_1m_signal_line     REAL,
  tf_1m_histogram       REAL,
  tf_1m_histogram_prior REAL,
  tf_1m_macd_positive   INTEGER,  -- 0/1 nullable bool
  tf_1m_macd_open       INTEGER,  -- 0/1 nullable bool
  tf_1m_macd_rising     INTEGER,  -- 0/1 nullable bool
  tf_1m_vwap            REAL,
  tf_1m_vwap_dist_pct   REAL,
  tf_1m_ema9            REAL,
  tf_1m_ema9_dist_pct   REAL,
  tf_1m_ema20           REAL,
  tf_1m_ema20_dist_pct  REAL,
  tf_1m_ema9_above_ema20 INTEGER, -- 0/1 nullable bool

  -- 5M timeframe snapshot at the bar containing the first entry fill
  tf_5m_macd_line       REAL,
  tf_5m_signal_line     REAL,
  tf_5m_histogram       REAL,
  tf_5m_histogram_prior REAL,
  tf_5m_macd_positive   INTEGER,
  tf_5m_macd_open       INTEGER,
  tf_5m_macd_rising     INTEGER,
  tf_5m_vwap            REAL,
  tf_5m_vwap_dist_pct   REAL,
  tf_5m_ema9            REAL,
  tf_5m_ema9_dist_pct   REAL,
  tf_5m_ema20           REAL,
  tf_5m_ema20_dist_pct  REAL,
  tf_5m_ema9_above_ema20 INTEGER,

  -- Per-row metadata
  data_complete         INTEGER NOT NULL DEFAULT 0,  -- 0/1 bool
  computed_at           TEXT NOT NULL DEFAULT (datetime('now')),
  schema_version        INTEGER NOT NULL DEFAULT 1,

  FOREIGN KEY (trade_id) REFERENCES trades(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trade_technicals_stale
  ON trade_technicals(schema_version, data_complete);
`)
  return db
}

// ── the unit under test — VERBATIM from electron/technicals/repo.ts:298-304 ──
function worklist(db: Database.Database, currentSchemaVersion: number): number[] {
  return (
    db
      .prepare(`
      SELECT t.id AS trade_id
      FROM trades t
      LEFT JOIN trade_technicals tt ON tt.trade_id = t.id
      WHERE tt.trade_id IS NULL
         OR tt.data_complete = 0
         OR tt.schema_version < ?
    `)
      .all(currentSchemaVersion) as { trade_id: number }[]
  ).map((r) => r.trade_id)
}

// ── fixture machinery (NOT the unit under test) ─────────────────────────────
function seedTrade(db: Database.Database, id: number, tilePct: number | null = null): void {
  db.prepare('INSERT INTO trades (id, entry_ema9_distance_pct) VALUES (?, ?)').run(id, tilePct)
}
function seedTechnicals(
  db: Database.Database,
  tradeId: number,
  opts: { version: number; complete: boolean; computedAt: string },
): void {
  db.prepare(`
    INSERT INTO trade_technicals (trade_id, data_complete, computed_at, schema_version)
    VALUES (?, ?, ?, ?)
  `).run(tradeId, opts.complete ? 1 : 0, opts.computedAt, opts.version)
}
/** Simulate one trade's recompute landing: row stamped current-version. */
function recomputeSim(
  db: Database.Database,
  tradeId: number,
  opts: { complete: boolean; computedAt: string },
): void {
  db.prepare(`
    INSERT INTO trade_technicals (trade_id, data_complete, computed_at, schema_version)
    VALUES (@id, @complete, @at, @v)
    ON CONFLICT(trade_id) DO UPDATE SET
      data_complete = excluded.data_complete,
      computed_at = excluded.computed_at,
      schema_version = excluded.schema_version
  `).run({
    id: tradeId,
    complete: opts.complete ? 1 : 0,
    at: opts.computedAt,
    v: TECHNICALS_SCHEMA_VERSION,
  })
}
const computedAtOf = (db: Database.Database, id: number): string =>
  (db.prepare('SELECT computed_at FROM trade_technicals WHERE trade_id = ?').get(id) as {
    computed_at: string
  }).computed_at

console.log(
  `technicals recompute (Beat 2) — in-memory harness  [constant = ${TECHNICALS_SCHEMA_VERSION}]\n`,
)

// ═══════════════ [1] THE BUMP — existing v2 rows become stale ═══════════════

it('[1] BUMP: v2-complete rows ENTER the worklist under the current constant (the whole book recomputes)', () => {
  const db = freshDb()
  // The pre-bump book: three healthy v2 rows, one already-current row, one
  // current-but-stub row, one snapshot-less trade.
  for (const id of [1, 2, 3, 4, 5, 6]) seedTrade(db, id, id === 1 ? 10.75 : null)
  seedTechnicals(db, 1, { version: 2, complete: true, computedAt: 'T0' })
  seedTechnicals(db, 2, { version: 2, complete: true, computedAt: 'T0' })
  seedTechnicals(db, 3, { version: 2, complete: true, computedAt: 'T0' })
  seedTechnicals(db, 4, { version: 3, complete: true, computedAt: 'T0' })
  seedTechnicals(db, 5, { version: 3, complete: false, computedAt: 'T0' })
  const ids = worklist(db, TECHNICALS_SCHEMA_VERSION).sort((a, b) => a - b)
  // v2 rows 1-3 stale (schema_version < 3), stub 5 stale (data_complete=0),
  // missing 6 stale (no row). Already-v3-complete 4 is NOT re-enumerated.
  eqJson(ids, [1, 2, 3, 5, 6], 'bump marks the existing book stale — v3-complete rows skip')
  db.close()
})

it('[1] the constant itself reads 3 (the bump landed)', () => {
  assert(
    TECHNICALS_SCHEMA_VERSION === 3,
    `TECHNICALS_SCHEMA_VERSION must be 3, got ${TECHNICALS_SCHEMA_VERSION}`,
  )
})

// ═══════════════ [6] RESUME — per-row versioning IS the resume marker ═══════

it('[6] RESUME: a killed sweep resumes — no row recomputed twice, no row skipped', () => {
  const db = freshDb()
  const ALL = Array.from({ length: 100 }, (_, i) => i + 1)
  for (const id of ALL) {
    seedTrade(db, id)
    seedTechnicals(db, id, { version: 2, complete: true, computedAt: 'T0' })
  }

  // Round 1 — full worklist, then the "kill": only 50 rows land before death.
  const round1 = worklist(db, TECHNICALS_SCHEMA_VERSION)
  eqJson(round1.length, 100, 'pre-kill worklist enumerates the whole v2 book')
  const done = round1.slice(0, 50)
  for (const id of done) recomputeSim(db, id, { complete: true, computedAt: 'T1' })

  // Round 2 — the relaunch. Exactly the unfinished 50; zero overlap, zero gaps.
  const round2 = worklist(db, TECHNICALS_SCHEMA_VERSION)
  eqJson(round2.length, 50, 'relaunch resumes with exactly the unfinished half')
  const doneSet = new Set(done)
  assert(round2.every((id) => !doneSet.has(id)), 'no finished row is re-enumerated (no double-compute)')
  const round2Set = new Set(round2)
  assert(
    round1.every((id) => doneSet.has(id) || round2Set.has(id)),
    'no row falls through the crack (no skip)',
  )
  for (const id of round2) recomputeSim(db, id, { complete: true, computedAt: 'T2' })

  // Round 3 — steady state: empty worklist; the first half was never re-touched.
  eqJson(worklist(db, TECHNICALS_SCHEMA_VERSION), [], 'drained worklist stays drained')
  assert(
    done.every((id) => computedAtOf(db, id) === 'T1'),
    'computed_at stable on the pre-kill half — resumed run never re-computed them',
  )
  db.close()
})

it('[6] PLACEHOLDER RETRY: a v3 stub re-enters every round (deliberate retry, not double-compute)', () => {
  const db = freshDb()
  seedTrade(db, 1)
  recomputeSim(db, 1, { complete: false, computedAt: 'T1' }) // warmup missing → stub
  eqJson(worklist(db, TECHNICALS_SCHEMA_VERSION), [1], 'stub stays on the worklist (retried next launch)')
  recomputeSim(db, 1, { complete: true, computedAt: 'T2' }) // warmup landed → real compute
  eqJson(worklist(db, TECHNICALS_SCHEMA_VERSION), [], 'completed stub leaves the worklist')
  db.close()
})

console.log(`\n${passed} passed / ${passed + failed} total`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  FAIL  ' + f)
  process.exit(1)
}
process.exit(0)
