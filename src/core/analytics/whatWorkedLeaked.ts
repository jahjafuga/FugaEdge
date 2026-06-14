// v0.2.5 Edge Intelligence Beat 4 — the session/week "What worked / What leaked"
// summary. A PURE DESCRIPTIVE selector over the existing WeekMetrics/DayMetrics
// breakdowns (src/core/analytics/{week,day}.ts) — NOT the n-gated pattern rules,
// which return ~nothing over a session/week (too few trades for their sample
// floors). It SUMMARIZES the range (best/worst symbol, playbook, day, the
// biggest win / worst loss, top mistake tags); it draws no edge/pattern
// conclusions — that's the hero cards' job, over the 90-day window.
//
// Pure (ARCHITECTURE #1): no electron/DB/React; never src/core/xp.
//
// Input is the SHARED subset of WeekMetrics & DayMetrics — both satisfy it
// structurally (the week-only fields are optional, absent on a single session).

export interface WorkedLeakedInput {
  /** Symbols traded, sorted net P&L desc (WeekMetrics/DayMetrics convention). */
  symbolBreakdown: { symbol: string; tradeCount: number; netPnl: number }[]
  /** The single biggest winning trade (sign-gated > 0), or null. */
  biggestWin: { symbol: string; pnl: number } | null
  /** The single worst losing trade (sign-gated < 0), or null. */
  worstLoss: { symbol: string; pnl: number } | null
  /** Per-trade mistake tags, sorted count desc. */
  mistakeTagCounts: { tag: string; count: number }[]
  /** Week-only: per-playbook net (absent on a single session). */
  perPlaybook?: { playbook: string; tradeCount: number; netPnl: number; winRate: number | null }[]
  /** Week-only: highest-net day (> 0) / lowest-net day (< 0). */
  bestDay?: { date: string; netPnl: number } | null
  worstDay?: { date: string; netPnl: number } | null
}

export type WorkedLeakedKind = 'symbol' | 'playbook' | 'day' | 'trade' | 'mistake'

export interface WorkedLeakedItem {
  kind: WorkedLeakedKind
  /** Symbol / playbook name / YYYY-MM-DD / mistake tag (the UI formats dates). */
  label: string
  /** Net P&L for symbol/playbook/day/trade; null for mistakes (use count). */
  netPnl: number | null
  /** Trade count (symbol/playbook) or occurrence count (mistake); else null. */
  count: number | null
}

export interface WorkedLeaked {
  worked: WorkedLeakedItem[]
  leaked: WorkedLeakedItem[]
}

const TOP_SYMBOLS = 4
const TOP_PLAYBOOKS = 3
const TOP_MISTAKES = 4

export function splitWorkedLeaked(m: WorkedLeakedInput): WorkedLeaked {
  const worked: WorkedLeakedItem[] = []
  const leaked: WorkedLeakedItem[] = []

  // Symbols — the breakdown arrives net-desc; positives lead, negatives sorted
  // most-negative-first for the leaked column.
  for (const s of m.symbolBreakdown.filter((s) => s.netPnl > 0).slice(0, TOP_SYMBOLS)) {
    worked.push({ kind: 'symbol', label: s.symbol, netPnl: s.netPnl, count: s.tradeCount })
  }
  for (const s of m.symbolBreakdown
    .filter((s) => s.netPnl < 0)
    .sort((a, b) => a.netPnl - b.netPnl)
    .slice(0, TOP_SYMBOLS)) {
    leaked.push({ kind: 'symbol', label: s.symbol, netPnl: s.netPnl, count: s.tradeCount })
  }

  // Playbooks (week only).
  if (m.perPlaybook) {
    for (const p of m.perPlaybook.filter((p) => p.netPnl > 0).slice(0, TOP_PLAYBOOKS)) {
      worked.push({ kind: 'playbook', label: p.playbook, netPnl: p.netPnl, count: p.tradeCount })
    }
    for (const p of m.perPlaybook
      .filter((p) => p.netPnl < 0)
      .sort((a, b) => a.netPnl - b.netPnl)
      .slice(0, TOP_PLAYBOOKS)) {
      leaked.push({ kind: 'playbook', label: p.playbook, netPnl: p.netPnl, count: p.tradeCount })
    }
  }

  // Best / worst day (week only; already sign-gated by computeWeekMetrics).
  if (m.bestDay) worked.push({ kind: 'day', label: m.bestDay.date, netPnl: m.bestDay.netPnl, count: null })
  if (m.worstDay) leaked.push({ kind: 'day', label: m.worstDay.date, netPnl: m.worstDay.netPnl, count: null })

  // The single biggest win / worst loss.
  if (m.biggestWin) worked.push({ kind: 'trade', label: m.biggestWin.symbol, netPnl: m.biggestWin.pnl, count: null })
  if (m.worstLoss) leaked.push({ kind: 'trade', label: m.worstLoss.symbol, netPnl: m.worstLoss.pnl, count: null })

  // Mistake tags — leaked only (a mistake is never a "worked").
  for (const t of m.mistakeTagCounts.slice(0, TOP_MISTAKES)) {
    leaked.push({ kind: 'mistake', label: t.tag, netPnl: null, count: t.count })
  }

  return { worked, leaked }
}
