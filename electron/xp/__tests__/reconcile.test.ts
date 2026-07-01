import { describe, it, expect, beforeEach, vi } from 'vitest'

// v0.2.5 Phase A Session 3 — reconcile orchestration. facts + repo are
// mocked STATEFULLY (inserted events feed back into assembleExistingEvents)
// so these tests close the real loop through the REAL pure engine: the
// second-run-zero case is the same convergence the fixture smoke proves on
// the actual driver.
const { store } = vi.hoisted(() => ({
  store: {
    sessions: [] as Array<Record<string, unknown>>,
    trades: [] as Array<Record<string, unknown>>,
    events: [] as Array<{
      event_type: string
      idempotency_key: string
      source_ref: string | null
    }>,
    insertedKeys: new Set<string>(),
    tradeDateMap: {} as Record<number, string>,
    log: [] as string[],
    sessionCalls: [] as Array<string[] | undefined>,
    tradeCalls: [] as Array<{ fromDate: string; dates?: string[] }>,
  },
}))

vi.mock('../facts', () => ({
  assembleSessionFacts: (dates?: string[]) => {
    store.log.push('facts:sessions')
    store.sessionCalls.push(dates)
    const all = store.sessions
    return dates ? all.filter((s) => dates.includes(s.date as string)) : all
  },
  assembleTradeFacts: (fromDate: string, dates?: string[]) => {
    store.log.push('facts:trades')
    store.tradeCalls.push({ fromDate, dates })
    let rows = store.trades.filter((t) => (t.date as string) >= fromDate)
    if (dates) rows = rows.filter((t) => dates.includes(t.date as string))
    return rows
  },
  assembleExistingEvents: () => {
    store.log.push('facts:existing')
    return [...store.events]
  },
  lookupTradeDates: (ids: number[]) => {
    store.log.push('facts:lookupDates')
    return Array.from(
      new Set(ids.map((id) => store.tradeDateMap[id]).filter(Boolean)),
    )
  },
}))

vi.mock('../repo', () => ({
  insertXpEvents: (intents: Array<Record<string, unknown>>) => {
    store.log.push('repo:insert')
    let n = 0
    for (const i of intents) {
      const key = i.idempotency_key as string
      if (store.insertedKeys.has(key)) continue
      store.insertedKeys.add(key)
      store.events.push({
        event_type: i.event_type as string,
        idempotency_key: key,
        source_ref: (i.source_ref as string | null) ?? null,
      })
      n++
    }
    return n
  },
}))

// The §A2 discipline branch's collaborators (parallel to the P&L-blind engine).
// getSettings supplies the self-set limit; netPnlByDate is the contained P&L
// reader — defaults to empty so the existing orchestration cases stay inert, and
// one case below feeds it a qualifying past day to exercise the branch.
vi.mock('../../settings/repo', () => ({
  getSettings: () => ({ values: { max_daily_loss: 20 } }),
}))
vi.mock('../pnl-facts', () => ({
  netPnlByDate: vi.fn(() => new Map()),
}))

import {
  reconcileXpForDates,
  runXpReconcile,
  xpReconcileForTradeIds,
} from '../reconcile'
import { netPnlByDate } from '../pnl-facts'

const mockNetPnl = vi.mocked(netPnlByDate)

const NOW = '2026-06-12T20:00:00.000Z'

function journaledSession(date: string) {
  return {
    date,
    tradeCount: 1,
    sentimentSet: true,
    allTradesPlaybookTagged: true,
    isNoTradeDay: false,
    importedAt: `${date} 18:00:00`,
  }
}

function annotatedTrade(id: number, date: string) {
  return {
    id,
    tradeKey: `h${id}`,
    date,
    hasPlaybook: true,
    hasCatalyst: true,
    hasNote: true,
    technicals1m: { macdPositive: true, vwapDistPct: 0.4, ema9DistPct: 0.2 },
  }
}

beforeEach(() => {
  store.sessions = []
  store.trades = []
  store.events = []
  store.insertedKeys = new Set()
  store.tradeDateMap = {}
  store.log = []
  store.sessionCalls = []
  store.tradeCalls = []
  mockNetPnl.mockReset()
  mockNetPnl.mockReturnValue(new Map())
})

describe('runXpReconcile (L10 — single-pass full sweep)', () => {
  it('assembles, computes, inserts — counts grouped by type', () => {
    store.sessions = [journaledSession('2026-06-10')]
    store.trades = [annotatedTrade(1, '2026-06-10')]
    const result = runXpReconcile({ nowIso: NOW })
    expect(result.insertedByType).toEqual({
      session_journaled: 1,
      daily_streak_bonus: 1,
      trade_fully_annotated: 1,
      disciplined_entry: 1,
    })
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('orchestration order: all assembly precedes any insert', () => {
    store.sessions = [journaledSession('2026-06-10')]
    runXpReconcile({ nowIso: NOW })
    const lastFacts = store.log.lastIndexOf('facts:existing')
    const firstInsert = store.log.indexOf('repo:insert')
    expect(firstInsert).toBeGreaterThan(lastFacts)
  })

  it('L13: the trade assembly window is now − FRESH_WINDOW_DAYS', () => {
    runXpReconcile({ nowIso: NOW })
    expect(store.tradeCalls[0]).toEqual({ fromDate: '2026-06-05', dates: undefined })
  })

  it('THE Phase A acceptance shape: second run on an unchanged store inserts ZERO', () => {
    store.sessions = [journaledSession('2026-06-10')]
    store.trades = [annotatedTrade(1, '2026-06-10')]
    const first = runXpReconcile({ nowIso: NOW })
    expect(Object.keys(first.insertedByType)).not.toHaveLength(0)

    const insertCallsAfterFirst = store.log.filter((l) => l === 'repo:insert').length
    const second = runXpReconcile({ nowIso: NOW })
    expect(second.insertedByType).toEqual({})
    // zero intents → the repo is never even called on run 2
    expect(store.log.filter((l) => l === 'repo:insert')).toHaveLength(
      insertCallsAfterFirst,
    )
  })

  it('awards maxloss_respected for a PAST day that stayed within the limit', () => {
    // A closed past day (NOW = 2026-06-12) with a small loss inside the $20 limit.
    mockNetPnl.mockReturnValue(
      new Map([['2026-06-10', { netPnl: -10, tradeCount: 2 }]]),
    )
    const result = runXpReconcile({ nowIso: NOW })
    expect(result.insertedByType.maxloss_respected).toBe(1)
    expect([...store.insertedKeys]).toContain('maxloss_respected:2026-06-10')
  })
})

describe('reconcileXpForDates (the hook path)', () => {
  it('scoped run assembles and touches only its dates', () => {
    store.sessions = [journaledSession('2026-06-09'), journaledSession('2026-06-10')]
    store.trades = [annotatedTrade(1, '2026-06-09'), annotatedTrade(2, '2026-06-10')]
    const result = reconcileXpForDates(['2026-06-10'], NOW)
    expect(store.sessionCalls[0]).toEqual(['2026-06-10'])
    expect(store.tradeCalls[0]).toEqual({
      fromDate: '2026-06-05',
      dates: ['2026-06-10'],
    })
    expect(result.insertedByType).toEqual({
      session_journaled: 1,
      daily_streak_bonus: 1,
      trade_fully_annotated: 1,
      disciplined_entry: 1,
    })
    for (const key of store.insertedKeys) {
      expect(key).toMatch(/2026-06-10|h2/)
    }
  })

  it('deduplicates the input dates', () => {
    store.sessions = [journaledSession('2026-06-10')]
    reconcileXpForDates(['2026-06-10', '2026-06-10'], NOW)
    expect(store.sessionCalls[0]).toEqual(['2026-06-10'])
  })

  it('empty dates → zero result, no assembly, no inserts', () => {
    const result = reconcileXpForDates([], NOW)
    expect(result).toEqual({ insertedByType: {}, durationMs: 0 })
    expect(store.log).toEqual([])
  })
})

describe('xpReconcileForTradeIds (the per-trade hook path)', () => {
  it('resolves dates from trade ids and delegates to the date path', () => {
    store.tradeDateMap = { 5: '2026-06-10', 9: '2026-06-10' }
    store.sessions = [journaledSession('2026-06-10')]
    store.trades = [annotatedTrade(5, '2026-06-10')]
    const result = xpReconcileForTradeIds([5, 9], NOW)
    expect(store.log[0]).toBe('facts:lookupDates')
    expect(store.sessionCalls[0]).toEqual(['2026-06-10'])
    expect(result.insertedByType.trade_fully_annotated).toBe(1)
  })

  it('empty ids / unknown ids → zero result, no date-path work', () => {
    expect(xpReconcileForTradeIds([], NOW)).toEqual({
      insertedByType: {},
      durationMs: 0,
    })
    expect(store.log).toEqual([])

    store.tradeDateMap = {}
    const result = xpReconcileForTradeIds([404], NOW)
    expect(result).toEqual({ insertedByType: {}, durationMs: 0 })
    expect(store.sessionCalls).toHaveLength(0)
  })
})
