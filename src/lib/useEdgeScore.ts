import { useEffect, useMemo, useState } from 'react'
import { ipc } from '@/lib/ipc'
import { computeEdgeScore, type EdgeScoreResult } from '@/core/score/edgeScore'
import { todayDateISO } from '@/core/session/today'
import { rangeDays, type TimeRange } from '@shared/dashboard-types'
import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { AccountScope } from '@shared/accounts-types'

// useEdgeScore — fetches trades-with-technicals over the selected date range and
// runs the pure Edge Score engine. It owns its OWN fetch
// (ipc.listTradesWithTechnicals) because useInsights does not pull technicals,
// and the Discipline axis needs the per-trade snapshot. The pure engine sees
// plain data and returns a plain result, per ARCHITECTURE.md.
//
// Range change = a refetch (the fetch is server-windowed). The fetched rows are
// TAGGED with the (range, scope) they were fetched for and used ONLY while that
// tag matches the current pair — so during a range OR scope change the prior
// fetch's rows are ignored (the Score/radar show loading) and never render a
// stale result against the new label. Same desync class as the Session↔Week
// toggle crash, headed off here.
//
// Multi-account (Technicals slice, beat 1) — scope is an EXPLICIT OPTIONAL
// PARAM (absent -> 'all' through the seam), NOT internal useAccountScope
// consumption: EdgeIqDebriefCard calls this hook AND dayRepo, and internal
// consumption would scope its Edge Score while its day metrics stay global —
// a mixed-scope card. Callers that follow the switcher pass the scope in.
export interface UseEdgeScoreResult {
  result: EdgeScoreResult | null
  loading: boolean
  error: string | null
}

function sameScope(a: AccountScope, b: AccountScope): boolean {
  if (a === 'all' || b === 'all') return a === b
  return a.accountId === b.accountId
}

export function useEdgeScore(
  range: TimeRange,
  scope: AccountScope = 'all',
): UseEdgeScoreResult {
  const [state, setState] = useState<{
    range: TimeRange
    scope: AccountScope
    rows: TradeWithTechnicalsRow[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    const now = new Date()
    const to = todayDateISO(now)
    const days = rangeDays(range)
    let from: string
    if (days == null) {
      from = '1970-01-01' // 'all' — no lower bound
    } else {
      const fromD = new Date(now)
      fromD.setDate(fromD.getDate() - (days - 1)) // inclusive window, matches filterLastNDays
      from = todayDateISO(fromD)
    }
    ipc
      .listTradesWithTechnicals({ from, to, accountScope: scope })
      .then((r) => {
        if (!cancelled) setState({ range, scope, rows: r })
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [range, scope])

  // Use rows ONLY when they were fetched for the CURRENT (range, scope) pair;
  // during a range or scope change the prior fetch's rows are stale → treated
  // as loading (skeleton).
  const rows =
    state && state.range === range && sameScope(state.scope, scope)
      ? state.rows
      : null
  const result = useMemo(() => (rows ? computeEdgeScore(rows) : null), [rows])
  return { result, loading: rows === null && error === null, error }
}
