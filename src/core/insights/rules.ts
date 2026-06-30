// The 10 Insights rules. Each function is pure: takes the InsightInput and
// returns InsightResult | null (or InsightResult[] for rules that emit
// more than one card, like catalyst strength). The registry in index.ts
// calls each and concatenates their outputs.
//
// Conventions per the spec:
//   - Below the rule's minimum sample size → return null (no card).
//   - Magnitude × sample size shapes priority — sample-of-3 weak signals
//     should not outrank sample-of-50 strong signals.
//   - Body sentences are plain text (no JSX). Numbers formatted by helpers
//     so the UI is decoupled from formatting decisions.

import type { TradeListRow } from '@shared/trades-types'
import type { InsightInput, InsightResult } from './types'
import { utcToEasternParts } from '@/lib/format'
import { isWin, isLoss } from '@/core/classify/outcome'
import { isSummaryTrip } from '@/core/classify/summaryTrip'
import {
  aggregate,
  dowName,
  entryHour,
  fmtMoney,
  fmtMoneyAbs,
  fmtPct,
  floatBucket,
  FLOAT_BUCKET_LABEL,
  groupBy,
  type FloatBucket,
} from './helpers'

// ── 1. SENTIMENT EDGE ────────────────────────────────────────────────────
// Requires 5+ trades on at least 2 distinct sentiment levels (looking at
// the trade's day's sentiment, not the trade itself). Compares win rate
// + net P&L on hot-market days (sentiment 4-5) vs cold-market days (1-2).
// Post-flip polarity (schema 29): 5 = best/hottest, 1 = worst/coldest.

export function runSentimentEdge(input: InsightInput): InsightResult | null {
  const { trades, sentimentByDate } = input
  const hot: TradeListRow[] = []
  const cold: TradeListRow[] = []
  for (const t of trades) {
    const s = sentimentByDate.get(t.date)
    if (s == null) continue
    if (s >= 4) hot.push(t)
    else if (s <= 2) cold.push(t)
  }
  if (hot.length < 5 || cold.length < 5) return null

  const hotAgg = aggregate(hot)
  const coldAgg = aggregate(cold)
  const hotWR = hotAgg.win_rate ?? 0
  const coldWR = coldAgg.win_rate ?? 0

  // Tone: negative when cold days are materially worse (the actionable
  // case). Positive when hot edge is huge and cold is still net positive.
  // Neutral otherwise.
  const wrGap = hotWR - coldWR
  const pnlGap = hotAgg.net_pnl - coldAgg.net_pnl
  const tone =
    coldAgg.net_pnl < 0 && hotAgg.net_pnl > 0
      ? 'negative'
      : wrGap > 0.10 || pnlGap > 500
        ? 'positive'
        : 'neutral'

  const action =
    coldAgg.net_pnl < 0
      ? ' Consider sizing down on cold market days.'
      : wrGap < 0
        ? ' Your edge is stronger on cold days — counter-intuitive, dig in.'
        : ''

  return {
    id: 'sentiment-edge',
    n: hot.length + cold.length,
    rule: 'sentiment-edge',
    tone,
    title: 'Sentiment edge',
    body:
      `Win rate ${fmtPct(hotWR)} on hot-market days (sentiment 4–5) vs ${fmtPct(coldWR)} on cold days (1–2). ` +
      `Net ${fmtMoney(hotAgg.net_pnl)} hot vs ${fmtMoney(coldAgg.net_pnl)} cold.${action}`,
    metric: fmtPct(wrGap, 0).replace('-', '−'),
    priority: Math.abs(pnlGap) + Math.min(hot.length, cold.length) * 10,
  }
}

// ── 2. CATALYST STRENGTH ─────────────────────────────────────────────────
// Top 1-2 catalysts by composite (win rate × ln(trade_count)) with positive
// net P&L. Requires 3+ trades per catalyst type to qualify.

export function runCatalystStrength(input: InsightInput): InsightResult[] {
  const buckets = groupBy(input.trades, (t) => t.catalyst_type)
  type Row = { catalyst: string; trades: TradeListRow[]; agg: ReturnType<typeof aggregate> }
  const rows: Row[] = []
  for (const [catalyst, group] of buckets) {
    if (group.length < 3) continue
    const agg = aggregate(group)
    if (agg.net_pnl <= 0) continue
    rows.push({ catalyst, trades: group, agg })
  }
  if (rows.length === 0) return []

  // Sort by win rate × log-trade-count so high-rate / high-volume floats up,
  // but a 100% on 3 trades doesn't outrank a 65% on 30 trades.
  rows.sort((a, b) => {
    const sa = (a.agg.win_rate ?? 0) * Math.log(a.agg.trade_count + 1)
    const sb = (b.agg.win_rate ?? 0) * Math.log(b.agg.trade_count + 1)
    return sb - sa
  })
  const top = rows.slice(0, 2)

  // One card combining the top 1 OR 2 — keeps the surface area tight.
  const lines = top.map((r) =>
    `${r.catalyst} (${r.agg.trade_count}t, ${fmtPct(r.agg.win_rate ?? 0)} win` +
    (r.agg.avg_winner != null ? `, avg winner ${fmtMoneyAbs(r.agg.avg_winner)}` : '') +
    ')',
  )
  const lead = top[0]
  return [{
    id: 'catalyst-strength',
    n: top.reduce((s, r) => s + r.agg.trade_count, 0),
    rule: 'catalyst-strength',
    tone: 'positive',
    title: 'Your strongest catalysts',
    body: lines.length === 1
      ? `${lines[0]} is your highest-edge setup. Lean into more of these.`
      : `${lines[0]} leads, with ${lines[1]} close behind. Both are positive-P&L edges worth pressing.`,
    metric: fmtMoney(lead.agg.net_pnl),
    priority: lead.agg.net_pnl + lead.agg.trade_count * 20,
  }]
}

// ── 3. CATALYST WEAKNESS ─────────────────────────────────────────────────
// Catalyst types with 3+ trades AND negative net P&L. Emits one card per
// weak catalyst so the trader sees every problem area distinctly.

export function runCatalystWeakness(input: InsightInput): InsightResult[] {
  const buckets = groupBy(input.trades, (t) => t.catalyst_type)
  const out: InsightResult[] = []
  for (const [catalyst, group] of buckets) {
    if (group.length < 3) continue
    const agg = aggregate(group)
    if (agg.net_pnl >= 0) continue
    out.push({
      id: `catalyst-weakness:${catalyst}`,
      n: agg.trade_count,
      rule: 'catalyst-weakness',
      tone: 'negative',
      title: `Weak catalyst: ${catalyst}`,
      body:
        `${agg.trade_count} ${catalyst} trades, ${fmtPct(agg.win_rate ?? 0)} win rate, ` +
        `net ${fmtMoney(agg.net_pnl)}. Consider avoiding or building tighter rules around this setup.`,
      metric: fmtMoney(agg.net_pnl),
      priority: Math.abs(agg.net_pnl) + agg.trade_count * 20,
    })
  }
  return out
}

// ── 4. CONFIDENCE CORRELATION ────────────────────────────────────────────
// Compare 4-5 dot trades vs 1-2 dot trades. Need 5+ in each group.

export function runConfidenceCorrelation(input: InsightInput): InsightResult | null {
  const high: TradeListRow[] = []
  const low: TradeListRow[] = []
  for (const t of input.trades) {
    if (t.confidence == null) continue
    if (t.confidence >= 4) high.push(t)
    else if (t.confidence <= 2) low.push(t)
  }
  if (high.length < 5 || low.length < 5) return null

  const hi = aggregate(high)
  const lo = aggregate(low)
  const hiWR = hi.win_rate ?? 0
  const loWR = lo.win_rate ?? 0

  // Inverse case — low-confidence outperforms. Flag as negative because
  // the trader's read is miscalibrated, which is actionable.
  if (loWR > hiWR + 0.05) {
    return {
      id: 'confidence-correlation',
      rule: 'confidence-correlation',
      tone: 'negative',
      n: high.length + low.length,
      title: 'Your gut may be miscalibrated',
      body:
        `Low-confidence trades (1–2 dots) win ${fmtPct(loWR)} vs ${fmtPct(hiWR)} on high-confidence picks. ` +
        `Your "best ideas" are underperforming — review what's different about the low-conviction setups.`,
      metric: `${fmtPct(loWR - hiWR)} gap`,
      priority: Math.abs(loWR - hiWR) * 1000 + Math.min(high.length, low.length) * 5,
    }
  }

  // Standard case — high confidence wins more (the validation case).
  return {
    id: 'confidence-correlation',
    rule: 'confidence-correlation',
    tone: 'positive',
    n: high.length + low.length,
    title: 'Trust your gut',
    body:
      `High-confidence trades (4–5 dots) win ${fmtPct(hiWR)} vs ${fmtPct(loWR)} on low-confidence ones. ` +
      `When you're not sure, sit out — the data backs it.`,
    metric: `${fmtPct(hiWR - loWR)} gap`,
    priority: (hiWR - loWR) * 1000 + Math.min(high.length, low.length) * 5,
  }
}

// ── 5. EMA9 DISTANCE / CHASING ───────────────────────────────────────────
// Compare extended entries (|distance| > 5%) vs clean entries (≤5%). Needs
// 5+ trades with EMA9 data (entry_ema9_distance_pct set).

export function runEma9Chasing(input: InsightInput): InsightResult | null {
  const extended: TradeListRow[] = []
  const clean: TradeListRow[] = []
  for (const t of input.trades) {
    const d = t.entry_ema9_distance_pct
    if (d == null) continue
    if (Math.abs(d) > 5) extended.push(t)
    else clean.push(t)
  }
  if (extended.length + clean.length < 5) return null
  if (extended.length === 0 || clean.length === 0) return null

  const ext = aggregate(extended)
  const cln = aggregate(clean)
  const extWR = ext.win_rate ?? 0
  const clnWR = cln.win_rate ?? 0
  const wrGap = clnWR - extWR

  // Only emit when there's a meaningful penalty for chasing (≥10pt gap)
  // OR when extended entries are net negative.
  if (wrGap < 0.1 && ext.net_pnl >= 0) return null

  const avgLossOnChase = ext.avg_loser != null ? fmtMoneyAbs(ext.avg_loser) : null
  return {
    id: 'ema9-chasing',
    n: extended.length + clean.length,
    rule: 'ema9-chasing',
    tone: 'negative',
    title: 'Stop chasing extended moves',
    body:
      `Entries >5% from EMA9 win ${fmtPct(extWR)} vs ${fmtPct(clnWR)} on clean entries.` +
      (avgLossOnChase ? ` Avg loss when chasing: ${avgLossOnChase}.` : '') +
      ' Wait for the pullback.',
    metric: `${fmtPct(wrGap)} drop`,
    priority: Math.abs(ext.net_pnl) + extended.length * 8,
  }
}

// ── 6. PLAYBOOK PERFORMANCE ──────────────────────────────────────────────
// Requires 5+ trades on at least 2 distinct playbooks. Surfaces best AND
// worst playbook in a single card.

export function runPlaybookPerformance(input: InsightInput): InsightResult | null {
  const buckets = groupBy(input.trades, (t) => t.playbook_name)
  type Row = { name: string; agg: ReturnType<typeof aggregate> }
  const rows: Row[] = []
  for (const [name, group] of buckets) {
    if (group.length < 5) continue
    rows.push({ name, agg: aggregate(group) })
  }
  if (rows.length < 2) return null

  rows.sort((a, b) => b.agg.net_pnl - a.agg.net_pnl)
  const best = rows[0]
  const worst = rows[rows.length - 1]
  // Only flag worst if it's actually weak (negative or notably below best).
  const showWorst = worst.agg.net_pnl < 0 || worst.agg.net_pnl < best.agg.net_pnl * 0.3

  const bestLine =
    `Best: ${best.name} — ${best.agg.trade_count}t, ${fmtPct(best.agg.win_rate ?? 0)} win, ${fmtMoney(best.agg.net_pnl)}.`
  const worstLine = showWorst
    ? ` Weakest: ${worst.name} — ${worst.agg.trade_count}t, ${fmtPct(worst.agg.win_rate ?? 0)} win, ${fmtMoney(worst.agg.net_pnl)}. Worth a review or removal.`
    : ''

  return {
    id: 'playbook-performance',
    n: best.agg.trade_count + worst.agg.trade_count,
    rule: 'playbook-performance',
    tone: best.agg.net_pnl > 0 ? 'positive' : 'neutral',
    title: 'Playbook ranking',
    body: bestLine + worstLine,
    metric: fmtMoney(best.agg.net_pnl),
    priority: best.agg.net_pnl + rows.length * 10,
  }
}

// ── 7. TIME OF DAY ───────────────────────────────────────────────────────
// Bucket trades by entry hour. Needs 5+ trades in at least 2 hours.
// Highlights whether the trader is profitable in the open (<10:00) and
// what happens after 11:00.

export function runTimeOfDay(input: InsightInput): InsightResult | null {
  // Phase 3 — exclude summary trips (fake 09:30 anchor) so the "best hour"
  // insight can't fabricate a 9:30 peak. Keyed on source_format, NOT the 0s-hold.
  const trades = input.trades.filter((t) => !isSummaryTrip(t))
  const byHour = new Map<number, TradeListRow[]>()
  for (const t of trades) {
    const h = entryHour(t)
    if (h == null) continue
    const arr = byHour.get(h)
    if (arr) arr.push(t)
    else byHour.set(h, [t])
  }
  const populatedHours = Array.from(byHour.entries()).filter(([, g]) => g.length >= 5)
  if (populatedHours.length < 2) return null

  let openPnl = 0
  let totalPnl = 0
  const after11: TradeListRow[] = []
  for (const t of trades) {
    const h = entryHour(t)
    if (h == null) continue
    totalPnl += t.net_pnl
    if (h < 10) openPnl += t.net_pnl
    if (h >= 11) after11.push(t)
  }
  if (totalPnl === 0) return null
  const openShare = openPnl / totalPnl
  const after11Agg = after11.length >= 5 ? aggregate(after11) : null
  const after11Note = after11Agg
    ? ` After 11:00 your win rate drops to ${fmtPct(after11Agg.win_rate ?? 0)}.`
    : ''

  // Only meaningful if the open is a material share of total P&L.
  if (Math.abs(openShare) < 0.3 && !after11Note) return null

  const tone = openShare > 0.5 ? 'positive' : openShare < 0 ? 'negative' : 'neutral'
  return {
    id: 'time-of-day',
    n: Array.from(byHour.values()).reduce((s, g) => s + g.length, 0),
    rule: 'time-of-day',
    tone,
    title: 'Where your day-money comes from',
    body:
      `${fmtPct(openShare)} of your net P&L lands before 10:00.${after11Note} ` +
      `Consider shrinking size — or stopping — once you're past the prime window.`,
    metric: fmtPct(openShare),
    priority: Math.abs(totalPnl) * 0.5 + populatedHours.length * 10,
  }
}

// ── 8. MISTAKE PATTERN ───────────────────────────────────────────────────
// Most expensive recurring mistake. Requires 3+ trades tagged with the
// same label.

export function runMistakePattern(input: InsightInput): InsightResult | null {
  const byMistake = new Map<string, TradeListRow[]>()
  for (const t of input.trades) {
    for (const m of t.mistakes) {
      const arr = byMistake.get(m)
      if (arr) arr.push(t)
      else byMistake.set(m, [t])
    }
  }
  // Find the label with the worst total net P&L (and ≥3 trades).
  let worst: { label: string; agg: ReturnType<typeof aggregate> } | null = null
  for (const [label, group] of byMistake) {
    if (group.length < 3) continue
    const agg = aggregate(group)
    if (!worst || agg.net_pnl < worst.agg.net_pnl) {
      worst = { label, agg }
    }
  }
  if (!worst || worst.agg.net_pnl >= 0) return null

  return {
    id: `mistake-pattern:${worst.label}`,
    n: worst.agg.trade_count,
    rule: 'mistake-pattern',
    tone: 'negative',
    title: `Recurring mistake: ${worst.label}`,
    body:
      `Tagged on ${worst.agg.trade_count} trades, costing you net ${fmtMoney(worst.agg.net_pnl)}. ` +
      `This is your most expensive pattern — write a rule that prevents it.`,
    metric: fmtMoney(worst.agg.net_pnl),
    priority: Math.abs(worst.agg.net_pnl) + worst.agg.trade_count * 25,
  }
}

// ── 9. FLOAT SWEET SPOT ──────────────────────────────────────────────────
// Best / worst float bucket. Requires 3+ trades in at least 2 buckets.
//
// DISABLED for v0.2.0 — bucketing reads share_class_shares_outstanding,
// not true free float, so the analytic claim was misleading. Function
// retained for v0.3.0 re-wire with point-in-time float (registration in
// src/core/insights/index.ts is commented out, not deleted).

export function runFloatSweetSpot(input: InsightInput): InsightResult | null {
  const buckets = groupBy(input.trades, (t) => floatBucket(t.float_shares))
  // Drop 'unset' from consideration — no signal in untagged trades.
  buckets.delete('unset' as FloatBucket)

  type Row = { key: FloatBucket; agg: ReturnType<typeof aggregate> }
  const rows: Row[] = []
  for (const [key, group] of buckets) {
    if (group.length < 3) continue
    rows.push({ key, agg: aggregate(group) })
  }
  if (rows.length < 2) return null

  rows.sort((a, b) => b.agg.net_pnl - a.agg.net_pnl)
  const best = rows[0]
  const worst = rows[rows.length - 1]

  const bestLabel = FLOAT_BUCKET_LABEL[best.key]
  const worstLabel = FLOAT_BUCKET_LABEL[worst.key]
  const showWorst = worst.agg.net_pnl < 0
  const tone: InsightResult['tone'] = best.agg.net_pnl > 0 ? 'positive' : 'neutral'

  return {
    id: 'float-sweet-spot',
    n: best.agg.trade_count + worst.agg.trade_count,
    rule: 'float-sweet-spot',
    tone,
    title: 'Float sweet spot',
    body:
      `Best range: ${bestLabel} — ${best.agg.trade_count}t, ${fmtPct(best.agg.win_rate ?? 0)} win, ${fmtMoney(best.agg.net_pnl)}.` +
      (showWorst
        ? ` You underperform on ${worstLabel} (${fmtMoney(worst.agg.net_pnl)}) — consider focusing on the smaller-float range.`
        : ''),
    metric: fmtMoney(best.agg.net_pnl),
    priority: best.agg.net_pnl + rows.length * 8,
  }
}

// ── 10a. SYMBOL EXTREMES ─────────────────────────────────────────────────
// Best / worst ticker by net P&L. Requires 3+ trades on the ticker.
// Emits up to 2 cards — one for the standout winner, one for the standout
// bleeder — so the user can lean into the first and study the second.

export function runSymbolExtremes(input: InsightInput): InsightResult[] {
  const buckets = groupBy(input.trades, (t) => t.symbol)
  type Row = { symbol: string; agg: ReturnType<typeof aggregate> }
  const rows: Row[] = []
  for (const [symbol, group] of buckets) {
    if (group.length < 3) continue
    rows.push({ symbol, agg: aggregate(group) })
  }
  if (rows.length === 0) return []
  rows.sort((a, b) => b.agg.net_pnl - a.agg.net_pnl)
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const out: InsightResult[] = []
  if (best.agg.net_pnl > 100) {
    out.push({
      id: `symbol-best:${best.symbol}`,
      n: best.agg.trade_count,
      rule: 'symbol-best',
      tone: 'positive',
      title: `${best.symbol} is your top symbol`,
      body:
        `${fmtMoney(best.agg.net_pnl)} over ${best.agg.trade_count} round trips ` +
        `(${fmtPct(best.agg.win_rate ?? 0)} win). Track what makes this ticker work — ` +
        `sector, time of day, your familiarity.`,
      metric: fmtMoney(best.agg.net_pnl),
      priority: Math.abs(best.agg.net_pnl) + best.agg.trade_count * 10,
    })
  }
  if (worst !== best && worst.agg.net_pnl < -100) {
    out.push({
      id: `symbol-worst:${worst.symbol}`,
      n: worst.agg.trade_count,
      rule: 'symbol-worst',
      tone: 'negative',
      title: `${worst.symbol} keeps costing you`,
      body:
        `${fmtMoney(worst.agg.net_pnl)} over ${worst.agg.trade_count} round trips. ` +
        `Avoid or study before re-engaging — what works elsewhere isn't working here.`,
      metric: fmtMoney(worst.agg.net_pnl),
      priority: Math.abs(worst.agg.net_pnl) + worst.agg.trade_count * 10,
    })
  }
  return out
}

// ── 10b. DAY OF WEEK ─────────────────────────────────────────────────────
// Best / worst weekday by net P&L. Requires 5+ trades on each day. dowName (the
// weekday formatter) now lives in ./helpers — shared with the KPI strip.

export function runDayOfWeek(input: InsightInput): InsightResult | null {
  const buckets = groupBy(input.trades, (t) => dowName(t.date))
  type Row = { day: string; agg: ReturnType<typeof aggregate> }
  const rows: Row[] = []
  for (const [day, group] of buckets) {
    if (group.length < 5) continue
    rows.push({ day, agg: aggregate(group) })
  }
  if (rows.length < 2) return null
  rows.sort((a, b) => b.agg.net_pnl - a.agg.net_pnl)
  const best = rows[0]
  const worst = rows[rows.length - 1]
  const gap = best.agg.net_pnl - worst.agg.net_pnl
  if (gap < 150) return null
  const tone: InsightResult['tone'] = worst.agg.net_pnl < 0 ? 'negative' : 'positive'
  const action =
    worst.agg.net_pnl < 0
      ? ` ${worst.day}s lose ${fmtMoney(worst.agg.net_pnl)} — check what's different about your prep that day.`
      : ''
  return {
    id: 'day-of-week',
    n: best.agg.trade_count + worst.agg.trade_count,
    rule: 'day-of-week',
    tone,
    title: `${best.day}s are your strongest day`,
    body:
      `${fmtMoney(best.agg.net_pnl)} net, ${fmtPct(best.agg.win_rate ?? 0)} win rate ` +
      `over ${best.agg.trade_count} trades.${action}`,
    metric: fmtMoney(best.agg.net_pnl),
    priority: gap + rows.length * 10,
  }
}

// ── 10c. EXPECTANCY ──────────────────────────────────────────────────────
// Average R-multiple across all trades with a planned risk set. Positive
// means the math is in your favor; negative means tighten stops or skip.

export function runExpectancy(input: InsightInput): InsightResult | null {
  const withR = input.trades.filter(
    (t): t is TradeListRow & { r_multiple: number } => t.r_multiple !== null,
  )
  if (withR.length < 5) return null
  const sum = withR.reduce((s, t) => s + t.r_multiple, 0)
  const avgR = sum / withR.length
  if (Math.abs(avgR) < 0.1) return null
  if (avgR > 0) {
    return {
      id: 'expectancy-positive',
      n: withR.length,
      rule: 'expectancy-positive',
      tone: 'positive',
      title: 'Positive expectancy',
      body:
        `+${avgR.toFixed(2)}R per trade across ${withR.length} risked trades. ` +
        `The math is in your favor — scale carefully, bigger size on the same edge means bigger drawdowns.`,
      metric: `+${avgR.toFixed(2)}R`,
      priority: 200 + Math.min(450, avgR * 250),
    }
  }
  return {
    id: 'expectancy-negative',
    n: withR.length,
    rule: 'expectancy-negative',
    tone: 'negative',
    title: 'Negative expectancy',
    body:
      `${avgR.toFixed(2)}R per trade across ${withR.length} risked trades. ` +
      `Until that flips positive, size has to come down. Focus on cutting losses faster.`,
    metric: `${avgR.toFixed(2)}R`,
    priority: 250 + Math.min(450, Math.abs(avgR) * 250),
  }
}

// ── 10d. REWARD / RISK RATIO ─────────────────────────────────────────────
// Average winner ÷ average loser. <0.8× means losers are bigger than winners
// (work on cutting losses); ≥1.5× is a healthy profile worth highlighting.

export function runRewardRiskRatio(input: InsightInput): InsightResult | null {
  const winners = input.trades.filter((t) => isWin(t.net_pnl))
  const losers = input.trades.filter((t) => isLoss(t.net_pnl))
  if (winners.length < 5 || losers.length < 5) return null
  const avgWin = winners.reduce((s, t) => s + t.net_pnl, 0) / winners.length
  const avgLossAbs =
    losers.reduce((s, t) => s + Math.abs(t.net_pnl), 0) / losers.length
  if (avgLossAbs === 0) return null
  const ratio = avgWin / avgLossAbs
  if (ratio >= 1.5) {
    return {
      id: 'rr-healthy',
      n: winners.length + losers.length,
      rule: 'rr-healthy',
      tone: 'positive',
      title: 'Healthy reward-to-risk',
      body:
        `Average winner is ${ratio.toFixed(1)}× your average loser. ` +
        `Even a 40% win rate keeps you ahead at this ratio.`,
      metric: `${ratio.toFixed(2)}×`,
      priority: 200,
    }
  }
  if (ratio < 0.8) {
    return {
      id: 'rr-inverted',
      n: winners.length + losers.length,
      rule: 'rr-inverted',
      tone: 'negative',
      title: 'Losers are bigger than winners',
      body:
        `Avg winner ${fmtMoney(avgWin)} vs avg loser −${fmtMoney(avgLossAbs).replace('+', '')}. ` +
        `At ${ratio.toFixed(2)}× you need to win >55% just to break even. ` +
        `Tighten the stop or let winners run further.`,
      metric: `${ratio.toFixed(2)}×`,
      priority: 320,
    }
  }
  return null
}

// ── 10e. HOLD TIME — WINNERS vs LOSERS ───────────────────────────────────
// If you hold losers materially longer than winners, you're cutting winners
// early and hoping on losers — the canonical "bad-trader" pattern.

function holdSeconds(t: TradeListRow): number | null {
  if (!t.close_time || t.is_open) return null
  const open = Date.parse(t.open_time)
  const close = Date.parse(t.close_time)
  if (!Number.isFinite(open) || !Number.isFinite(close)) return null
  const s = (close - open) / 1000
  return s > 0 ? s : null
}

function fmtSec(s: number): string {
  if (s < 60) return `${s.toFixed(0)}s`
  if (s < 3600) return `${(s / 60).toFixed(1)}m`
  return `${(s / 3600).toFixed(1)}h`
}

export function runHoldTimeFlipped(input: InsightInput): InsightResult | null {
  const winners: number[] = []
  const losers: number[] = []
  for (const t of input.trades) {
    const s = holdSeconds(t)
    if (s == null) continue
    if (isWin(t.net_pnl)) winners.push(s)
    else if (isLoss(t.net_pnl)) losers.push(s)
  }
  if (winners.length < 5 || losers.length < 5) return null
  const avgWin = winners.reduce((a, b) => a + b, 0) / winners.length
  const avgLose = losers.reduce((a, b) => a + b, 0) / losers.length
  if (avgLose <= avgWin * 1.2) return null
  return {
    id: 'hold-time-flipped',
    n: winners.length + losers.length,
    rule: 'hold-time-flipped',
    tone: 'negative',
    title: 'You hold losers longer than winners',
    body:
      `Average winner ${fmtSec(avgWin)} vs average loser ${fmtSec(avgLose)} ` +
      `(${(avgLose / avgWin).toFixed(1)}× longer). Cut losers as soon as the thesis breaks; ` +
      `let winners breathe past your initial target.`,
    metric: `${(avgLose / avgWin).toFixed(1)}×`,
    priority: 280 + (avgLose / avgWin) * 30,
  }
}

// ── 10f. REVENGE TRADING ─────────────────────────────────────────────────
// Pair adjacent same-day trades. If the trade after a loss loses materially
// more often than the trade after a win, the trader is chasing the red.

export function runRevengeTrading(input: InsightInput): InsightResult | null {
  const byDate = new Map<string, TradeListRow[]>()
  for (const t of input.trades) {
    const arr = byDate.get(t.date)
    if (arr) arr.push(t)
    else byDate.set(t.date, [t])
  }
  let pairsAfterLoss = 0
  let lossesAfterLoss = 0
  let pairsAfterWin = 0
  let lossesAfterWin = 0
  for (const [, arr] of byDate) {
    arr.sort((a, b) => (a.open_time < b.open_time ? -1 : 1))
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1]
      const curr = arr[i]
      if (isLoss(prev.net_pnl)) {
        pairsAfterLoss++
        if (isLoss(curr.net_pnl)) lossesAfterLoss++
      } else if (isWin(prev.net_pnl)) {
        pairsAfterWin++
        if (isLoss(curr.net_pnl)) lossesAfterWin++
      }
    }
  }
  if (pairsAfterLoss < 10 || pairsAfterWin < 5) return null
  const rateAfterLoss = lossesAfterLoss / pairsAfterLoss
  const rateAfterWin = lossesAfterWin / pairsAfterWin
  const gap = rateAfterLoss - rateAfterWin
  if (gap < 0.15) return null
  return {
    id: 'revenge-trading',
    n: pairsAfterLoss + pairsAfterWin,
    rule: 'revenge-trading',
    tone: 'negative',
    title: 'Revenge trading detected',
    body:
      `${fmtPct(rateAfterLoss)} of trades after a loss are also losses — ` +
      `vs ${fmtPct(rateAfterWin)} after a win. A forced break after every red trade ` +
      `could erase most of this gap.`,
    metric: `+${fmtPct(gap)}`,
    priority: 350 + gap * 700,
  }
}

// ── 10g. MISTAKE % OF LOSERS ─────────────────────────────────────────────
// For each mistake label, what percentage of LOSING trades carry that flag?
// Different from runMistakePattern (most expensive label) — this one finds
// the mistake that infects the most losses, which the user can drop wholesale.

export function runMistakeInLosers(input: InsightInput): InsightResult[] {
  const losers = input.trades.filter((t) => isLoss(t.net_pnl))
  if (losers.length < 10) return []
  const total = losers.length
  const counts = new Map<string, number>()
  for (const t of losers) {
    for (const m of t.mistakes) counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  const out: InsightResult[] = []
  for (const [name, c] of counts) {
    if (c < 3) continue
    const rate = c / total
    if (rate < 0.25) continue
    out.push({
      id: `mistake-in-losers:${name}`,
      n: total,
      rule: 'mistake-in-losers',
      tone: 'negative',
      title: `"${name}" shows up in ${fmtPct(rate)} of your losers`,
      body:
        `${c} of ${total} losing trades carry this flag. ` +
        `Eliminating just this one mistake clears most of your damage.`,
      metric: fmtPct(rate),
      priority: 200 + rate * 400 + Math.log(c + 1) * 30,
    })
  }
  return out
}

// ── 10h. FIRST 30 MINUTES ────────────────────────────────────────────────
// 9:30-10:00 ET is the prime momentum window. If you bleed in it, you're
// either jumping at noise or trading without confirmation.

function parseHourMinute(timestamp: string): { hour: number; minute: number } | null {
  // `timestamp` is true UTC (Day 8.5 Commit B) — convert to Eastern so the
  // 9:30–10:00 ET window check below compares like-for-like.
  const p = utcToEasternParts(timestamp)
  return p ? { hour: p.hour, minute: p.minute } : null
}

export function runFirstThirtyMinutes(input: InsightInput): InsightResult | null {
  const firstHalf: TradeListRow[] = []
  for (const t of input.trades) {
    const hm = parseHourMinute(t.open_time)
    if (!hm) continue
    const mins = hm.hour * 60 + hm.minute
    if (mins >= 9 * 60 + 30 && mins < 10 * 60) firstHalf.push(t)
  }
  if (firstHalf.length < 10) return null
  const agg = aggregate(firstHalf)
  if (agg.net_pnl > -100) return null
  return {
    id: 'first-thirty-minutes',
    n: agg.trade_count,
    rule: 'first-thirty-minutes',
    tone: 'negative',
    title: 'You bleed in the first 30 minutes',
    body:
      `${fmtMoney(agg.net_pnl)} across ${agg.trade_count} trades opened 9:30–10:00 ET ` +
      `(${fmtPct(agg.win_rate ?? 0)} win rate). Either wait for confirmation or sit out the open entirely.`,
    metric: fmtMoney(agg.net_pnl),
    priority: 250 + Math.abs(agg.net_pnl),
  }
}

// ── 10. DISCIPLINE STREAK MILESTONE ──────────────────────────────────────
// Only shown when current streak >= 3 days. Encouragement, not an edge.

export function runDisciplineStreakMilestone(input: InsightInput): InsightResult | null {
  const streak = input.disciplineStreak
  if (streak < 3) return null

  const tone: InsightResult['tone'] = streak >= 10 ? 'positive' : 'neutral'
  return {
    id: 'discipline-streak',
    n: 0,
    rule: 'discipline-streak',
    tone,
    title: streak >= 10 ? 'Discipline streak — fire' : 'Discipline streak',
    body:
      `${streak}-day streak of trading or journaling. Consistency is the compounding asset — ` +
      `don't break the chain.`,
    metric: `${streak}d`,
    // Lower base priority — this is a "keep doing this" reminder, not an
    // edge insight. Streak length boosts it modestly.
    priority: 50 + streak * 5,
  }
}

// ── 11. REGION WEAKNESS ──────────────────────────────────────────────────
// Fires when a region (excluding Unknown) has ≥REGION_MIN_TRADES trades and
// its win rate is ≥REGION_WIN_RATE_GAP percentage points BELOW the trader's
// overall win rate. Emits the WORST qualifying region as a single card.
//
// NOTE: 'overall' includes Unknown-region trades (they reflect real trading
// performance, even if unclassified). Only the per-region buckets exclude
// Unknown — the gap is "this classified region vs your full book."

export const REGION_MIN_TRADES = 10
export const REGION_WIN_RATE_GAP = 0.15

interface RegionStats {
  region: string
  trades: number
  winRate: number
}

function buildRegionStats(input: InsightInput): { overall: number | null; rows: RegionStats[] } {
  const overall = aggregate(input.trades)
  const groups = groupBy(input.trades, (t) => t.region === 'Unknown' ? null : t.region)
  const rows: RegionStats[] = []
  for (const [region, group] of groups) {
    if (group.length < REGION_MIN_TRADES) continue
    const agg = aggregate(group)
    if (agg.win_rate == null) continue
    rows.push({ region, trades: group.length, winRate: agg.win_rate })
  }
  return { overall: overall.win_rate, rows }
}

export function runRegionWeakness(input: InsightInput): InsightResult | null {
  const { overall, rows } = buildRegionStats(input)
  if (overall == null || rows.length === 0) return null
  const weak = rows
    .filter((r) => overall - r.winRate >= REGION_WIN_RATE_GAP)
    .sort((a, b) => a.winRate - b.winRate)[0]
  if (!weak) return null
  const title = `${weak.region} region weakness`
  const body =
    `Your win rate on ${weak.region} trades is ${fmtPct(weak.winRate)} vs ${fmtPct(overall)} overall ` +
    `(${weak.trades} trades). Consider tightening size or skipping this region.`
  return {
    id: `region-weakness:${weak.region}`,
    n: weak.trades,
    rule: 'region-weakness',
    tone: 'negative',
    title,
    body,
    metric: `${fmtPct(overall - weak.winRate)} gap`,
    priority: 220 + (overall - weak.winRate) * 1000 + Math.log(weak.trades + 1) * 30,
  }
}

// ── 12. REGION STRENGTH ──────────────────────────────────────────────────
// Mirror of rule 11 — best region whose win rate exceeds overall by ≥15pts.

export function runRegionStrength(input: InsightInput): InsightResult | null {
  const { overall, rows } = buildRegionStats(input)
  if (overall == null || rows.length === 0) return null
  const strong = rows
    .filter((r) => r.winRate - overall >= REGION_WIN_RATE_GAP)
    .sort((a, b) => b.winRate - a.winRate)[0]
  if (!strong) return null
  const title = `${strong.region} region edge`
  const body =
    `Your win rate on ${strong.region} trades is ${fmtPct(strong.winRate)} vs ${fmtPct(overall)} overall ` +
    `(${strong.trades} trades). You have edge here — consider sizing up.`
  return {
    id: `region-strength:${strong.region}`,
    n: strong.trades,
    rule: 'region-strength',
    tone: 'positive',
    title,
    body,
    metric: `+${fmtPct(strong.winRate - overall)}`,
    priority: 180 + (strong.winRate - overall) * 1000 + Math.log(strong.trades + 1) * 30,
  }
}
