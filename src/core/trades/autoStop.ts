// v0.2.7 Feature 3 Commit 2 — the auto-stop engine.
//
// PURE per ARCHITECTURE #1: zero electron / fs / sqlite / React imports. The three
// operations produce a PLAN — a list of row updates — and an injected writer applies
// it, so the whole decision path is unit-testable and the module would run unchanged
// inside a Next.js route. Mirrors src/core/market/rvolRepair.ts's injected-deps shape.
//
// WHY THIS EXISTS. R is only as good as the stop it divides by, and most imported
// trades carry no stop at all: nothing in a broker export says where the trader
// intended to be wrong. A fixed percentage off the FIRST entry is a defensible
// stand-in — it is what a momentum trader's initial risk actually looks like — and
// with it every trade gets an R instead of a dash.
//
// THE FIRST ENTRY, NOT THE AVERAGE. A trade that adds on the way up has an average
// well above where it started, and a stop derived from the average would sit above
// the price the trader was originally risking. Six of the twenty-eight trades in the
// live book differ between the two, so this is not a hypothetical distinction.
//
// WHAT IT MUST NEVER DO. A stop the user typed is a decision, not a derivation.
// Every operation here filters on stop_source, and 'manual' is excluded from all
// three. That is the single property the tests spend most of their assertions on:
// a hand-entered stop cannot be reconstructed from anything else the app stores.

import { computeExecutionStats } from './executionStats'

export interface AutoStopTrade {
  id: number
  side: 'long' | 'short'
  planned_stop_loss_price: number | null
  stop_source: 'manual' | 'auto' | null
  executions: readonly { side: 'B' | 'S'; price: number; time: string }[]
  avg_buy_price: number
  avg_sell_price: number
}

/** One row's worth of change. `source` rides along with the price so a write can
 *  never set one without the other — the pairing IS the provenance contract. */
export interface StopUpdate {
  id: number
  stop: number | null
  source: 'auto' | null
}

export interface AutoStopDeps {
  /** Every candidate trade. Filtering is this module's job, not the query's, so
   *  the rules live in one readable place instead of a WHERE clause. */
  listTrades: () => AutoStopTrade[]
  /** Apply the whole plan in ONE transaction; returns rows changed. */
  writeStops: (updates: StopUpdate[]) => number
  /** Pre-operation database snapshot. A rejection ABORTS the operation — see
   *  runAutoStop. */
  backup: () => Promise<unknown>
}

export type AutoStopOp = 'apply' | 'rederive' | 'clear'

export interface AutoStopConfig {
  enabled: boolean
  /** Percent off the first entry, e.g. 3.5 for three and a half percent. */
  pct: number
}

export interface AutoStopResult {
  /** False when a guard stood the operation down before any work happened. */
  ran: boolean
  changed: number
  reason?: 'disabled' | 'invalid-pct' | 'nothing-to-do'
}

/** A usable stop percentage is strictly between 0 and 100.
 *
 *  0 puts the stop AT the entry: risk per share is zero, and every R that divides
 *  by it is infinite. 100 or more prices the stop at or below zero for a long,
 *  which is not a price. Both are silent corruption rather than loud failure, so
 *  they are refused here and again at the settings write. */
export function isValidStopPct(pct: number): boolean {
  return Number.isFinite(pct) && pct > 0 && pct < 100
}

/** The stop a first entry of `first` implies at `pct` percent.
 *
 *  long  → below the entry, short → above it. Returns null when there is no first
 *  entry or the percentage is unusable: an absent input yields an absent answer,
 *  never a fabricated one.
 *
 *  STORED UNROUNDED, per the house convention that rounding happens at display
 *  (4dp under a dollar, 2dp at or above). Rounding here would bake the error into
 *  every R the trade ever reports.
 *
 *  The `(100 ± pct) / 100` form is deliberate over `1 ± pct/100`: at 7.50 and 3.5%
 *  the latter returns 7.762499999999999 for the short side where this returns
 *  7.7625 exactly. Same maths, one fewer floating-point step. */
export function deriveStop(
  first: number | null,
  side: 'long' | 'short',
  pct: number,
): number | null {
  if (first == null || !Number.isFinite(first) || first <= 0) return null
  if (!isValidStopPct(pct)) return null
  return side === 'long' ? (first * (100 - pct)) / 100 : (first * (100 + pct)) / 100
}

/** The first entry-side fill's price, or null when the trade has none. Reuses
 *  computeExecutionStats rather than re-deriving the bookend — that module already
 *  owns the side-aware fill split and the lexical-ISO ordering. */
function firstEntryPrice(t: AutoStopTrade): number | null {
  return computeExecutionStats(t).firstEntry?.price ?? null
}

/** APPLY — fill the empties. A trade with any stop already on it is skipped, so a
 *  re-run is a no-op, and 'manual' is excluded belt-and-braces even though the
 *  null-stop / null-source invariant means it should not arise. */
export function planApply(trades: readonly AutoStopTrade[], pct: number): StopUpdate[] {
  const out: StopUpdate[] = []
  for (const t of trades) {
    if (t.planned_stop_loss_price != null) continue
    if (t.stop_source === 'manual') continue
    const stop = deriveStop(firstEntryPrice(t), t.side, pct)
    if (stop == null) continue // no first entry — never fabricate one
    out.push({ id: t.id, stop, source: 'auto' })
  }
  return out
}

/** RE-DERIVE — the percentage changed, so every value the app derived is stale.
 *  Touches ONLY 'auto' rows: it never fills an empty stop (that is APPLY's job,
 *  and a user may have cleared one deliberately) and never revisits a typed one.
 *  A row whose recomputed value already matches is left out of the plan, which
 *  keeps a repeated save from writing rows for no reason. */
export function planRederive(trades: readonly AutoStopTrade[], pct: number): StopUpdate[] {
  const out: StopUpdate[] = []
  for (const t of trades) {
    if (t.stop_source !== 'auto') continue
    const stop = deriveStop(firstEntryPrice(t), t.side, pct)
    if (stop == null) continue // lost its fills somehow — leave the old value alone
    if (stop === t.planned_stop_loss_price) continue
    out.push({ id: t.id, stop, source: 'auto' })
  }
  return out
}

/** CLEAR — undo everything the app derived, and nothing else. Both columns go
 *  null together: a stop with no price has no provenance to record. */
export function planClear(trades: readonly AutoStopTrade[]): StopUpdate[] {
  const out: StopUpdate[] = []
  for (const t of trades) {
    if (t.stop_source !== 'auto') continue
    out.push({ id: t.id, stop: null, source: null })
  }
  return out
}

/**
 * Run one operation end to end: guard, plan, snapshot, write.
 *
 * ORDER IS THE CONTRACT. The backup is awaited and NOT caught, so a failed
 * snapshot propagates and the write never happens — there is no bulk stop write
 * without a fresh restore point (the backupBeforeImport rule, applied to the only
 * other operation in the app that rewrites many trade rows at once).
 *
 * An empty plan skips the backup as well as the write. Nothing is being changed,
 * so there is nothing to protect, and taking one anyway would push real snapshots
 * out of a capped retention pool every time a user toggled a switch.
 */
export async function runAutoStop(
  op: AutoStopOp,
  config: AutoStopConfig,
  deps: AutoStopDeps,
): Promise<AutoStopResult> {
  // The feature is off: no read, no snapshot, no write. Turning it off means the
  // app stops deriving stops — it does NOT mean the app deletes the ones it made.
  if (!config.enabled) return { ran: false, changed: 0, reason: 'disabled' }

  // CLEAR does not consult the percentage, so a bad one must not block the one
  // operation that undoes damage.
  if (op !== 'clear' && !isValidStopPct(config.pct)) {
    return { ran: false, changed: 0, reason: 'invalid-pct' }
  }

  const trades = deps.listTrades()
  const plan =
    op === 'apply'
      ? planApply(trades, config.pct)
      : op === 'rederive'
        ? planRederive(trades, config.pct)
        : planClear(trades)

  if (plan.length === 0) return { ran: true, changed: 0, reason: 'nothing-to-do' }

  await deps.backup()
  const changed = deps.writeStops(plan)
  return { ran: true, changed }
}
