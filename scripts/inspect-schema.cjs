// One-shot read-only schema inspector. Use to verify migration state after
// a .bak restore or a fresh install. Safe to run with the app open — WAL
// readers see in-flight writes, so this returns the same answer whether the
// migration has checkpointed yet or not.
//
// Run: node scripts\inspect-schema.cjs

const path = require('node:path')
const fs = require('node:fs')
const Database = require('better-sqlite3')

const candidates = [
  path.join(process.env.APPDATA || '', 'fugaedge', 'fugaedge.db'),
  path.join(process.env.APPDATA || '', 'FugaEdge', 'fugaedge.db'),
  path.join(process.env.APPDATA || '', 'fugajournal', 'fugajournal.db'),
]
const dbPath = candidates.find((p) => fs.existsSync(p))
if (!dbPath) {
  console.error('No DB found at any expected path')
  process.exit(1)
}
console.log(`DB: ${dbPath}`)
const stat = fs.statSync(dbPath)
console.log(`size: ${stat.size} bytes`)
for (const suffix of ['-wal', '-shm']) {
  const sidecar = dbPath + suffix
  if (fs.existsSync(sidecar)) {
    console.log(`${suffix.slice(1)}:  ${fs.statSync(sidecar).size} bytes`)
  } else {
    console.log(`${suffix.slice(1)}:  (absent)`)
  }
}

const db = new Database(dbPath, { readonly: true })

console.log('\n── _meta ────────────────────────────────')
const meta = db.prepare("SELECT value FROM _meta WHERE key='schema_version'").get()
console.log(`schema_version: ${meta ? meta.value : '(none)'}   (target = 18)`)

console.log('\n── v0.2.0 backup latch ──────────────────')
try {
  const latch = db.prepare("SELECT value FROM settings WHERE key='v020_backup_done'").get()
  console.log(`v020_backup_done: ${latch ? latch.value : '(unset)'}`)
} catch (e) {
  console.log(`(settings table missing: ${e.message})`)
}

console.log('\n── tables ───────────────────────────────')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
for (const r of tables) console.log(` - ${r.name}`)

console.log('\n── v0.2.0 artifacts ─────────────────────')
const v020Tables = ['executions', 'day_fees']
for (const t of v020Tables) {
  const hit = tables.some((r) => r.name === t)
  console.log(`table ${t}: ${hit ? 'present' : 'MISSING'}`)
}

const v020TradeCols = ['executions_json', 'exec_hash']
const tradeCols = db.prepare('PRAGMA table_info(trades)').all().map((r) => r.name)
for (const c of v020TradeCols) {
  console.log(`trades.${c}: ${tradeCols.includes(c) ? 'present' : 'MISSING'}`)
}

console.log('\n── row counts (key tables) ──────────────')
for (const t of ['trades', 'executions', 'day_fees', 'fills']) {
  if (!tables.some((r) => r.name === t)) continue
  const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n
  console.log(`${t}: ${n}`)
}

db.close()
