// v0.2.5 EdgeIQ Trader DNA — adherence compute. CONSUMES the 5-pillar data on
// each trade row and reports how well the book matched the user's own scan
// profile. PURE per ARCHITECTURE rule #1: zero electron/fs/sqlite/React imports
// (type-only SettingsValues; runtime helpers from /src/core only), so it runs
// identically in the renderer today and a future web target.
//
// The honesty contract (founder-locked) is the whole point of this module:
//   (a) CATALYST is a PILLAR when the user asks for one, and a coverage signal
//       otherwise. THE OLD REASON EXPIRED: this rule used to read "catalyst_type is
//       a name or null, so there's no confirmed no-catalyst value to fail against".
//       That stopped being true the moment the seeded vocabulary shipped
//       'Technical / No Catalyst' (schema 35) — a value that already counts as
//       tagged for XP award D8 and already buckets beside Earnings in Analytics.
//       Schema 49 made the meaning explicit as catalyst_def.kind, so a trade can now
//       say "I checked and there was nothing" and be judged on it. The pillar joins
//       the required set ONLY when dna_require_catalyst is true; with the flag off,
//       nobody's numbers move and catalyst is still REPORTED as coverage.
//       Resolution is by kind, NEVER by label: users rename freely, including that
//       seeded row, and a rename must never change what a trade meant.
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
import type { CatalystDef } from '@shared/catalyst-types'
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
    /** Always MEASURED; only ENFORCED when dna_require_catalyst is true. */
    catalyst: PillarStat
  }
  /** Coverage signal (a): tagged = trades with a non-empty catalyst_type;
   *  total = ALL trades; pct null when there are no trades. */
  catalystCoverage: { tagged: number; total: number; pct: number | null }
  /** 3-bucket classification (c) over the 4 numeric pillars. */
  buckets: { fitAll: number; brokeAny: number; incomplete: number; total: number }
  /** P&L cross-cut (d): aggregate() over the fitAll set vs the brokeAny set.
   *  Incomplete trades belong to neither. */
  pnl: { fitAll: TradeAggregate; brokeAny: TradeAggregate }
  /** TRUE when the pillar was requested but the vocabulary could not be read. This
   *  is a LOAD FAILURE and must never be rendered as "your book is untagged": with
   *  no vocabulary, every tag is unresolvable, which would sweep the whole book into
   *  `incomplete` and tell the user to go and tag trades they have already tagged.
   *  So the pillar STANDS DOWN — buckets stay the four-pillar result — and the UI
   *  reports the load problem instead. Distinguishable here, not just on screen. */
  catalystDefsUnavailable: boolean
}

/** Entry price by side — long enters on the buy, short on the sell. Mirrors the
 *  dailyChangeForTrade convention; kept local because that function resolves a
 *  prior close and returns a %-change, not the raw entry price. Both prices are
 *  non-null on TradeListRow, so price-pillar data is always present. */
function entryPrice(t: TradeListRow): number {
  return t.side === 'long' ? t.avg_buy_price : t.avg_sell_price
}

/** A pillar: does the trade have data for it, and does that data pass? `passes` is
 *  written null-safe so it doubles as the bucket-level predicate. */
interface Pillar {
  hasData: (t: TradeListRow) => boolean
  passes: (t: TradeListRow) => boolean
}

/** The five pillar names, as the scorer reports them. */
export type DnaPillarKey = 'price' | 'change' | 'rvol' | 'float' | 'catalyst'

/** v0.2.7 — the PER-TRADE verdict, extracted so the trades filter can ask it.
 *  Two kinds and only two: a trade with data for every required pillar is
 *  SCORED passed-of-N; a trade missing any required pillar's data is
 *  INCOMPLETE and names what is missing. There is no zero-for-missing — that
 *  is the same no-fake law the aggregate has always applied, per trade.
 *  Kept in sync with the inline mirror on TradeListRow.dna (shared/ is the
 *  lowest layer and cannot import this). */
export type DnaTradeScore =
  | { kind: 'scored'; passed: number; of: number }
  | { kind: 'incomplete'; missing: DnaPillarKey[] }

/** The built pillar set for one (config, vocabulary) pair: the five predicates
 *  plus WHICH of them are required — catalyst joins only when the profile
 *  demands one AND the vocabulary loaded (the stand-down rule). Built once,
 *  shared by the aggregate and the per-trade scorer so they can never drift. */
interface PillarSet {
  pillars: Record<DnaPillarKey, Pillar>
  required: DnaPillarKey[]
  catalystDefsUnavailable: boolean
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

/** Normalise a vocabulary name or a trade's stored tag to its lookup key. Matches
 *  renameCatalystDef's `lower(name)` collision rule, plus a trim, so the pillar is
 *  never STRICTER than the store that accepted the value. */
function catalystKey(raw: string): string {
  return raw.trim().toLowerCase()
}

function buildPillarSet(config: DnaConfig, catalystDefs: CatalystDef[]): PillarSet {
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
  // The catalyst pillar. Resolution is tag -> vocabulary row -> KIND; the label is
  // only ever a lookup key. ARCHIVED rows are included deliberately: a trade tagged
  // with a since-archived catalyst is still a judged trade, and dropping it would
  // silently rewrite history when the user tidies their vocabulary.
  const kindByName = new Map<string, CatalystDef['kind']>()
  for (const d of catalystDefs) kindByName.set(catalystKey(d.name), d.kind)
  const kindOf = (t: TradeListRow): CatalystDef['kind'] | null => {
    const raw = t.catalyst_type
    if (raw == null || raw.trim() === '') return null
    return kindByName.get(catalystKey(raw)) ?? null
  }
  const catalyst: Pillar = {
    // A tag the vocabulary cannot explain is UNJUDGEABLE, not a pass and not a fail
    // — the same no-fake rule the other pillars apply to a missing value.
    hasData: (t) => kindOf(t) !== null,
    passes: (t) => kindOf(t) === 'news',
  }

  // The pillar is requested but the vocabulary is missing: stand down rather than
  // condemn every trade as incomplete. See DnaAdherence.catalystDefsUnavailable.
  const catalystDefsUnavailable = config.dna_require_catalyst && catalystDefs.length === 0
  const enforceCatalyst = config.dna_require_catalyst && !catalystDefsUnavailable

  return {
    pillars: { price, change, rvol, float, catalyst },
    required: enforceCatalyst
      ? ['price', 'change', 'rvol', 'float', 'catalyst']
      : ['price', 'change', 'rvol', 'float'],
    catalystDefsUnavailable,
  }
}

/** Score ONE trade against a built pillar set. */
function scoreWith(ps: PillarSet, t: TradeListRow): DnaTradeScore {
  const missing = ps.required.filter((k) => !ps.pillars[k].hasData(t))
  if (missing.length > 0) return { kind: 'incomplete', missing }
  let passed = 0
  for (const k of ps.required) {
    if (ps.pillars[k].passes(t)) passed += 1
  }
  return { kind: 'scored', passed, of: ps.required.length }
}

/** v0.2.7 — the per-trade verdict, standalone. Builds the pillar set per call;
 *  for a whole book use withDnaScores, which builds it once. */
export function scoreTradeDna(
  t: TradeListRow,
  config: DnaConfig,
  catalystDefs: CatalystDef[],
): DnaTradeScore {
  return scoreWith(buildPillarSet(config, catalystDefs), t)
}

/** v0.2.7 — augment a book with per-trade verdicts, non-mutating. The score
 *  rides the row (TradeListRow.dna, optional) so the trades filter — and any
 *  future column or export — reads it without a second compute or a changed
 *  applyTradesFilters signature. */
export function withDnaScores<T extends TradeListRow>(
  trades: readonly T[],
  config: DnaConfig,
  catalystDefs: CatalystDef[],
): T[] {
  const ps = buildPillarSet(config, catalystDefs)
  return trades.map((t) => ({ ...t, dna: scoreWith(ps, t) }))
}

export function computeDnaAdherence(
  trades: TradeListRow[],
  config: DnaConfig,
  catalystDefs: CatalystDef[],
): DnaAdherence {
  const ps = buildPillarSet(config, catalystDefs)
  const { price, change, rvol, float, catalyst } = ps.pillars
  const { catalystDefsUnavailable } = ps
  const numeric = ps.required.map((k) => ps.pillars[k])

  const perPillar = {
    price: statFor(trades, price),
    change: statFor(trades, change),
    rvol: statFor(trades, rvol),
    float: statFor(trades, float),
    // MEASURED unconditionally — reporting coverage costs nothing and lets the tile
    // stay honest with the flag off. Only the `numeric` set above decides ENFORCEMENT.
    catalyst: statFor(trades, catalyst),
  }

  // Catalyst coverage (a) — a tagged catalyst is any non-null, non-empty name.
  const total = trades.length
  let tagged = 0
  for (const t of trades) {
    if (t.catalyst_type != null && t.catalyst_type !== '') tagged += 1
  }
  const catalystCoverage = { tagged, total, pct: total > 0 ? tagged / total : null }

  // 3-bucket classification (c) — complete = data for every REQUIRED pillar (the
  // four numeric ones, plus catalyst when the profile demands one).
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

  return { perPillar, catalystCoverage, buckets, pnl, catalystDefsUnavailable }
}
