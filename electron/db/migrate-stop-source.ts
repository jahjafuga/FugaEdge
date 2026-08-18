// Auto-fill-stop Beat 1 (schema 50 -> 51) — teach trades WHO SET THE STOP.
// One additive, idempotent change:
//   1. NEW `trades.stop_source` column — 'manual' | 'auto' | NULL.
//
// WHY. planned_stop_loss_price is the denominator of every R number in the app, and
// the column records the price without recording where it came from. Once a stop can
// be DERIVED (Beat 2 fills it from the first entry and a percentage), a derived R and
// a planned R become indistinguishable on screen — the user would read a number the
// app invented as a number they committed to before the trade. `stop_source` is that
// missing provenance, and it mirrors country_source's contract exactly:
//   'manual' = the user's own value, NEVER overwritten by an automatic pass
//   'auto'   = derived by the app, safe to re-derive and safe to clear
//   NULL     = no stop, so nothing to attribute (absent is NOT 'auto')
//
// THE STAMPING IS THE DANGEROUS PART. Every stop that exists when this column is added
// was typed by a human — there was no other way to put one there. So the same run that
// adds the column stamps EVERY non-null stop 'manual'. Get this wrong and a later CLEAR
// deletes hand-entered stops that cannot be recovered from anything the app stores. It
// is one UPDATE, and it is the reason this migration exists as its own tested module.
//
// A NULL stop is left with a NULL source rather than being defaulted. There is no
// attribution for a value that is not there, and defaulting it would make the "clear
// only what the app derived" query match rows the app never touched.
//
// IDEMPOTENCY. Self-guards on column presence (the migrateCatalystKind precedent,
// schema 49), so it is registered unconditionally and covers fresh installs too. The
// one-time stamp fires ONLY in the run that adds the column — a later re-run must never
// drag an 'auto' row back to 'manual'.
//
// Type-only Database import so it is testable against a real engine in
// electron/db/__tests__/stop-source.inmemory.ts (`npm run test:stop-source`);
// better-sqlite3's Electron ABI will not load under vitest.

import type Database from 'better-sqlite3'

/** The closed set. Mirrored by the CHECK constraint below and by TradeListRow's
 *  stop_source in shared/trades-types.ts. NULL is legal and means "no stop". */
export const STOP_SOURCES = ['manual', 'auto'] as const

export function migrateStopSource(conn: Database.Database): void {
  const cols = conn.prepare('PRAGMA table_info(trades)').all() as { name: string }[]
  if (cols.length === 0) return // table not created yet — nothing to widen
  if (cols.some((c) => c.name === 'stop_source')) return // already migrated — no-op boot

  // Additive, NULLABLE column: a trade with no stop has no provenance to record.
  // The CHECK pins the closed set at the storage layer, so a bad write fails loudly
  // instead of silently inventing a third kind of stop.
  conn.exec(`
    ALTER TABLE trades
      ADD COLUMN stop_source TEXT
      CHECK (stop_source IS NULL OR stop_source IN ('manual','auto'))
  `)

  // One-time stamp, inside the same branch that added the column. Every stop that
  // already exists was typed by a human — nothing else could have written one.
  const r = conn
    .prepare("UPDATE trades SET stop_source = 'manual' WHERE planned_stop_loss_price IS NOT NULL")
    .run()
  console.info(
    `[FE db] stop-source: stamped ${r.changes} pre-existing stop${
      r.changes === 1 ? '' : 's'
    } as manual (typed by the user; an auto-fill pass must never overwrite or clear them).`,
  )
}
