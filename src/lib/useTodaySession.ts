import { useCallback, useEffect, useState } from 'react'
import { ipc } from '@/lib/ipc'
import {
  countNoTradeDaysThisMonth,
  deriveTodayStatus,
  emptyMeta,
  hasJournalContent,
  todayDateISO,
  type TodaySessionStatus,
} from '@/core/session/today'
import type { SaveTodaySessionInput, SessionMeta } from '@shared/session-types'
import type { TradeListRow } from '@shared/trades-types'
import type { JournalEntry } from '@shared/journal-types'

interface UseTodaySessionResult {
  /** Pure derivation of today's status. Always defined. */
  status: TodaySessionStatus
  /** Distinct no-trade-day count inside today's calendar month. */
  noTradeDaysThisMonth: number
  loading: boolean
  error: string | null
  /** Re-fetch trades + meta (e.g. after an external mutation). */
  refresh: () => void
  /** Save sentiment + no-trade-day + reason in one round-trip. */
  save: (input: SaveTodaySessionInput) => Promise<void>
}

// Composes the IPC fetches (trades + all sessions for the month count)
// and feeds them into the pure /src/core/session/today derivation. The
// hook owns platform I/O; the rules are pure.
export function useTodaySession(): UseTodaySessionResult {
  const [trades, setTrades] = useState<TradeListRow[]>([])
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [meta, setMeta] = useState<SessionMeta | null>(null)
  const [journalEntry, setJournalEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const today = todayDateISO()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      ipc.tradesList({ date: today }),
      ipc.sessionGet(today),
      ipc.sessionListAll(),
      ipc.journalGet(today),
    ])
      .then(([tradesList, todayMeta, allSessions, journalDay]) => {
        if (cancelled) return
        setTrades(tradesList.filter((t) => !t.is_open))
        setMeta(todayMeta)
        setSessions(allSessions)
        setJournalEntry(journalDay?.entry ?? null)
        setLoading(false)
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [today, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const save = useCallback(
    async (input: SaveTodaySessionInput) => {
      const saved = await ipc.sessionTodaySave(input)
      setMeta(saved)
      // Refresh the all-sessions list so the "no-trade days this month"
      // counter updates without waiting for a remount.
      const refreshed = await ipc.sessionListAll()
      setSessions(refreshed)
    },
    [],
  )

  const hasJournalEntry = hasJournalContent(journalEntry)
  const status: TodaySessionStatus =
    meta != null || !loading
      ? deriveTodayStatus(today, trades, meta, hasJournalEntry)
      : {
          date: today,
          status: 'not-started',
          meta: emptyMeta(today),
          stats: null,
          hasJournalEntry,
          committed: hasJournalEntry,
        }

  const noTradeDaysThisMonth = countNoTradeDaysThisMonth(today, sessions)

  return { status, noTradeDaysThisMonth, loading, error, refresh, save }
}
