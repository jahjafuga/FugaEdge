import { openDatabase } from '../db/database'
import { scopeFilter } from '../accounts/scope'
import type { AccountScope } from '@shared/accounts-types'
import { readRuleBreaksByDate } from '../ruleBreaks/repo'
import { computeRiskBreakdown } from '../lib/r-multiple'
import { computeExitDeltas } from '@/core/analytics/exit-quality'
import { computeRuleBreaks } from '@/core/analytics/ruleBreaks'
import { computeGiveback } from '@/core/analytics/giveback'
import { computeDrawdown } from '@/core/performance/equity'
import { utcToEasternParts } from '@/lib/format'
import { classifyOutcome, isWin, isLoss } from '@/core/classify/outcome'
import { isSummaryTrip } from '@/core/classify/summaryTrip'
import {
  EMA9_DISTANCE_BUCKET_LABELS,
  ema9DistanceLabel,
  isExtendedEntry,
} from '@/core/technicals/ema9DistanceBuckets'
import type {
  AnalyticsData,
  CatalystAnalytics,
  CatalystBucket,
  FloatAnalytics,
  FloatBucket,
  FloatBucketKey,
  SentimentAnalytics,
  SentimentBucket,
  CurrentStreak,
  DisciplineStats,
  EquityPoint,
  ExitDelta,
  ExtendedEntryCompare,
  FeeImpact,
  MaxDrawdown,
  MistakeImpact,
  MistakesAnalytics,
  MomentumAnalytics,
  MomentumBucket,
  RAnalytics,
  RBucket,
  Streak,
  SymbolStat,
  VolumeByTimeBucket,
} from '@shared/analytics-types'
import type { RoundTripExecution } from '@shared/import-types'
import type { MistakeAxis } from '@shared/mistakes-types'

interface TradeRow {
  id: number
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  shares_bought: number
  shares_sold: number
  avg_buy_price: number
  avg_sell_price: number
  gross_pnl: number
  total_fees: number
  net_pnl: number
  source_format: string | null
  executions_json: string
  entry_timeframe: string | null
  entry_ema9_distance_pct: number | null
  confidence: number | null
  // Beat 2c-display-β.1 — junction tags (a json_group_array(json_object('name',
  // md.name, 'axis', md.axis)) string from trade_mistake → mistake_def, the same
  // shape list.ts ships as mistake_tags_json). NULL when the trade has no junction
  // rows. computeMistakes reads THIS (parses {name, axis}, keys by (axis, name)).
  mistake_tags_json: string | null
  planned_risk: number | null
  planned_stop_loss_price: number | null
  float_shares: number | null
  catalyst_type: string | null
  sentiment: number | null    // joined from session_meta by date
}

function parseExecs(raw: string | null | undefined): RoundTripExecution[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as RoundTripExecution[]) : []
  } catch {
    return []
  }
}

function computeEquity(rows: TradeRow[]): EquityPoint[] {
  const byDate = new Map<string, number>()
  for (const r of rows) {
    byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.net_pnl)
  }
  const dates = Array.from(byDate.keys()).sort()
  let cum = 0
  return dates.map((d) => {
    const daily = byDate.get(d) ?? 0
    cum += daily
    return { date: d, daily_pnl: daily, cumulative_net_pnl: cum }
  })
}

interface StreakBuild {
  kind: 'win' | 'loss'
  length: number
  start_date: string
  end_date: string
  total_pnl: number
}

function computeStreaks(rows: TradeRow[]): {
  longestWin: Streak | null
  longestLoss: Streak | null
  current: CurrentStreak | null
} {
  const sorted = [...rows].sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )

  // Collect every completed streak; pick the longest of each kind afterwards.
  const completed: StreakBuild[] = []
  let cur: StreakBuild | null = null

  for (const t of sorted) {
    const kind = classifyOutcome(t.net_pnl)

    if (kind === 'scratch') {
      // A scratch ends any in-progress streak.
      if (cur) completed.push(cur)
      cur = null
      continue
    }

    if (!cur || cur.kind !== kind) {
      if (cur) completed.push(cur)
      cur = {
        kind,
        length: 1,
        start_date: t.date,
        end_date: t.date,
        total_pnl: t.net_pnl,
      }
    } else {
      cur.length += 1
      cur.end_date = t.date
      cur.total_pnl += t.net_pnl
    }
  }

  // Include the currently-running streak in the "completed" pool for
  // longest-of-each-kind selection (without ending it).
  const allForLongest: StreakBuild[] = cur ? [...completed, cur] : completed

  const longestOf = (kind: 'win' | 'loss'): StreakBuild | null => {
    let best: StreakBuild | null = null
    for (const s of allForLongest) {
      if (s.kind !== kind) continue
      if (!best || s.length > best.length) best = s
    }
    return best
  }

  const longestWin = longestOf('win')
  const longestLoss = longestOf('loss')

  const toStreak = (b: StreakBuild | null): Streak | null =>
    b
      ? {
          kind: b.kind,
          length: b.length,
          start_date: b.start_date,
          end_date: b.end_date,
          total_pnl: b.total_pnl,
        }
      : null

  const current: CurrentStreak | null = cur
    ? {
        kind: cur.kind,
        length: cur.length,
        start_date: cur.start_date,
        total_pnl: cur.total_pnl,
      }
    : null

  return {
    longestWin: toStreak(longestWin),
    longestLoss: toStreak(longestLoss),
    current,
  }
}

function computeFeeImpact(rows: TradeRow[]): FeeImpact {
  let fees = 0
  let gross = 0
  let net = 0
  for (const r of rows) {
    fees += r.total_fees
    gross += r.gross_pnl
    net += r.net_pnl
  }
  const decisive = gross > 0
  return {
    total_fees: fees,
    total_gross_pnl: gross,
    total_net_pnl: net,
    fees_as_pct_of_gross: decisive ? fees / gross : null,
    avg_fee_per_trade: rows.length > 0 ? fees / rows.length : null,
  }
}

function computeSymbols(rows: TradeRow[]): { best: SymbolStat[]; worst: SymbolStat[] } {
  const map = new Map<string, SymbolStat>()
  for (const r of rows) {
    let s = map.get(r.symbol)
    if (!s) {
      s = {
        symbol: r.symbol,
        trade_count: 0,
        net_pnl: 0,
        total_fees: 0,
        winners: 0,
        losers: 0,
      }
      map.set(r.symbol, s)
    }
    s.trade_count += 1
    s.net_pnl += r.net_pnl
    s.total_fees += r.total_fees
    if (isWin(r.net_pnl)) s.winners += 1
    else if (isLoss(r.net_pnl)) s.losers += 1
  }
  const all = Array.from(map.values())
  const best = [...all]
    .filter((s) => s.net_pnl > 0)
    .sort((a, b) => b.net_pnl - a.net_pnl)
    .slice(0, 5)
  const worst = [...all]
    .filter((s) => s.net_pnl < 0)
    .sort((a, b) => a.net_pnl - b.net_pnl)
    .slice(0, 5)
  return { best, worst }
}

function computeExitQuality(rows: TradeRow[], limit = 10): ExitDelta[] {
  // Shared fill-based best-exit math lives in src/core/analytics/exit-quality.
  // This view shows only the top-N worst gaps; the day/week Money-Left sum uses
  // the full list from the same function.
  const deltas = computeExitDeltas(
    rows.map((r) => ({
      id: r.id,
      date: r.date,
      symbol: r.symbol,
      side: r.side,
      net_pnl: r.net_pnl,
      total_fees: r.total_fees,
      executions: parseExecs(r.executions_json),
    })),
  )
  return deltas.slice(0, limit)
}

// ── Momentum-specific analytics ────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function bucketWindow(iso: string): string | null {
  // `iso` is true UTC (Day 8.5 Commit B) — bucket by Eastern wall-clock so
  // the half-hour windows line up with US market hours.
  const p = utcToEasternParts(iso)
  if (!p) return null
  const halfHour = p.minute < 30 ? '00' : '30'
  return `${pad2(p.hour)}:${halfHour}`
}

function computeVolumeByTimeOfDay(rows: TradeRow[]): VolumeByTimeBucket[] {
  const map = new Map<string, VolumeByTimeBucket>()
  for (const t of rows) {
    if (isSummaryTrip(t)) continue // Phase 3 — fake 09:30 anchor, no real fill time
    const key = bucketWindow(t.open_time)
    if (!key) continue
    let b = map.get(key)
    if (!b) {
      b = { window: key, trade_count: 0, shares: 0, net_pnl: 0 }
      map.set(key, b)
    }
    b.trade_count += 1
    b.shares += t.shares_bought + t.shares_sold
    b.net_pnl += t.net_pnl
  }
  return Array.from(map.values()).sort((a, b) =>
    a.window < b.window ? -1 : a.window > b.window ? 1 : 0,
  )
}

function bucketStatsFor(trades: TradeRow[], key: string): MomentumBucket {
  let net = 0
  let winnersSum = 0
  let losersSum = 0
  let winners = 0
  let losers = 0
  for (const t of trades) {
    net += t.net_pnl
    if (isWin(t.net_pnl)) {
      winnersSum += t.net_pnl
      winners++
    } else if (isLoss(t.net_pnl)) {
      losersSum += t.net_pnl
      losers++
    }
  }
  const decided = winners + losers
  return {
    key,
    trade_count: trades.length,
    net_pnl: net,
    win_rate: decided > 0 ? winners / decided : null,
    avg_winner: winners > 0 ? winnersSum / winners : null,
    avg_loser: losers > 0 ? losersSum / losers : null,
  }
}

function computeByTimeframe(rows: TradeRow[]): MomentumBucket[] {
  const order = ['10s', '1m', '5m']
  const groups = new Map<string, TradeRow[]>()
  for (const t of rows) {
    if (t.entry_timeframe == null) continue
    const key = t.entry_timeframe
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  // Only emit groups that have rows; preserve our preferred order.
  return order
    .filter((k) => groups.has(k))
    .map((k) => bucketStatsFor(groups.get(k)!, k))
}

function computeByConfidence(rows: TradeRow[]): MomentumBucket[] {
  const order = ['1', '2', '3', '4', '5']
  const groups = new Map<string, TradeRow[]>()
  for (const t of rows) {
    if (t.confidence == null) continue
    const key = String(t.confidence)
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return order
    .filter((k) => groups.has(k))
    .map((k) => bucketStatsFor(groups.get(k)!, `${k} dot${k === '1' ? '' : 's'}`))
}

function computeByEma9(rows: TradeRow[]): MomentumBucket[] {
  const groups = new Map<string, TradeRow[]>()
  for (const t of rows) {
    const key = ema9DistanceLabel(t.entry_ema9_distance_pct)
    if (key === null) continue
    const list = groups.get(key)
    if (list) list.push(t)
    else groups.set(key, [t])
  }
  return EMA9_DISTANCE_BUCKET_LABELS
    .filter((k) => groups.has(k))
    .map((k) => bucketStatsFor(groups.get(k)!, k))
}

function computeExtendedCompare(rows: TradeRow[]): ExtendedEntryCompare {
  let clean: TradeRow[] = []
  let extended: TradeRow[] = []
  let withData = 0
  let missing = 0
  for (const t of rows) {
    if (t.entry_ema9_distance_pct == null) {
      missing++
      continue
    }
    withData++
    if (isExtendedEntry(t.entry_ema9_distance_pct)) extended.push(t)
    else clean.push(t)
  }
  const sumCleanPnl = clean.reduce((s, t) => s + t.net_pnl, 0)
  const sumExtPnl = extended.reduce((s, t) => s + t.net_pnl, 0)
  const wlRate = (list: TradeRow[]): number | null => {
    const w = list.filter((t) => isWin(t.net_pnl)).length
    const l = list.filter((t) => isLoss(t.net_pnl)).length
    const decided = w + l
    return decided > 0 ? w / decided : null
  }
  return {
    clean_count: clean.length,
    clean_net_pnl: sumCleanPnl,
    clean_win_rate: wlRate(clean),
    extended_count: extended.length,
    extended_net_pnl: sumExtPnl,
    extended_win_rate: wlRate(extended),
    trades_with_data: withData,
    trades_missing_data: missing,
  }
}

function computeMomentum(rows: TradeRow[]): MomentumAnalytics {
  return {
    volumeByHalfHour: computeVolumeByTimeOfDay(rows),
    byTimeframe: computeByTimeframe(rows),
    byEma9Bucket: computeByEma9(rows),
    byConfidence: computeByConfidence(rows),
    extendedEntry: computeExtendedCompare(rows),
    ema9_coverage: rows.filter((t) => t.entry_ema9_distance_pct != null).length,
    confidence_coverage: rows.filter((t) => t.confidence != null).length,
  }
}

// Beat 2c-display-β.1 — clamp a stored axis string to the two-value union;
// defensive (the mistake_def CHECK keeps it to these). Mirrors list.ts:toAxis.
function toAxis(raw: unknown): MistakeAxis {
  return raw === 'psychological' ? 'psychological' : 'technical'
}

// Beat 2c-display-β.1 — parse the batched junction read: a json_group_array(
// json_object('name', md.name, 'axis', md.axis)) string, already ORDER BY axis,
// sort_position from SQL. Returns the ordered {name, axis} tags; blank names are
// dropped (junction names are never blank — belt-and-suspenders). Mirrors
// list.ts:parseMistakeTags exactly.
function parseMistakeTags(
  raw: string | null | undefined,
): { name: string; axis: MistakeAxis }[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .map((e) => ({
        name: String((e as { name?: unknown }).name ?? ''),
        axis: toAxis((e as { axis?: unknown }).axis),
      }))
      .filter((t) => t.name)
  } catch {
    return []
  }
}

function computeMistakes(rows: TradeRow[]): MistakesAnalytics {
  // Aggregate per mistake label. A trade with multiple mistakes contributes to
  // each label's bucket — so the same trade can show up under several rows.
  // Keyed by a composite (axis, name) — JSON.stringify([axis, name]) is a canonical,
  // collision-free key, so the SAME name on two axes stays two distinct buckets (the
  // unique index is per-(axis, name)). The value carries axis + name so each
  // MistakeImpact reads them back.
  const perLabel = new Map<
    string,
    { axis: MistakeAxis; name: string; count: number; net: number; winners: number; losers: number }
  >()
  let withAny = 0
  let withoutAny = 0
  let flawedNet = 0
  let cleanNet = 0
  let flawedWinners = 0
  let flawedLosers = 0
  let cleanWinners = 0
  let cleanLosers = 0

  for (const t of rows) {
    const mistakes = parseMistakeTags(t.mistake_tags_json)
    const hasAny = mistakes.length > 0
    if (hasAny) {
      withAny++
      flawedNet += t.net_pnl
      if (isWin(t.net_pnl)) flawedWinners++
      else if (isLoss(t.net_pnl)) flawedLosers++
      for (const m of mistakes) {
        const key = JSON.stringify([m.axis, m.name])
        let entry = perLabel.get(key)
        if (!entry) {
          entry = { axis: m.axis, name: m.name, count: 0, net: 0, winners: 0, losers: 0 }
          perLabel.set(key, entry)
        }
        entry.count += 1
        entry.net += t.net_pnl
        if (isWin(t.net_pnl)) entry.winners += 1
        else if (isLoss(t.net_pnl)) entry.losers += 1
      }
    } else {
      withoutAny++
      cleanNet += t.net_pnl
      if (isWin(t.net_pnl)) cleanWinners++
      else if (isLoss(t.net_pnl)) cleanLosers++
    }
  }

  const byMistake: MistakeImpact[] = Array.from(perLabel.values()).map((agg) => {
    const decided = agg.winners + agg.losers
    return {
      label: agg.name,
      axis: agg.axis,
      trade_count: agg.count,
      net_pnl: agg.net,
      avg_pnl: agg.count > 0 ? agg.net / agg.count : null,
      win_rate: decided > 0 ? agg.winners / decided : null,
    }
  })
  // Worst impact first — that's the row you actually want to act on.
  byMistake.sort((a, b) => a.net_pnl - b.net_pnl)

  const flawedDecided = flawedWinners + flawedLosers
  const cleanDecided = cleanWinners + cleanLosers

  return {
    byMistake,
    trades_with_any_mistake: withAny,
    trades_without_mistakes: withoutAny,
    flawed_net_pnl: flawedNet,
    clean_net_pnl: cleanNet,
    flawed_win_rate: flawedDecided > 0 ? flawedWinners / flawedDecided : null,
    clean_win_rate: cleanDecided > 0 ? cleanWinners / cleanDecided : null,
  }
}

// 8 buckets bracketing typical R-distribution shapes for momentum traders.
// Lower bound inclusive, upper bound exclusive (Infinity used for the open
// ends).
const R_BUCKET_DEFS: { key: string; range: [number, number] }[] = [
  { key: '≤ -3R',  range: [-Infinity, -3] },
  { key: '-3..-2R', range: [-3, -2] },
  { key: '-2..-1R', range: [-2, -1] },
  { key: '-1..0R',  range: [-1, 0] },
  { key: '0..1R',   range: [0, 1] },
  { key: '1..2R',   range: [1, 2] },
  { key: '2..3R',   range: [2, 3] },
  { key: '> 3R',   range: [3, Infinity] },
]

function bucketForR(r: number): number {
  for (let i = 0; i < R_BUCKET_DEFS.length; i++) {
    const [lo, hi] = R_BUCKET_DEFS[i].range
    if (r >= lo && r < hi) return i
  }
  // Numbers exactly at +Infinity (shouldn't happen with finite R) fall into
  // the last bucket as a safety.
  return R_BUCKET_DEFS.length - 1
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function computeRAnalytics(rows: TradeRow[]): RAnalytics {
  const rs: number[] = []
  // Bucket counts + per-bucket P&L roll-up.
  const buckets: RBucket[] = R_BUCKET_DEFS.map((b) => ({
    key: b.key,
    range: b.range,
    count: 0,
    net_pnl: 0,
  }))

  for (const t of rows) {
    const { r_multiple: r } = computeRiskBreakdown(t.net_pnl, {
      side: t.side,
      avg_buy_price: t.avg_buy_price,
      avg_sell_price: t.avg_sell_price,
      shares_bought: t.shares_bought,
      shares_sold: t.shares_sold,
      planned_risk: t.planned_risk,
      planned_stop_loss_price: t.planned_stop_loss_price,
    })
    if (r === null || !Number.isFinite(r)) continue
    rs.push(r)
    const idx = bucketForR(r)
    buckets[idx].count += 1
    buckets[idx].net_pnl += t.net_pnl
  }

  const avg = rs.length > 0 ? rs.reduce((s, v) => s + v, 0) / rs.length : null

  return {
    coverage: rs.length,
    total_trades: rows.length,
    avg_r: avg,
    median_r: median(rs),
    best_r: rs.length > 0 ? Math.max(...rs) : null,
    worst_r: rs.length > 0 ? Math.min(...rs) : null,
    expectancy: avg,
    buckets,
  }
}

function computeDiscipline(
  db: ReturnType<typeof openDatabase>,
  rows: TradeRow[],
): DisciplineStats {
  const tradeDates = new Set(rows.map((r) => r.date))
  const journalRows = db
    .prepare(`
      SELECT date FROM journal
      WHERE (premarket_notes IS NOT NULL AND TRIM(premarket_notes) != '')
         OR (postsession_notes IS NOT NULL AND TRIM(postsession_notes) != '')
         OR emotion_rating IS NOT NULL
         OR (rules_followed IS NOT NULL AND rules_followed != '' AND rules_followed != '[]')
         OR (rule_violations IS NOT NULL AND rule_violations != '' AND rule_violations != '[]')
         OR (day_tags IS NOT NULL AND day_tags != '' AND day_tags != '[]')
    `)
    .all() as { date: string }[]
  const journalDates = new Set(journalRows.map((r) => r.date))

  // No-trade days marked WITH A REASON count as discipline — sitting out
  // when there's no setup is just as much a "show up" as taking a trade.
  // Empty-reason rows don't count to avoid users gaming the streak with
  // a one-click toggle.
  const noTradeRows = db
    .prepare(`
      SELECT date FROM session_meta
      WHERE no_trade_day = 1 AND TRIM(no_trade_reason) != ''
    `)
    .all() as { date: string }[]
  const noTradeDates = new Set(noTradeRows.map((r) => r.date))

  // Discipline streak: consecutive market days walking back from today (or
  // last active market day) where the user traded, journaled, or marked a
  // reasoned no-trade day.
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  const ymd = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const isMarketDay = (d: Date) => {
    const dow = d.getDay()
    return dow >= 1 && dow <= 5
  }
  const showedUp = (d: string) =>
    tradeDates.has(d) || journalDates.has(d) || noTradeDates.has(d)
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  // Forgive today: don't break the streak just because today hasn't started.
  while (isMarketDay(cursor) && !showedUp(ymd(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (cursor.getFullYear() < 1990) break
  }
  let streak = 0
  while (cursor.getFullYear() >= 1990) {
    if (isMarketDay(cursor)) {
      if (showedUp(ymd(cursor))) streak++
      else break
    }
    cursor.setDate(cursor.getDate() - 1)
  }

  const days_traded = tradeDates.size
  const days_journaled = journalDates.size
  const ratio = days_traded === 0 ? 0 : days_journaled / days_traded
  const discipline_score = Math.min(100, Math.round(ratio * 100))

  return { days_traded, days_journaled, discipline_streak: streak, discipline_score }
}

// Bucket boundaries for the By-Float-Size breakdown. Values are exclusive
// upper bounds — a trade with float_shares exactly at 1M lands in 'micro'.
//
//   nano:  <1M
//   micro: 1M – 5M
//   small: 5M – 20M
//   mid:   20M+
//   unset: float_shares is null (not yet enriched / not available)
function bucketForFloat(f: number | null): FloatBucketKey {
  if (f == null || !Number.isFinite(f) || f <= 0) return 'unset'
  if (f < 1_000_000) return 'nano'
  if (f < 5_000_000) return 'micro'
  if (f < 20_000_000) return 'small'
  return 'mid'
}

function computeFloatAnalytics(rows: TradeRow[]): FloatAnalytics {
  const order: FloatBucketKey[] = ['nano', 'micro', 'small', 'mid', 'unset']
  const labels: Record<FloatBucketKey, string> = {
    nano:  'Nano (<1M)',
    micro: 'Micro (1M – 5M)',
    small: 'Small (5M – 20M)',
    mid:   'Mid (20M+)',
    unset: 'Unset',
  }

  const acc: Record<FloatBucketKey, { trade_count: number; net_pnl: number; winners: number; losers: number }> = {
    nano:  { trade_count: 0, net_pnl: 0, winners: 0, losers: 0 },
    micro: { trade_count: 0, net_pnl: 0, winners: 0, losers: 0 },
    small: { trade_count: 0, net_pnl: 0, winners: 0, losers: 0 },
    mid:   { trade_count: 0, net_pnl: 0, winners: 0, losers: 0 },
    unset: { trade_count: 0, net_pnl: 0, winners: 0, losers: 0 },
  }

  let coverage = 0
  for (const r of rows) {
    const key = bucketForFloat(r.float_shares)
    if (key !== 'unset') coverage += 1
    const a = acc[key]
    a.trade_count += 1
    a.net_pnl += r.net_pnl
    if (isWin(r.net_pnl)) a.winners += 1
    else if (isLoss(r.net_pnl)) a.losers += 1
  }

  const buckets: FloatBucket[] = order.map((key) => {
    const a = acc[key]
    const decided = a.winners + a.losers // exclude scratches from the rate denominator
    return {
      key,
      label: labels[key],
      trade_count: a.trade_count,
      net_pnl: a.net_pnl,
      winners: a.winners,
      losers: a.losers,
      win_rate: decided > 0 ? a.winners / decided : null,
    }
  })

  return { buckets, coverage, total_trades: rows.length }
}

function computeSentimentAnalytics(rows: TradeRow[]): SentimentAnalytics {
  // Stable label order, best-first (post-schema-29 polarity: 5 = best, 1 = worst).
  // 'null' bucket (unset) always renders last so the numbered rows form a clean
  // 5→1 sequence (best at top) — matching the best-first sentiment option rows.
  const order: (1 | 2 | 3 | 4 | 5 | null)[] = [5, 4, 3, 2, 1, null]
  const labels: Record<string, string> = {
    // Kept in sync BY HAND with SENTIMENT_LABELS (shared/session-types.ts) —
    // post-schema-29 polarity: 5 = best, 1 = worst. (Collapsing this duplicate
    // into the shared record is its own later hygiene beat.)
    '1': '1 — 0 stocks >50%',
    '2': '2 — 1 stock >50%',
    '3': '3 — 1 stock >100%',
    '4': '4 — 2 stocks >100%',
    '5': '5 — 3+ stocks >100%',
    null: 'Unrated',
  }

  interface Bucket {
    trade_count: number
    net_pnl: number
    winners: number
    losers: number
    winner_pnl_sum: number
    loser_pnl_sum: number
  }
  const empty = (): Bucket => ({
    trade_count: 0,
    net_pnl: 0,
    winners: 0,
    losers: 0,
    winner_pnl_sum: 0,
    loser_pnl_sum: 0,
  })
  const acc: Record<string, Bucket> = {
    '1': empty(), '2': empty(), '3': empty(), '4': empty(), '5': empty(),
    null: empty(),
  }

  const ratedDays = new Set<string>()
  const allDays = new Set<string>()
  for (const r of rows) {
    allDays.add(r.date)
    const key = r.sentiment == null ? 'null' : String(r.sentiment)
    if (r.sentiment != null) ratedDays.add(r.date)
    const b = acc[key]
    if (!b) continue
    b.trade_count += 1
    b.net_pnl += r.net_pnl
    if (isWin(r.net_pnl)) {
      b.winners += 1
      b.winner_pnl_sum += r.net_pnl
    } else if (isLoss(r.net_pnl)) {
      b.losers += 1
      b.loser_pnl_sum += r.net_pnl
    }
  }

  const buckets: SentimentBucket[] = order.map((level) => {
    const key = level == null ? 'null' : String(level)
    const b = acc[key]
    const decided = b.winners + b.losers
    return {
      level,
      label: labels[key],
      trade_count: b.trade_count,
      net_pnl: b.net_pnl,
      winners: b.winners,
      losers: b.losers,
      win_rate: decided > 0 ? b.winners / decided : null,
      avg_winner: b.winners > 0 ? b.winner_pnl_sum / b.winners : null,
      avg_loser:  b.losers > 0 ? b.loser_pnl_sum / b.losers : null,
    }
  })

  return { buckets, rated_days: ratedDays.size, total_days: allDays.size }
}

function computeCatalystAnalytics(rows: TradeRow[]): CatalystAnalytics {
  // Bucket by raw catalyst_type string. Null / empty falls into a single
  // "Unset" group keyed by 'null'. Order: tagged buckets sorted by
  // trade_count desc, then 'Unset' last so the active categories surface
  // at the top.
  interface Bucket {
    catalyst_type: string | null
    trade_count: number
    net_pnl: number
    winners: number
    losers: number
    winner_pnl_sum: number
    loser_pnl_sum: number
  }
  const map = new Map<string, Bucket>()
  const keyOf = (s: string | null) => (s == null || s.trim() === '' ? '' : s.trim())

  let tagged = 0
  for (const r of rows) {
    const k = keyOf(r.catalyst_type)
    if (k !== '') tagged += 1
    let b = map.get(k)
    if (!b) {
      b = {
        catalyst_type: k === '' ? null : k,
        trade_count: 0,
        net_pnl: 0,
        winners: 0,
        losers: 0,
        winner_pnl_sum: 0,
        loser_pnl_sum: 0,
      }
      map.set(k, b)
    }
    b.trade_count += 1
    b.net_pnl += r.net_pnl
    if (isWin(r.net_pnl)) {
      b.winners += 1
      b.winner_pnl_sum += r.net_pnl
    } else if (isLoss(r.net_pnl)) {
      b.losers += 1
      b.loser_pnl_sum += r.net_pnl
    }
  }

  // Tagged catalysts sorted by trade count desc; the 'Unset' bucket always
  // sits last so the active categories surface at the top of the table.
  const tagged_buckets = Array.from(map.values())
    .filter((b) => b.catalyst_type != null)
    .sort((a, b) => b.trade_count - a.trade_count)
  const unset_bucket = map.get('')

  const toFinal = (b: Bucket): CatalystBucket => {
    const decided = b.winners + b.losers
    return {
      catalyst_type: b.catalyst_type,
      trade_count: b.trade_count,
      net_pnl: b.net_pnl,
      winners: b.winners,
      losers: b.losers,
      win_rate: decided > 0 ? b.winners / decided : null,
      avg_winner: b.winners > 0 ? b.winner_pnl_sum / b.winners : null,
      avg_loser:  b.losers > 0 ? b.loser_pnl_sum / b.losers : null,
    }
  }

  const buckets: CatalystBucket[] = [
    ...tagged_buckets.map(toFinal),
    ...(unset_bucket ? [toFinal(unset_bucket)] : []),
  ]

  return { buckets, tagged_trades: tagged, total_trades: rows.length }
}

// (3b-1 removed parseRuleBreaks from here. The rollup below no longer reads the
// journal.rule_breaks JSON column, so nothing in this module parses it. The parser still
// exists — and is still live — in src/core/ruleBreaks/usage.ts, which backs the Settings
// freeze guard, the one remaining column reader. See day/ruleBreaks.ts:getRuleBreakUsage
// for why that one deliberately did NOT follow the rollup onto the junction.)

export function getAnalytics(scope: AccountScope = 'all'): AnalyticsData {
  const db = openDatabase()
  // Multi-account slice — the ONE trades read every downstream aggregation
  // (equity, streaks, giveback, setups, Psychology) is pure compute over;
  // scoping it here scopes the whole payload. The journal / session_meta
  // discipline + rule-break reads below are day-level metadata with no
  // account column and stay GLOBAL (the calendar ruling).
  const sf = scopeFilter(scope)
  const rows = db
    .prepare(`
      SELECT t.id, t.date, t.symbol, t.side, t.open_time, t.close_time,
             t.shares_bought, t.shares_sold,
             t.avg_buy_price, t.avg_sell_price,
             t.gross_pnl, t.total_fees, t.net_pnl, t.executions_json,
             t.entry_timeframe, t.entry_ema9_distance_pct,
             t.confidence,
             mn.tags AS mistake_tags_json,
             t.planned_risk, t.planned_stop_loss_price, t.float_shares,
             t.catalyst_type,
             t.source_format,
             sm.sentiment AS sentiment
      FROM trades t
      LEFT JOIN session_meta sm ON sm.date = t.date
      LEFT JOIN (
        SELECT jm.trade_id AS trade_id,
               json_group_array(
                 json_object('name', md.name, 'axis', md.axis)
                 ORDER BY md.axis, md.sort_position
               ) AS tags
        FROM trade_mistake jm
        JOIN mistake_def md ON md.id = jm.mistake_def_id
        GROUP BY jm.trade_id
      ) mn ON mn.trade_id = t.id
      WHERE t.deleted_at IS NULL AND ${sf.clause}
    `)
    .all(...sf.params) as TradeRow[]

  const equity = computeEquity(rows)
  // Drawdown comes from the SAME pure, guarded computeDrawdown the Reports
  // drawdown card uses, so the two can't drift. (An earlier near-zero-base
  // ratio guard reached only the pure copy; the old local computeMaxDrawdown
  // divided amount/peak unguarded, so a small peak could read below -100%.)
  // Map the analytics EquityPoint (cumulative_net_pnl) onto the pure shape
  // (cumulative), then project DrawdownInfo down to the MaxDrawdown fields the
  // renderer reads (dropping the pure curve/extra fields so the IPC payload
  // stays lean). Keep the prior "null when there's no real drawdown" contract
  // so the card's empty state is unchanged.
  const ddInfo = computeDrawdown(
    equity.map((p) => ({
      date: p.date,
      daily_pnl: p.daily_pnl,
      cumulative: p.cumulative_net_pnl,
    })),
  )
  const maxDrawdown: MaxDrawdown | null =
    ddInfo && ddInfo.amount > 0
      ? {
          amount: ddInfo.amount,
          percent: ddInfo.percent,
          peak_date: ddInfo.peak_date,
          peak_value: ddInfo.peak_value,
          trough_date: ddInfo.trough_date,
          trough_value: ddInfo.trough_value,
          recovered: ddInfo.recovered,
          recovery_date: ddInfo.recovery_date,
        }
      : null
  const { longestWin, longestLoss, current } = computeStreaks(rows)
  const feeImpact = computeFeeImpact(rows)
  const { best, worst } = computeSymbols(rows)
  const exitQuality = computeExitQuality(rows)
  const discipline = computeDiscipline(db, rows)

  // Phase 3 — per-day rule-break rollup, paired with the per-date net P&L the equity
  // curve already computed. The aggregation is the pure computeRuleBreaks (src/core);
  // getAnalytics only marshals the inputs.
  //
  // 3b-1 — THE READ SWAP. This used to scan journal.rule_breaks (a JSON array of NAME
  // strings) and group by the raw string. It now reads the journal_rule_break JUNCTION
  // JOINed to rule_break_def, so a rule is counted under its CURRENT name. That is what
  // makes 3b-2's rename history-preserving instead of history-orphaning: renaming a def
  // re-labels every day that ever broke it, rather than stranding them under the old
  // string while the vocabulary moves on.
  //
  // The JOIN carries NO is_archived filter — a day that broke a since-archived rule still
  // broke it, and dropping it would silently rewrite history. That is the mistakes rollup's
  // precedent, verbatim (:911-917 above JOINs mistake_def with no archived filter).
  //
  // computeRuleBreaks is UNCHANGED: it took date->label[] before and it takes date->label[]
  // now. The one behaviour change is a merge it inherits from the junction — a legacy day
  // whose column held both "Overtrading" and "overtrading" was TWO buckets and is now ONE,
  // because ux_rule_break_def_name is UNIQUE(lower(name)). They are the same rule, so the
  // merge is a correction, and it is pinned explicitly rather than left to surprise someone:
  // electron/ruleBreaks/__tests__/repo.inmemory.ts, fixture [A].
  const ruleBreaksByDate = readRuleBreaksByDate(db)
  const netPnlByDate = new Map<string, number>(
    equity.map((p) => [p.date, p.daily_pnl]),
  )
  const ruleBreaks = computeRuleBreaks(ruleBreaksByDate, netPnlByDate)

  // "Gave back profits" (djsevans87) — goal-triggered giveback over each day's
  // CLOSED trades in close_time order. Mirrors the rule-breaks marshalling above:
  // getAnalytics reads the inputs directly off `db` (the same direct-query style as
  // the ruleBreaks / discipline blocks); the pure computeGiveback does the high-
  // water-mark walk. Open trades (close_time null) are excluded — the walk is over
  // realized P&L only. close_time is ISO-8601 UTC, so a lexicographic sort is
  // chronological. daily_profit_target is the KV setting (absent / non-finite /
  // <= 0 ⇒ no goal), read the same way getSettings parses it.
  const targetRow = db
    .prepare(`SELECT value FROM settings WHERE key = 'daily_profit_target'`)
    .get() as { value: string } | undefined
  const parsedTarget = targetRow ? Number.parseFloat(targetRow.value) : 0
  const dailyProfitTarget = Number.isFinite(parsedTarget) ? parsedTarget : 0
  const closedByCloseTime = rows
    .filter((r) => r.close_time != null)
    .sort((a, b) => (a.close_time! < b.close_time! ? -1 : a.close_time! > b.close_time! ? 1 : 0))
  const tradesByDate = new Map<string, { net_pnl: number }[]>()
  for (const r of closedByCloseTime) {
    const arr = tradesByDate.get(r.date)
    if (arr) arr.push({ net_pnl: r.net_pnl })
    else tradesByDate.set(r.date, [{ net_pnl: r.net_pnl }])
  }
  const giveback = computeGiveback(tradesByDate, dailyProfitTarget)

  return {
    trade_count: rows.length,
    equity,
    maxDrawdown,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    currentStreak: current,
    feeImpact,
    bestSymbols: best,
    worstSymbols: worst,
    exitQuality,
    momentum: computeMomentum(rows),
    mistakes: computeMistakes(rows),
    ruleBreaks,
    giveback,
    r: computeRAnalytics(rows),
    float: computeFloatAnalytics(rows),
    sentiment: computeSentimentAnalytics(rows),
    catalyst: computeCatalystAnalytics(rows),
    discipline,
  }
}
