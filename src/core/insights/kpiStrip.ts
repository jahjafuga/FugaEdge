// v0.2.5 EdgeIQ — the bottom KPI strip's pure selector. Six "best-of" tiles over
// the SAME windowed trades the hero cards + Coach see (the caller passes the
// already-range-filtered set, so the strip is filter-aware for free). DESCRIPTIVE,
// never prescriptive: it surfaces the best symbol / weekday / setup / session, the
// realized payoff ratio, and dollar expectancy — bare values, not the prose cards
// the insight RULES emit.
//
// REUSE, don't fork (the worked/leaked discipline): every P&L figure comes from
// the shared `aggregate` + `groupBy` + `dowName` primitives in ./helpers — this
// module re-implements NONE of the win/loss math.
//
// HONESTY (the no-fake-data law): each field is value-OR-null. A tile with no
// qualifying bucket (below its sample floor, no tagged playbooks, no decided
// trades) is null — the UI shows an empty state, NEVER a fabricated leader.
//
// Pure per ARCHITECTURE rule #1: imports only ./helpers + @shared/trades-types —
// zero electron / fs / sqlite / React.

import type { TradeListRow } from '@shared/trades-types'
import { aggregate, groupBy, dowName } from './helpers'

/** A best-of tile: the winning label + its aggregate over the window. winRate is
 *  null only for an all-scratch bucket (the UI renders "—"). */
export interface BestBucket {
  netPnl: number
  trades: number
  winRate: number | null
}

export interface KpiStripData {
  bestSymbol: (BestBucket & { symbol: string }) | null
  bestWeekday: (BestBucket & { day: string }) | null
  bestSetup: (BestBucket & { playbook: string }) | null
  /** Best single trading DAY by net P&L (app-consistent: a "session" = one day). */
  bestSession: (BestBucket & { date: string }) | null
  /** Realized payoff ratio — avg winner ÷ |avg loser|. NOT a planned R:R (no
   *  target price is stored). avgLoss is the raw (negative) average. */
  payoffRatio: { ratio: number; avgWin: number; avgLoss: number } | null
  /** Dollar expectancy = net ÷ trade count. rMultiple (avg R) only when enough
   *  risked trades carry one — omitted otherwise, never faked. */
  expectancy: { dollars: number; trades: number; rMultiple?: number } | null
}

// Sample floors (anti-fluke) — matched to the insight rules' existing per-bucket
// minimums where they exist, so the strip and the prose cards agree on what's
// "enough":
//   symbol  ≥3  (runSymbolExtremes)
//   weekday ≥5  (runDayOfWeek, per-day)
//   setup   NO floor (1) — matches the per-playbook BREAKDOWN (analytics/week.ts),
//                which ranks every tagged setup with no minimum. A ≥5 floor here
//                made Best Setup disagree with that adjacent breakdown — it dropped
//                a genuine low-count leader and crowned whatever survived. The
//                "No Setup" catch-all is excluded separately (below) so a real
//                low-count setup can lead and the two views agree.
//   session ≥1  (a day is a real session at ANY size — a factual best-day, not a
//                repeatable-pattern claim, so no anti-fluke floor beyond "traded")
//   rMultiple ≥5 risked trades (runExpectancy)
const FLOOR_SYMBOL = 3
const FLOOR_WEEKDAY = 5
const FLOOR_SETUP = 1
const FLOOR_SESSION = 1
const FLOOR_R = 5

// The frozen system "No Setup" playbook (is_system, un-renameable per
// electron/playbook/repo.ts; surfaced as playbook_name = 'No Setup' through the
// trades-list join) is a catch-all — "a trade with no setup" — not a real setup.
// Best Setup excludes it by that frozen name (the same key the setup dimension and
// the per-playbook breakdown both group on), so it can never be crowned "best".
const NO_SETUP_PLAYBOOK = 'No Setup'

/** The max-net bucket meeting `floor`, sign-agnostic (the honest "best" even if
 *  the leader is net-negative; null = no qualifying bucket). Ties resolve to the
 *  first bucket seen (Map insertion order = first appearance in `trades`). */
function bestOf(
  trades: TradeListRow[],
  keyOf: (t: TradeListRow) => string | null | undefined,
  floor: number,
): (BestBucket & { key: string }) | null {
  const buckets = groupBy(trades, keyOf)
  let best: (BestBucket & { key: string }) | null = null
  for (const [key, group] of buckets) {
    if (group.length < floor) continue
    const agg = aggregate(group)
    if (best === null || agg.net_pnl > best.netPnl) {
      best = { key, netPnl: agg.net_pnl, trades: agg.trade_count, winRate: agg.win_rate }
    }
  }
  return best
}

export function computeKpiStrip(trades: TradeListRow[]): KpiStripData {
  const sym = bestOf(trades, (t) => t.symbol, FLOOR_SYMBOL)
  const wk = bestOf(trades, (t) => dowName(t.date), FLOOR_WEEKDAY)
  // Setup: exclude the "No Setup" catch-all and apply no floor (FLOOR_SETUP = 1) so
  // Best Setup matches the per-playbook breakdown's top real setup. Pre-filtering
  // the trades keeps the shared bestOf() body + the symbol/weekday/session calls
  // byte-identical — only this dimension changes.
  const setup = bestOf(
    trades.filter((t) => t.playbook_name !== NO_SETUP_PLAYBOOK),
    (t) => t.playbook_name,
    FLOOR_SETUP,
  )
  const session = bestOf(trades, (t) => t.date, FLOOR_SESSION)

  // Realized payoff ratio — whole-window avg winner ÷ |avg loser|. Null unless
  // there is ≥1 winner AND ≥1 loser with a non-zero average loss (no div-by-0).
  const all = aggregate(trades)
  const payoffRatio =
    all.avg_winner !== null && all.avg_loser !== null && all.avg_loser !== 0
      ? {
          ratio: all.avg_winner / Math.abs(all.avg_loser),
          avgWin: all.avg_winner,
          avgLoss: all.avg_loser,
        }
      : null

  // Dollar expectancy = net ÷ trade count. R-expectancy (avg r_multiple) only
  // when ≥5 trades carry one — else omit, never fake.
  let expectancy: KpiStripData['expectancy'] = null
  if (all.trade_count > 0) {
    const risked = trades.filter((t) => t.r_multiple !== null)
    const rMultiple =
      risked.length >= FLOOR_R
        ? risked.reduce((s, t) => s + (t.r_multiple as number), 0) / risked.length
        : undefined
    expectancy = {
      dollars: all.net_pnl / all.trade_count,
      trades: all.trade_count,
      ...(rMultiple !== undefined ? { rMultiple } : {}),
    }
  }

  return {
    bestSymbol: sym && { symbol: sym.key, netPnl: sym.netPnl, trades: sym.trades, winRate: sym.winRate },
    bestWeekday: wk && { day: wk.key, netPnl: wk.netPnl, trades: wk.trades, winRate: wk.winRate },
    bestSetup: setup && { playbook: setup.key, netPnl: setup.netPnl, trades: setup.trades, winRate: setup.winRate },
    bestSession: session && { date: session.key, netPnl: session.netPnl, trades: session.trades, winRate: session.winRate },
    payoffRatio,
    expectancy,
  }
}
