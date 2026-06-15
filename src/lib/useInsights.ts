import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { filterLastNDays } from '@/core/insights/helpers'
import { runAllInsightRules } from '@/core/insights'
import type { InsightResult } from '@/core/insights'
import { computeKpiStrip, type KpiStripData } from '@/core/insights/kpiStrip'
import { rangeDays, type TimeRange } from '@shared/dashboard-types'
import type { TradeListRow } from '@shared/trades-types'

// useInsights — composes the data fetches (trades + session sentiment +
// discipline streak) and pipes them through the pure rule engine in
// /src/core/insights. The hook owns the platform-specific I/O; the rules
// see plain data and return plain results, in line with the architecture
// rules in /ARCHITECTURE.md.
//
// Recomputes whenever any of the three fetches return. The pure rule
// runner is memoized over those three inputs so toggling between tabs
// doesn't re-aggregate trades unnecessarily.

export interface UseInsightsResult {
  insights: InsightResult[]
  loading: boolean
  error: string | null
  /** True when there's no signal yet — either no trades, no tagged data,
   *  or all rules below their minimum sample size. Drives the "tag more
   *  trades" empty state. */
  empty: boolean
  /** The EdgeIQ KPI strip's six best-of tiles, computed over the SAME windowed
   *  trades as `insights` — so the strip and the hero cards always agree on the
   *  window. All-null fields until trades load / when the window is empty. */
  kpis: KpiStripData
  /** The range-windowed trades the insights + KPI strip ride. Exposed so the
   *  Intelligence page can compose the Trader-DNA card over the SAME window
   *  (computeDnaAdherence) without a second fetch. Empty until trades load. */
  windowedTrades: TradeListRow[]
}

export function useInsights(range: TimeRange = '90d'): UseInsightsResult {
  const [trades, setTrades] = useState<Awaited<ReturnType<typeof ipc.tradesList>> | null>(null)
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof ipc.sessionListAll>> | null>(null)
  const [streak, setStreak] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([
      ipc.tradesList(),
      ipc.sessionListAll(),
      ipc.dashboardGet('all').then((d) => d.discipline_streak ?? 0),
    ])
      .then(([t, s, k]) => {
        if (cancelled) return
        setTrades(t)
        setSessions(s)
        setStreak(k)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Sentiment map — derived once per sessions fetch. Null sentiment rows
  // are skipped (the rules look up by date and treat misses the same way).
  const sentimentByDate = useMemo(() => {
    const m = new Map<string, number>()
    if (!sessions) return m
    for (const s of sessions) {
      if (s.sentiment != null) m.set(s.date, s.sentiment)
    }
    return m
  }, [sessions])

  // Window trades to the selected range — rules see only the window, no
  // per-rule filtering. Client-side (all trades are fetched once), so a range
  // change re-filters INSTANTLY with no refetch. Default '90d' reproduces the
  // pre-filter behavior, keeping the no-arg Dashboard caller (EdgeInsights)
  // unchanged. 'all' (rangeDays null) skips the day-window entirely.
  const windowedTrades = useMemo(() => {
    if (!trades) return []
    const days = rangeDays(range)
    return days == null ? trades : filterLastNDays(trades, days)
  }, [trades, range])

  const insights = useMemo(() => {
    if (trades == null || sessions == null || streak == null) return []
    return runAllInsightRules({
      trades: windowedTrades,
      sentimentByDate,
      disciplineStreak: streak,
    })
  }, [trades, sessions, streak, windowedTrades, sentimentByDate])

  // KPI strip — computed over the SAME windowedTrades, so it re-windows in step
  // with the hero cards (instant client-side re-filter, no refetch) and its
  // numbers are guaranteed consistent with them. All-null when the window is empty.
  const kpis = useMemo(() => computeKpiStrip(windowedTrades), [windowedTrades])

  const loading = trades == null || sessions == null || streak == null
  const empty = !loading && insights.length === 0

  return { insights, loading, error, empty, kpis, windowedTrades }
}
