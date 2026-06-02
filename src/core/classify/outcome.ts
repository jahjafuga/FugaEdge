import { SCRATCH_EPSILON, type TradeOutcome } from '@shared/trade-classification'

// Pure classification helpers — no electron / fs / sqlite imports (ARCHITECTURE
// rule #1), so this stays web-portable: porting to Postgres carries the constant
// and the SQL snippets unchanged; only the parameter-binding mechanism differs.
//
// `classifyOutcome` is the ONE place the boundary is evaluated for the in-memory
// path. The predicates delegate to it, and the SQL snippets are expressed in
// terms of the same SCRATCH_EPSILON, so there is no second definition to drift.

/**
 * Classify a trade's net P&L.
 *
 *   net_pnl  >  SCRATCH_EPSILON  → 'win'
 *   net_pnl  < −SCRATCH_EPSILON  → 'loss'
 *   |net_pnl| ≤ SCRATCH_EPSILON  → 'scratch'   (inclusive boundary)
 *
 * Non-finite P&L (NaN) is treated as 'scratch' — it is not a real win or loss
 * and must never inflate win/loss counts. −0 and +0 both classify scratch.
 */
export function classifyOutcome(netPnl: number): TradeOutcome {
  if (netPnl > SCRATCH_EPSILON) return 'win'
  if (netPnl < -SCRATCH_EPSILON) return 'loss'
  return 'scratch'
}

/** `net_pnl > SCRATCH_EPSILON`. */
export function isWin(netPnl: number): boolean {
  return classifyOutcome(netPnl) === 'win'
}

/** `net_pnl < −SCRATCH_EPSILON`. */
export function isLoss(netPnl: number): boolean {
  return classifyOutcome(netPnl) === 'loss'
}

/** `|net_pnl| ≤ SCRATCH_EPSILON`. */
export function isScratch(netPnl: number): boolean {
  return classifyOutcome(netPnl) === 'scratch'
}

// ── SQL snippets ──────────────────────────────────────────────────────────
// Parameterized fragments for the electron DB layer. Each contains exactly ONE
// `?` placeholder. The win and scratch snippets bind the positive
// SCRATCH_EPSILON; the LOSS snippet binds -SCRATCH_EPSILON at the call site (see
// sqlIsLoss). The snippets mirror classifyOutcome exactly, including the
// inclusive scratch boundary (`ABS(...) <= ?`), so the SQL and in-memory paths
// agree at net_pnl == ±SCRATCH_EPSILON.
//
// Usage:  `WHERE ${sqlIsWin()}`            bind:  SCRATCH_EPSILON
//         `WHERE ${sqlIsLoss()}`           bind: -SCRATCH_EPSILON
//         `CASE WHEN ${sqlIsScratch()} …`  bind:  SCRATCH_EPSILON

/** `<col> > ?` — bind SCRATCH_EPSILON. */
export function sqlIsWin(col = 'net_pnl'): string {
  return `${col} > ?`
}

/**
 * `<col> < ?` — bind -SCRATCH_EPSILON (caller negates explicitly).
 *
 * We do NOT encode the sign in the snippet (`< -?`) because (a) the plain
 * comparison is the standard SQL pattern and parses more cleanly across tooling,
 * (b) audit/grep at each call site shows the bound value (-SCRATCH_EPSILON)
 * directly, and (c) the caller-side negation is paid once per loss query (~4-5
 * sites) — a trivial, explicit cost.
 */
export function sqlIsLoss(col = 'net_pnl'): string {
  return `${col} < ?`
}

/** `ABS(<col>) <= ?` — bind SCRATCH_EPSILON. Inclusive, matches classifyOutcome. */
export function sqlIsScratch(col = 'net_pnl'): string {
  return `ABS(${col}) <= ?`
}
