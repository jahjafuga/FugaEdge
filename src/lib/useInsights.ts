import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { filterLastNDays } from '@/core/insights/helpers'
import { runAllInsightRules } from '@/core/insights'
import type { InsightResult } from '@/core/insights'

// useInsights — composes the data fetches (trades + session sentiment +
// discipline streak) and pipes them through the pure rule engine in
// /src/core/insights. The hook owns the platform-specific I/O; the rules
// see plain data and return plain results, in line with the architecture
// rules in /ARCHITECTURE.md.
//
// Recomputes whenever any of the three fetches return. The pure rule
// runner is memoized over those three inputs so toggling between tabs
// doesn't re-aggregate trades unnecessarily.

interface UseInsightsResult {
  insights: InsightResult[]
  loading: boolean
  error: string | null
  /** True when there's no signal yet — either no trades, no tagged data,
   *  or all rules below their minimum sample size. Drives the "tag more
   *  trades" empty state. */
  empty: boolean
}

export function useInsights(): UseInsightsResult {
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

  // Filter trades to the last 90 days per spec — rules see only the
  // window, no per-rule filtering needed.
  const windowedTrades = useMemo(
    () => (trades ? filterLastNDays(trades, 90) : []),
    [trades],
  )

  const insights = useMemo(() => {
    if (trades == null || sessions == null || streak == null) return []
    return runAllInsightRules({
      trades: windowedTrades,
      sentimentByDate,
      disciplineStreak: streak,
    })
  }, [trades, sessions, streak, windowedTrades, sentimentByDate])

  const loading = trades == null || sessions == null || streak == null
  const empty = !loading && insights.length === 0

  return { insights, loading, error, empty }
}
