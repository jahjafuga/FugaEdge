// Single source of truth for the scratch / win / loss boundary.
//
// This lives in shared/ (not src/core) because the boundary is consumed on BOTH
// sides of the IPC line: TypeScript classifiers in src/core + electron, AND SQL
// predicates in the electron DB layer that bind the epsilon as a parameter.
//
// History (v0.2.3): the codebase previously carried FIVE independent
// `SCRATCH_THRESHOLD = 2` constants — a ±$2 "scratch band" — alongside several
// bare-sign (`> 0` / `< 0` / `= 0`) sites that disagreed with them. The same
// trading day rendered different W/L/scratch splits depending on which surface
// you looked at (Daily Detail said strict-zero; Reports said ±$2). This module
// collapses every site onto one definition. See src/core/classify/outcome.ts
// for the classifier + predicates + SQL snippets that read this constant.
//
// Definition (locked): a trade is a SCRATCH when |net_pnl| ≤ SCRATCH_EPSILON.
// The epsilon is a floating-point tolerance, NOT a P&L band — net_pnl is a REAL
// column (gross − fees), so exact `= 0` comparisons are unsafe. 0.005 rounds to
// $0.00 at the 2-decimal display, so anything classified scratch also reads as
// $0.00 on screen. The boundary is INCLUSIVE: |net_pnl| == 0.005 → scratch.

/** Half-cent tolerance. `|net_pnl| ≤ SCRATCH_EPSILON` ⇒ scratch (inclusive). */
export const SCRATCH_EPSILON = 0.005

/** Outcome of a single closed trade, classified by net P&L. */
export type TradeOutcome = 'win' | 'loss' | 'scratch'
