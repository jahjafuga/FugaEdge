import { openDatabase } from '../db/database'
import { recomputeFeesForDateSymbol } from '../import/apply-fees'
import { recomputeSummaryForDates } from './recompute-summary'

// v0.2.3 Phase 2a — the trade-lifecycle layer (soft-delete / restore /
// hard-delete, single + bulk). NO IPC here; that lands in Phase 2b.
//
// Every op follows the same shape inside ONE db.transaction:
//   1. capture the affected (date) + (date|symbol) sets from the rows being
//      mutated — BEFORE the mutation, so hard-delete can read date/symbol and
//      attachment metadata while the rows still exist;
//   2. mutate (UPDATE deleted_at, or DELETE);
//   3. recomputeFeesForDateSymbol() per affected pair, then
//      recomputeSummaryForDates() for the affected dates.
// Steps 2-3 keep daily_summary and per-trade fee allocations consistent: a
// soft-deleted trip drops out of its (date,symbol) fee pool (apply-fees filters
// deleted_at IS NULL), so the survivors re-absorb its share, and a date that
// drops to zero live trades has its daily_summary row removed
// (recompute-summary's empty-date branch).
//
// lifecycle.ts is intentionally fs-FREE and electron-FREE so it stays unit-
// testable under vitest (no app.getPath, no node:fs). hard-delete therefore
// only removes DB rows; it RETURNS the on-disk attachment paths it found so the
// Phase 2b IPC handler can fs.rm them after this function returns.

interface Affected {
  dates: Set<string>
  pairs: Set<string>
}

// Collect affected date + date|symbol sets for a batch of trade ids. No
// deleted_at filter: this must work whether the rows are about to be deleted
// (live → trash), restored (trash → live), or hard-purged.
function collectAffected(
  db: ReturnType<typeof openDatabase>,
  ids: number[],
): Affected {
  const dates = new Set<string>()
  const pairs = new Set<string>()
  if (ids.length === 0) return { dates, pairs }
  const ph = ids.map(() => '?').join(',')
  // Beat 2: pairs carry the account so the fee re-spread stays scoped to the
  // owning account's pool (dates stay account-blind — daily_summary is
  // deliberately out of Beat 2's scope).
  const rows = db
    .prepare(`SELECT date, symbol, account_id FROM trades WHERE id IN (${ph})`)
    .all(...ids) as { date: string; symbol: string; account_id: string }[]
  for (const r of rows) {
    dates.add(r.date)
    pairs.add(`${r.date}|${r.symbol}|${r.account_id}`)
  }
  return { dates, pairs }
}

// Shared step 3 — fees per pair, then daily_summary per date. Called inside the
// caller's open transaction (recompute* use the same cached connection).
function recompute({ dates, pairs }: Affected): void {
  for (const p of pairs) {
    const [date, symbol, accountId] = p.split('|')
    recomputeFeesForDateSymbol(date, symbol, accountId)
  }
  recomputeSummaryForDates(dates)
}

export function softDeleteTrades(ids: number[]): void {
  const db = openDatabase()
  const tx = db.transaction((batch: number[]) => {
    if (batch.length === 0) return
    const affected = collectAffected(db, batch)
    const ph = batch.map(() => '?').join(',')
    // Single statement so the whole batch shares one datetime('now') stamp.
    db.prepare(
      `UPDATE trades SET deleted_at = datetime('now') WHERE id IN (${ph})`,
    ).run(...batch)
    recompute(affected)
  })
  tx(ids)
}

export function softDeleteTrade(id: number): void {
  softDeleteTrades([id])
}

export function restoreTrades(ids: number[]): void {
  const db = openDatabase()
  const tx = db.transaction((batch: number[]) => {
    if (batch.length === 0) return
    const affected = collectAffected(db, batch)
    const ph = batch.map(() => '?').join(',')
    db.prepare(
      `UPDATE trades SET deleted_at = NULL WHERE id IN (${ph})`,
    ).run(...batch)
    recompute(affected)
  })
  tx(ids)
}

export function restoreTrade(id: number): void {
  restoreTrades([id])
}

export interface HardDeleteResult {
  // Paths relative to the attachments root (<tradeId>/<filename>). Phase 2b
  // joins each under getAttachmentsDir() and fs.rm's the file. Empty when the
  // purged trades had no attachments.
  deletedAttachmentPaths: string[]
}

export function hardDeleteTrades(ids: number[]): HardDeleteResult {
  const db = openDatabase()
  const tx = db.transaction((batch: number[]): string[] => {
    if (batch.length === 0) return []
    const affected = collectAffected(db, batch)
    const ph = batch.map(() => '?').join(',')
    // Capture attachment file paths BEFORE the DELETE. trade_attachments has
    // NO FK to trades, so the trades DELETE cannot cascade to it — we must
    // remove those rows explicitly (below) and hand the disk paths to 2b.
    const attRows = db
      .prepare(
        `SELECT trade_id, filename FROM trade_attachments WHERE trade_id IN (${ph})`,
      )
      .all(...batch) as { trade_id: number; filename: string }[]
    const paths = attRows.map((a) => `${a.trade_id}/${a.filename}`)
    // Explicit attachment-row purge first (no cascade reaches it)…
    db.prepare(`DELETE FROM trade_attachments WHERE trade_id IN (${ph})`).run(
      ...batch,
    )
    // …then the trades; executions + trade_notes cascade via ON DELETE CASCADE.
    db.prepare(`DELETE FROM trades WHERE id IN (${ph})`).run(...batch)
    recompute(affected)
    return paths
  })
  return { deletedAttachmentPaths: tx(ids) }
}

export function hardDeleteTrade(id: number): HardDeleteResult {
  return hardDeleteTrades([id])
}
