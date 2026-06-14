import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { computeEdgeScore, type EdgeScoreResult } from '@/core/score/edgeScore'
import { todayDateISO } from '@/core/session/today'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

// useEdgeScore — fetches trades-with-technicals over the same trailing-90-day
// window as the insight feed and runs the pure Edge Score engine. It owns its
// OWN fetch (ipc.listTradesWithTechnicals) because useInsights does not pull
// technicals, and the Discipline axis needs the per-trade snapshot. The pure
// engine sees plain data and returns a plain result, per ARCHITECTURE.md.
export interface UseEdgeScoreResult {
  result: EdgeScoreResult | null
  loading: boolean
  error: string | null
}

export function useEdgeScore(): UseEdgeScoreResult {
  const [rows, setRows] = useState<TradeWithTechnicalsRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    const to = todayDateISO(now)
    const fromD = new Date(now)
    fromD.setDate(fromD.getDate() - 89) // 90 days inclusive — matches filterLastNDays(…, 90)
    const from = todayDateISO(fromD)
    ipc
      .listTradesWithTechnicals({ from, to })
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const result = useMemo(() => (rows ? computeEdgeScore(rows) : null), [rows])
  return { result, loading: rows === null && error === null, error }
}
