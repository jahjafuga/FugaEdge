import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { computeEdgeScore, type EdgeScoreResult } from '@/core/score/edgeScore'
import { todayDateISO } from '@/core/session/today'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'

// v0.2.5 EdgeIQ daily-debrief — the TODAY-scoped Edge Score. A focused sibling
// of useEdgeScore: instead of a selectable range it pins the window to a single
// day (from = to = today's local ISO date) and runs the SAME pure engine
// (computeEdgeScore) over today's trades-with-technicals — no new IPC, the exact
// existing fetch path. Because the window never changes there's no range↔rows
// desync to guard (unlike useEdgeScore's range-tagged rows), so this stays
// deliberately simpler.
//
// It reports today HONESTLY and unconditionally: computeEdgeScore already flags
// `suppressed` at < 5 trades and `provisional` at 5–19 (edgeScore.ts), and a
// single day almost always lands in those bands. The hybrid "show today, else
// fall back to the recent window" decision belongs to the CARD (Commit 2); this
// hook only yields today's result.
export interface UseTodayEdgeScoreResult {
  result: EdgeScoreResult | null
  loading: boolean
  error: string | null
}

export function useTodayEdgeScore(): UseTodayEdgeScoreResult {
  const [rows, setRows] = useState<TradeWithTechnicalsRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    const today = todayDateISO(new Date())
    ipc
      .listTradesWithTechnicals({ from: today, to: today })
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
