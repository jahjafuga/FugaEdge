// v0.2.5 EdgeIQ Trader DNA — adherence compute. CONSUMES the 5-pillar data on
// each trade row and reports how well the book matched the user's own scan
// profile. PURE per ARCHITECTURE rule #1: zero electron/fs/sqlite/React imports
// (type-only SettingsValues; runtime helpers from /src/core only), so it runs
// identically in the renderer today and a future web target.
//
// The honesty contract (founder-locked) is the whole point of this module:
//   (a) CATALYST is a coverage SIGNAL, never pass/fail — catalyst_type is a name
//       or null, so there's no "confirmed no-catalyst" value to fail against.
//       Reported as "X% of trades had a catalyst tagged"; EXCLUDED from the
//       fit-all/broke classification.
//   (b) NULL = EXCLUDED per pillar (the no-fake law). A trade missing a pillar's
//       data drops OUT of that pillar's denominator — it is never a silent fail.
//       pct is null (→ "—") when n=0, never 0 and never NaN.
//   (c) Three buckets over the 4 NUMERIC pillars (price/change/rvol/float):
//       fitAll = has all 4 + passes all 4; brokeAny = has all 4 + fails ≥1;
//       incomplete = missing ≥1 pillar's data. Every trade lands in exactly one.
//       "incomplete" is a real bucket — it may be the largest on a thin book.
//   (d) WIN uses the shared aggregate() (scratch excluded), so the DNA P&L
//       cross-cut agrees with the KPI strip + hero cards on the same page.

import type { TradeListRow } from '@shared/trades-types'
import type { SettingsValues } from '@shared/settings-types'
import { aggregate, type TradeAggregate } from '@/core/insights/helpers'

/** The seven scan-profile settings this module reads. Type-only Pick off the
 *  shared SettingsValues — no runtime coupling. */
export type DnaConfig = Pick<
  SettingsValues,
  | 'dna_price_min'
  | 'dna_price_max'
  | 'dna_change_min'
  | 'dna_rvol_min'
  | 'dna_float_min'
  | 'dna_float_max'
  | 'dna_require_catalyst'
>

/** Per-pillar tally. `n` = trades WITH data for this pillar (the NULL-excluded
 *  denominator); `pct` = passed/n, null when n=0 ("—", never NaN). */
export interface PillarStat {
  passed: number
  n: number
  pct: number | null
}

export interface DnaAdherence {
  perPillar: {
    price: PillarStat
    change: PillarStat
    rvol: PillarStat
    float: PillarStat
  }
  /** Coverage signal (a): tagged = trades with a non-empty catalyst_type;
   *  total = ALL trades; pct null when there are no trades. */
  catalystCoverage: { tagged: number; total: number; pct: number | null }
  /** 3-bucket classification (c) over the 4 numeric pillars. */
  buckets: { fitAll: number; brokeAny: number; incomplete: number; total: number }
  /** P&L cross-cut (d): aggregate() over the fitAll set vs the brokeAny set.
   *  Incomplete trades belong to neither. */
  pnl: { fitAll: TradeAggregate; brokeAny: TradeAggregate }
}

/** Entry price by side — long enters on the buy, short on the sell. Mirrors the
 *  dailyChangeForTrade convention; kept local because that function resolves a
 *  prior close and returns a %-change, not the raw entry price. Both prices are
 *  non-null on TradeListRow, so price-pillar data is always present. */
function entryPrice(t: TradeListRow): number {
  return t.side === 'long' ? t.avg_buy_price : t.avg_sell_price
}

/** A numeric pillar: does the trade have data for it, and does that data pass?
 *  `passes` is written null-safe so it doubles as the bucket-level predicate. */
interface Pillar {
  hasData: (t: TradeListRow) => boolean
  passes: (t: TradeListRow) => boolean
}

function statFor(trades: TradeListRow[], pillar: Pillar): PillarStat {
  let n = 0
  let passed = 0
  for (const t of trades) {
    if (!pillar.hasData(t)) continue
    n += 1
    if (pillar.passes(t)) passed += 1
  }
  return { passed, n, pct: n > 0 ? passed / n : null }
}

export function computeDnaAdherence(trades: TradeListRow[], config: DnaConfig): DnaAdherence {
  // The 4 numeric pillars. price never lacks data (entry price is always present);
  // the other three exclude NULLs from their denominator (the no-fake law).
  const price: Pillar = {
    hasData: () => true,
    passes: (t) => {
      const e = entryPrice(t)
      return e >= config.dna_price_min && e <= config.dna_price_max
    },
  }
  const change: Pillar = {
    hasData: (t) => t.daily_change_pct != null,
    passes: (t) => t.daily_change_pct != null && t.daily_change_pct >= config.dna_change_min,
  }
  const rvol: Pillar = {
    hasData: (t) => t.rvol != null,
    passes: (t) => t.rvol != null && t.rvol >= config.dna_rvol_min,
  }
  const float: Pillar = {
    hasData: (t) => t.float_shares != null,
    passes: (t) =>
      t.float_shares != null &&
      t.float_shares >= config.dna_float_min &&
      t.float_shares <= config.dna_float_max,
  }
  const numeric = [price, change, rvol, float]

  const perPillar = {
    price: statFor(trades, price),
    change: statFor(trades, change),
    rvol: statFor(trades, rvol),
    float: statFor(trades, float),
  }

  // Catalyst coverage (a) — a tagged catalyst is any non-null, non-empty name.
  const total = trades.length
  let tagged = 0
  for (const t of trades) {
    if (t.catalyst_type != null && t.catalyst_type !== '') tagged += 1
  }
  const catalystCoverage = { tagged, total, pct: total > 0 ? tagged / total : null }

  // 3-bucket classification (c) — complete = data for ALL 4 numeric pillars.
  const fitAllTrades: TradeListRow[] = []
  const brokeAnyTrades: TradeListRow[] = []
  let incomplete = 0
  for (const t of trades) {
    if (!numeric.every((p) => p.hasData(t))) {
      incomplete += 1
    } else if (numeric.every((p) => p.passes(t))) {
      fitAllTrades.push(t)
    } else {
      brokeAnyTrades.push(t)
    }
  }
  const buckets = {
    fitAll: fitAllTrades.length,
    brokeAny: brokeAnyTrades.length,
    incomplete,
    total,
  }

  // P&L cross-cut (d) — reuse aggregate() so scratch handling + win_rate agree
  // with the KPI strip / hero cards on the same page.
  const pnl = {
    fitAll: aggregate(fitAllTrades),
    brokeAny: aggregate(brokeAnyTrades),
  }

  return { perPillar, catalystCoverage, buckets, pnl }
}
