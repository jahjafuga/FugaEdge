import { openDatabase } from '../db/database'
import type { DaySummaryFeeRow, RoundTrip } from '@shared/import-types'
import { recomputeFeesForDateSymbol } from './apply-fees'
import { recomputeSummaryForDates } from '../trades/recompute-summary'
import { ensureDefaultAccountId, getDefaultAccountId } from '../accounts/repo'

export function annotateTripStatus(trips: RoundTrip[], accountId?: string): RoundTrip[] {
  const db = openDatabase()
  // v0.2.1 dual-hash dedup. A trip is duplicate if EITHER hash matches an
  // existing row. exec_hash catches identical-ID re-imports (v0.1.6 contract);
  // content_hash catches cross-format overlap where the same logical fill
  // carries different per-fill IDs (scenarios b1/b2/b3 from the 2026-05-26
  // dedup investigation). Both hashes are composite-unique per account
  // (Beat 2 rebuild), so the OR clause stays sargable on either.
  //
  // Multi-account Beat 2: the gate is ACCOUNT-SCOPED — a duplicate is a
  // same-account hash match; another account's identical row is NOT a
  // duplicate (scoping, not re-hashing). accountId absent resolves the
  // default (today's single-account behavior); a null default (virgin DB —
  // no accounts means no trades) marks everything new without querying.
  //
  // v0.2.3: only LIVE rows count as duplicates. A soft-deleted trade no longer
  // blocks its own re-import — preview shows it as 'new', the INSERT OR IGNORE
  // in commit() then no-ops on the still-present unique slot, and the else
  // branch resurrects it (clears deleted_at). The OR must be parenthesized:
  // AND binds tighter than OR, so without parens the filter would only apply
  // to the content_hash arm.
  const scope = accountId ?? getDefaultAccountId()
  if (scope == null) {
    return trips.map((t) => ({ ...t, status: 'new' as const }))
  }
  const stmt = db.prepare(
    'SELECT 1 FROM trades WHERE (exec_hash = ? OR content_hash = ?) AND account_id = ? AND deleted_at IS NULL LIMIT 1',
  )
  return trips.map((t) => {
    const hit = stmt.get(t.exec_hash, t.content_hash, scope)
    return { ...t, status: hit ? ('duplicate' as const) : ('new' as const) }
  })
}

// TradeZero File 2 Phase 2 — incoming summary YIELDS to executions. A summary
// trip's synthetic-fill hashes can never match a real execution's, so the hash
// dedup above can't catch summary/execution overlap. This marks an incoming
// summary trip 'duplicate' (commit then skips it via the status==='duplicate'
// guard) when a non-summary "authoritative" trip covers its exact (symbol,date)
// — from EITHER the DB (executions saved earlier — Scenario 2) OR the same
// incoming batch (Scenario 1). PURE status logic, NO deletion. The destructive
// other half (an execution superseding a pre-existing DB summary) lives in
// commit(). Returns the annotated trips + the count of summaries marked.
export function markSummariesSuperseded(
  trips: RoundTrip[],
  accountId?: string,
): {
  trips: RoundTrip[]
  superseded: number
} {
  const db = openDatabase()
  // (symbol,date) keys with authoritative coverage already LIVE in the DB —
  // Beat 2: scoped to THIS account only (another account's executions must
  // never swallow this account's incoming summary). Same-batch coverage below
  // stays account-independent: one import = one account. A null scope (virgin
  // DB) skips the DB set entirely.
  const scope = accountId ?? getDefaultAccountId()
  const covered = new Set(
    scope == null
      ? []
      : (
          db
            .prepare(
              "SELECT DISTINCT symbol, date FROM trades WHERE source_format != 'summary' AND deleted_at IS NULL AND account_id = ?",
            )
            .all(scope) as { symbol: string; date: string }[]
        ).map((r) => `${r.symbol}|${r.date}`),
  )
  // ...plus authoritative coverage arriving in THIS batch (same-batch overlap).
  for (const t of trips) {
    if ((t.source_format ?? 'execution') !== 'summary') covered.add(`${t.symbol}|${t.date}`)
  }
  let superseded = 0
  const annotated = trips.map((t) => {
    if (
      t.source_format === 'summary' &&
      t.status === 'new' &&
      covered.has(`${t.symbol}|${t.date}`)
    ) {
      superseded++
      return { ...t, status: 'duplicate' as const }
    }
    return t
  })
  return { trips: annotated, superseded }
}

export function annotateFeeStatus(
  fees: DaySummaryFeeRow[],
  accountId?: string,
): DaySummaryFeeRow[] {
  const db = openDatabase()
  // Beat 2: fee-row status is per-account — day_fees is keyed
  // (date, symbol, account_id) and another account's row is not "ours" to
  // replace. A null scope (virgin DB) means nothing can exist yet.
  const scope = accountId ?? getDefaultAccountId()
  if (scope == null) {
    return fees.map((f) => ({ ...f, status: 'new' as const, matchedTrips: 0 }))
  }
  const existsStmt = db.prepare(
    'SELECT 1 FROM day_fees WHERE date = ? AND symbol = ? AND account_id = ? LIMIT 1',
  )
  const tripCountStmt = db.prepare(
    'SELECT COUNT(*) AS n FROM trades WHERE date = ? AND symbol = ? AND account_id = ?',
  )
  return fees.map((f) => {
    const exists = existsStmt.get(f.date, f.symbol, scope)
    const tripCount = (tripCountStmt.get(f.date, f.symbol, scope) as { n: number }).n
    return {
      ...f,
      status: exists ? ('replace' as const) : ('new' as const),
      matchedTrips: tripCount,
    }
  })
}

// v0.2.3: the daily_summary upsert moved to trades/recompute-summary.ts so the
// trade-lifecycle ops (soft-delete/restore/hard-delete) share it. The extracted
// helper also filters deleted_at IS NULL and removes a summary row when a date
// drops to zero live trades — both no-ops for this import path (it only ever
// adds live trades), so commit() behavior is unchanged.

export interface CommitOutcome {
  insertedTrips: number
  skippedTrips: number
  resurrectedTrips: number
  /** TradeZero File 2 Phase 2 (case b) — stale DB summary rows HARD-DELETED
   *  because an authoritative (non-summary) trip arrived for the same
   *  (symbol, date). 0 in the common case. */
  supersededTrips: number
  insertedFees: number
  replacedFees: number
  affectedDates: string[]
  affectedPairs: number
}

// Distinct symbols that still have at least one trade with a NULL
// float_shares — the work list for the standalone float backfill
// (electron/import/backfill-float.ts). A symbol drops out of this list the
// moment all its trades carry a float, so calling it again after a backfill
// run yields exactly the symbols FMP couldn't fill (the "unavailable" set).
export function symbolsNeedingFloatFetch(): string[] {
  const db = openDatabase()
  const rows = db
    .prepare('SELECT DISTINCT symbol FROM trades WHERE float_shares IS NULL ORDER BY symbol ASC')
    .all() as { symbol: string }[]
  return rows.map((r) => r.symbol)
}

// Populate trades.float_shares from market_data.float wherever the trade
// row's float_shares is NULL and market_data has a value for the symbol.
// Optional `symbols` filter narrows the scope to a recently-imported set;
// omit to backfill across the whole table.
//
// Idempotent and non-destructive — user-edited float values (where the
// column is already set) are never overwritten. Run this after any change
// to market_data (e.g. a successful refreshMarketData()).
export function backfillFloatShares(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.float_shares IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.float_shares IS NULL'
  const sql = `
    UPDATE trades
    SET float_shares = (
      SELECT CAST(m.float AS INTEGER) FROM market_data m
      WHERE m.symbol = trades.symbol AND m.float IS NOT NULL
      LIMIT 1
    )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where} AND m.float IS NOT NULL
    )
  `
  const info = symbols ? db.prepare(sql).run(...symbols) : db.prepare(sql).run()
  return info.changes
}

// v0.2.2 Commit A — mirror of backfillFloatShares, for the new
// trades.shares_outstanding column. Populates from
// market_data.shares_outstanding wherever the trade's shares_outstanding is
// NULL. Commit A only ships this primitive; the call site lands in Commit
// B alongside the FMP enrichment wrapper that writes both columns. Listed
// here now so the repo surface for Commit B is complete and reviewable in
// one place (mirrors how the country / float orchestrators were paired).
//
// Idempotent and non-destructive — user-edited shares_outstanding values
// are never overwritten. Run after any change to market_data.
export function backfillSharesOutstanding(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.shares_outstanding IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.shares_outstanding IS NULL'
  const sql = `
    UPDATE trades
    SET shares_outstanding = (
      SELECT CAST(m.shares_outstanding AS INTEGER) FROM market_data m
      WHERE m.symbol = trades.symbol AND m.shares_outstanding IS NOT NULL
      LIMIT 1
    )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where} AND m.shares_outstanding IS NOT NULL
    )
  `
  const info = symbols ? db.prepare(sql).run(...symbols) : db.prepare(sql).run()
  return info.changes
}

// Populate trades.country/_name/region from market_data.* wherever the
// trade row's country_source is NULL (so manual overrides and previously-
// resolved Polygon hits both stay put). Idempotent.
export function backfillTradeCountriesFromMarket(symbols?: string[]): number {
  const db = openDatabase()
  if (symbols && symbols.length === 0) return 0
  const where = symbols
    ? `WHERE t.country_source IS NULL AND t.symbol IN (${symbols.map(() => '?').join(',')})`
    : 'WHERE t.country_source IS NULL'
  const sql = `
    UPDATE trades
    SET
      country        = (SELECT m.country        FROM market_data m WHERE m.symbol = trades.symbol),
      country_name   = (SELECT m.country_name   FROM market_data m WHERE m.symbol = trades.symbol),
      region         = (SELECT m.region         FROM market_data m WHERE m.symbol = trades.symbol),
      country_source = (
        -- market_data carries no source, so a cache-copied country is
        -- unverified (could be a US-from-listing guess) — label it 'inferred',
        -- not the confident 'polygon'. Honest + re-resolvable.
        SELECT CASE WHEN m.country IS NOT NULL THEN 'inferred' ELSE 'unknown' END
        FROM market_data m WHERE m.symbol = trades.symbol
      )
    WHERE id IN (
      SELECT t.id FROM trades t
      JOIN market_data m ON m.symbol = t.symbol
      ${where}
    )
  `
  const info = symbols ? db.prepare(sql).run(...symbols) : db.prepare(sql).run()
  return info.changes
}

export function commit(
  trips: RoundTrip[],
  fees: DaySummaryFeeRow[],
  source: string,
  accountId?: string,
): CommitOutcome {
  const db = openDatabase()

  // Multi-account Beat 1 (LOCKED law) — every inserted trip carries an
  // account. Beat 2's import picker passes accountId explicitly; until then
  // the default account is resolved ONCE per commit (?? short-circuits, so an
  // explicit id never consults the registry). ensureDefaultAccountId
  // provisions 'Main account' on an empty registry, so a fresh install's very
  // first import can never stamp NULL. Resolved BEFORE the transaction below:
  // a provisioned account commits in its own repo transaction first, so the
  // trades FK sees an existing accounts row.
  const resolvedAccountId = accountId ?? ensureDefaultAccountId()

  // v0.2.3 known divergence: this hard-deletes ANY open trip for the affected
  // (symbol, date) — including a SOFT-DELETED open trip — and the matching
  // incoming trip is then re-inserted fresh below. Open trips are transient
  // working state (an unclosed position), so a trashed open row is not
  // preserved/resurrected the way a trashed CLOSED trip is; it is purged and
  // replaced. Intentional — do not add a deleted_at guard here.
  // Beat 2: account-scoped — Account A's open working state survives
  // Account B's import of the same (symbol, date).
  const purgeOpen = db.prepare(
    'DELETE FROM trades WHERE symbol = ? AND date = ? AND is_open = 1 AND account_id = ?',
  )

  // TradeZero File 2 Phase 2 (case b) — an authoritative (non-summary) trip
  // supersedes any stale DB summary for its exact (symbol, date): that summary
  // was a stand-in for the real fills, now replaced, so it is HARD-DELETED
  // (mirrors purgeOpen above). The predicate is deliberately NARROW —
  // source_format='summary' AND matching (symbol,date) AND deleted_at IS NULL —
  // so it can NEVER touch an execution, a hand-entered trip, or a summary for a
  // (symbol,date) with no execution coverage. Runs in the same transaction as
  // the inserts below, so executions-insert + stale-summary-purge are atomic.
  // Beat 2: account-scoped — only THIS account's stale summary stand-ins are
  // replaced by its own authoritative fills.
  const supersedeSummary = db.prepare(
    "DELETE FROM trades WHERE symbol = ? AND date = ? AND source_format = 'summary' AND deleted_at IS NULL AND account_id = ?",
  )

  // v0.2.1 uses INSERT OR IGNORE rather than multi-target ON CONFLICT — the
  // bundled SQLite (3.49.2 via better-sqlite3 11.10) rejects ON CONFLICT
  // when one of the targets is a partial unique index (see
  // scripts/verify-multi-conflict.cjs for the empirical probe + the exact
  // error: "2nd ON CONFLICT clause does not match any PRIMARY KEY or
  // UNIQUE constraint"). INSERT OR IGNORE is the documented fallback — it
  // catches conflicts on ANY uniqueness constraint without requiring a
  // named target, which is exactly what the dual-hash design needs.
  const insertTrip = db.prepare(`
    INSERT OR IGNORE INTO trades (
      date, symbol, side,
      open_time, close_time, is_open,
      shares_bought, avg_buy_price, shares_sold, avg_sell_price,
      pnl, gross_pnl,
      fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees,
      net_pnl,
      executions_json, exec_hash, content_hash,
      source_broker, source_format, source_file, account_name, fees_reported, commission,
      account_id
    ) VALUES (
      @date, @symbol, @side,
      @open_time, @close_time, @is_open,
      @shares_bought, @avg_buy_price, @shares_sold, @avg_sell_price,
      @pnl, @gross_pnl,
      0, 0, 0, 0, 0, @total_fees,
      @net_pnl,
      @executions_json, @exec_hash, @content_hash,
      @source_broker, @source_format, @source_file, @account_name, @fees_reported, @commission,
      @account_id
    )
  `)

  // Dual-write companion to trades.executions_json (decision G). For each
  // round trip that gets inserted, one row per constituent fill goes into
  // the executions table. Readers stay on the JSON column for v0.2.0 Day 1;
  // the table becomes load-bearing in a later v0.2.0 step.
  //
  // source_broker / source_format / source_file are taken from the round
  // trip (which buildRoundTrips populated from the first constituent
  // execution). Per-execution fee fields, liquidity_type, account_name,
  // and is_paper stay NULL on Day 1 — the narrow RoundTripExecution shape
  // doesn't carry them through. A later v0.2.0 day will widen the data
  // flow when Webull/IBKR parsers start surfacing those fields.
  const insertExecution = db.prepare(`
    INSERT INTO executions (
      round_trip_id, trade_id, order_id, symbol, side, quantity, price,
      timestamp_utc, source_broker, source_format, source_file
    ) VALUES (
      @round_trip_id, @trade_id, @order_id, @symbol, @side, @quantity, @price,
      @timestamp_utc, @source_broker, @source_format, @source_file
    )
  `)

  // Beat 2: fee rows are keyed (date, symbol, account_id) — this import's
  // rows land under its account and can only replace that account's rows.
  const upsertFees = db.prepare(`
    INSERT INTO day_fees (date, symbol, fee_ecn, fee_sec, fee_finra, fee_htb, fee_cat, total_fees, source, account_id)
    VALUES (@date, @symbol, @fee_ecn, @fee_sec, @fee_finra, @fee_htb, @fee_cat, @total_fees, @source, @account_id)
    ON CONFLICT(date, symbol, account_id) DO UPDATE SET
      fee_ecn    = excluded.fee_ecn,
      fee_sec    = excluded.fee_sec,
      fee_finra  = excluded.fee_finra,
      fee_htb    = excluded.fee_htb,
      fee_cat    = excluded.fee_cat,
      total_fees = excluded.total_fees,
      source     = excluded.source
  `)

  // v0.2.3 resurrect: when INSERT OR IGNORE no-ops because the incoming trip's
  // hash already occupies a slot held by a SOFT-DELETED row, clear its
  // deleted_at to bring it back. The OR is parenthesized (AND binds tighter)
  // and the `deleted_at IS NOT NULL` guard is load-bearing: SQLite reports
  // changes > 0 for an UPDATE whose WHERE matches even when it sets NULL→NULL,
  // so without the guard a LIVE duplicate would falsely count as a resurrect.
  // The guard makes info.changes the exact signal: > 0 ⇒ a trashed row was
  // revived, 0 ⇒ an ordinary live duplicate.
  // Beat 2: account-scoped — revive only THIS account's soft-deleted twin;
  // another account's trash is invisible here (its identical hashes are a
  // legitimate separate row under the composite uniques).
  const resurrectTrip = db.prepare(
    'UPDATE trades SET deleted_at = NULL WHERE (exec_hash = @exec_hash OR content_hash = @content_hash) AND account_id = @account_id AND deleted_at IS NOT NULL',
  )

  let insertedTrips = 0
  let skippedTrips = 0
  let resurrectedTrips = 0
  let supersededTrips = 0
  let insertedFees = 0
  let replacedFees = 0
  const dates = new Set<string>()
  const pairs = new Set<string>()

  const tx = db.transaction(() => {
    // Wipe stale open trips for affected (symbol, date) before inserting.
    const purgeKeys = new Set<string>()
    for (const t of trips) purgeKeys.add(`${t.symbol}|${t.date}`)
    for (const key of purgeKeys) {
      const [symbol, date] = key.split('|')
      purgeOpen.run(symbol, date, resolvedAccountId)
    }

    // case b — purge any stale DB summary superseded by an incoming AUTHORITATIVE
    // (non-summary) trip for the same (symbol, date). A summary trip never
    // triggers this (it only yields, never supersedes). Idempotent: the DELETE
    // matches nothing when no stale summary exists.
    const authKeys = new Set<string>()
    for (const t of trips) {
      if (t.status !== 'duplicate' && (t.source_format ?? 'execution') !== 'summary') {
        authKeys.add(`${t.symbol}|${t.date}`)
      }
    }
    for (const key of authKeys) {
      const [symbol, date] = key.split('|')
      supersededTrips += supersedeSummary.run(symbol, date, resolvedAccountId).changes
    }

    for (const t of trips) {
      if (t.status === 'duplicate') {
        skippedTrips++
        continue
      }
      // Safe fallbacks so commit() stays compatible with any caller that
      // constructs RoundTrips outside the universal buildRoundTrips path
      // (e.g. test fixtures, future migration importers).
      const sourceBroker = t.source_broker ?? 'DAS'
      const sourceFormat = t.source_format ?? 'execution'
      const sourceFile = t.source_file ?? null
      const accountName = t.account_name ?? null

      const info = insertTrip.run({
        date: t.date,
        symbol: t.symbol,
        side: t.side,
        open_time: t.open_time,
        close_time: t.close_time,
        is_open: t.is_open ? 1 : 0,
        shares_bought: t.shares_bought,
        avg_buy_price: t.avg_buy_price,
        shares_sold: t.shares_sold,
        avg_sell_price: t.avg_sell_price,
        pnl: t.net_pnl,
        gross_pnl: t.gross_pnl,
        net_pnl: t.net_pnl,
        // Persist the trip's own fee total. For fees_reported trips (Ocean One)
        // this is the parser's authoritative 11-fee sum; recomputeFeesForDateSymbol
        // then SKIPS these trips (apply-fees.ts WHERE fees_reported = 0) so the
        // value survives. For DAS/Webull (fees_reported = 0) this is 0 and the
        // day_fees pro-rata recompute fills fee_*/total_fees exactly as before.
        // The fee_ecn..fee_cat split stays 0 for OO — the RoundTrip carries no
        // breakdown (confirmed harmless: no reader derives totals from the split).
        total_fees: t.total_fees,
        executions_json: JSON.stringify(t.executions),
        exec_hash: t.exec_hash,
        content_hash: t.content_hash,
        source_broker: sourceBroker,
        source_format: sourceFormat,
        source_file: sourceFile,
        account_name: accountName,
        fees_reported: t.fees_reported ? 1 : 0,
        // Ocean One's separate Comm, broken out for display. A SLICE of
        // total_fees (already folded in), so net_pnl is untouched. NULL for
        // DAS/Webull (no separately-reported commission) — an honest absence,
        // not a fabricated 0.
        commission: t.commission ?? null,
        // Beat 1 — the ASSIGNED trading account (explicit from Beat 2's
        // picker, else the default). account_name above stays the raw import
        // evidence; this is the assignment.
        account_id: resolvedAccountId,
      })
      if (info.changes > 0) {
        insertedTrips++
        const tripId = info.lastInsertRowid as number
        for (const fill of t.executions) {
          insertExecution.run({
            round_trip_id: tripId,
            trade_id: fill.trade_id,
            order_id: fill.order_id,
            symbol: t.symbol,
            side: fill.side,
            quantity: fill.qty,
            price: fill.price,
            timestamp_utc: fill.time,
            source_broker: sourceBroker,
            source_format: sourceFormat,
            source_file: sourceFile,
          })
        }
        dates.add(t.date)
        pairs.add(`${t.date}|${t.symbol}`)
      } else {
        // INSERT OR IGNORE no-op: a row with this exec_hash/content_hash
        // already exists. If that row is soft-deleted, resurrect it (clears
        // deleted_at) and fold its date/pair into the affected sets so the
        // existing recompute loops below pick it up — NO new recompute call.
        // Executions are untouched by soft-delete, so none are re-inserted.
        const revived = resurrectTrip.run({
          exec_hash: t.exec_hash,
          content_hash: t.content_hash,
          account_id: resolvedAccountId,
        })
        if (revived.changes > 0) {
          resurrectedTrips++
          dates.add(t.date)
          pairs.add(`${t.date}|${t.symbol}`)
        } else {
          skippedTrips++
        }
      }
    }

    for (const f of fees) {
      const wasReplace = f.status === 'replace'
      upsertFees.run({
        date: f.date,
        symbol: f.symbol,
        fee_ecn: f.fee_ecn,
        fee_sec: f.fee_sec,
        fee_finra: f.fee_finra,
        fee_htb: f.fee_htb,
        fee_cat: f.fee_cat,
        total_fees: f.total_fees,
        source,
        account_id: resolvedAccountId,
      })
      if (wasReplace) replacedFees++
      else insertedFees++
      dates.add(f.date)
      pairs.add(`${f.date}|${f.symbol}`)
    }

    // Recompute fee allocation across every affected (date, symbol).
    // Also covers trades that had fees applied previously but now have a new
    // round trip joining the pool — pro-rata gets redistributed.
    for (const p of pairs) {
      const [date, symbol] = p.split('|')
      recomputeFeesForDateSymbol(date, symbol, resolvedAccountId)
    }

    recomputeSummaryForDates(dates)

    // Auto-enrich newly-inserted trades' float_shares from cached
    // market_data. For symbols not yet in market_data, the second pass runs
    // after refreshMarketData() completes (see import/ipc.ts).
    const symbolsInserted = new Set<string>()
    for (const p of pairs) symbolsInserted.add(p.split('|')[1])
    if (symbolsInserted.size > 0) {
      backfillFloatShares(Array.from(symbolsInserted))
      backfillTradeCountriesFromMarket(Array.from(symbolsInserted))
    }
  })

  tx()

  return {
    insertedTrips,
    skippedTrips,
    resurrectedTrips,
    supersededTrips,
    insertedFees,
    replacedFees,
    affectedDates: Array.from(dates).sort(),
    affectedPairs: pairs.size,
  }
}
