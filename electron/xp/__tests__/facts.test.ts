import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computeAwardIntents } from '@/core/xp/engine'

// v0.2.5 Phase A Session 3 — fact assembly (mock-contract per the Session 1
// settings-repo precedent; the real driver is proven by the Session 3
// fixture smokes). The shim records every prepared SQL string so the A2
// P&L-blind guard can assert over ALL of them.
const { store } = vi.hoisted(() => ({
  store: {
    sqls: [] as string[],
    params: [] as unknown[][],
    sessionRows: [] as Record<string, unknown>[],
    tradeRows: [] as Record<string, unknown>[],
    eventRows: [] as Record<string, unknown>[],
    dateRows: [] as Record<string, unknown>[],
  },
}))

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      store.sqls.push(sql)
      return {
        all: (...params: unknown[]) => {
          store.params.push(params)
          if (/trade_technicals/i.test(sql)) return store.tradeRows
          if (/FROM universe/i.test(sql)) return store.sessionRows
          if (/FROM xp_events/i.test(sql)) return store.eventRows
          if (/SELECT DISTINCT date/i.test(sql)) return store.dateRows
          throw new Error(`facts shim: unexpected SQL: ${sql}`)
        },
      }
    },
  }),
}))

import {
  assembleExistingEvents,
  assembleSessionFacts,
  assembleTradeFacts,
  listTradeDates,
  lookupTradeDates,
  mapSessionRow,
  mapTradeRow,
} from '../facts'

beforeEach(() => {
  store.sqls = []
  store.params = []
  store.sessionRows = []
  store.tradeRows = []
  store.eventRows = []
  store.dateRows = []
})

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    date: '2026-06-10',
    content_hash: 'abc',
    playbook_id: 3,
    catalyst_type: 'News',
    has_note: 1,
    tt_trade_id: 7,
    tf_1m_macd_positive: 1,
    tf_1m_vwap_dist_pct: 0.5,
    tf_1m_ema9_dist_pct: 0.2,
    ...overrides,
  }
}

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-06-10',
    trade_count: 2,
    untagged_count: 0,
    imported_at: '2026-06-10 14:03:22',
    sentiment: 3,
    no_trade_day: 0,
    ...overrides,
  }
}

describe('mapTradeRow', () => {
  it('A1: converts the 0/1/NULL macd flag explicitly — 1 → true', () => {
    expect(mapTradeRow(tradeRow({ tf_1m_macd_positive: 1 })).technicals1m).toEqual({
      macdPositive: true,
      vwapDistPct: 0.5,
      ema9DistPct: 0.2,
    })
  })

  it('A1: 0 → false (not falsy passthrough)', () => {
    expect(
      mapTradeRow(tradeRow({ tf_1m_macd_positive: 0 })).technicals1m?.macdPositive,
    ).toBe(false)
  })

  it('A1: NULL → null (never coerced)', () => {
    expect(
      mapTradeRow(tradeRow({ tf_1m_macd_positive: null })).technicals1m?.macdPositive,
    ).toBeNull()
  })

  it('no trade_technicals row → technicals1m null', () => {
    expect(
      mapTradeRow(
        tradeRow({
          tt_trade_id: null,
          tf_1m_macd_positive: null,
          tf_1m_vwap_dist_pct: null,
          tf_1m_ema9_dist_pct: null,
        }),
      ).technicals1m,
    ).toBeNull()
  })

  it('D13 tradeKey: content_hash when non-NULL, else id: fallback', () => {
    expect(mapTradeRow(tradeRow()).tradeKey).toBe('abc')
    expect(mapTradeRow(tradeRow({ content_hash: null })).tradeKey).toBe('id:7')
  })

  it('D8 flags: null playbook / empty-or-null catalyst / 0 note → false', () => {
    const f = mapTradeRow(
      tradeRow({ playbook_id: null, catalyst_type: null, has_note: 0 }),
    )
    expect(f.hasPlaybook).toBe(false)
    expect(f.hasCatalyst).toBe(false)
    expect(f.hasNote).toBe(false)
    expect(mapTradeRow(tradeRow({ catalyst_type: '  ' })).hasCatalyst).toBe(false)
    expect(mapTradeRow(tradeRow()).hasPlaybook).toBe(true)
  })
})

describe('mapSessionRow', () => {
  it('sentimentSet is null-ness only (D9)', () => {
    expect(mapSessionRow(sessionRow({ sentiment: null })).sentimentSet).toBe(false)
    expect(mapSessionRow(sessionRow({ sentiment: 1 })).sentimentSet).toBe(true)
  })

  it('allTradesPlaybookTagged: true only with trades AND zero untagged — no vacuous true at tradeCount 0', () => {
    expect(mapSessionRow(sessionRow()).allTradesPlaybookTagged).toBe(true)
    expect(
      mapSessionRow(sessionRow({ untagged_count: 1 })).allTradesPlaybookTagged,
    ).toBe(false)
    expect(
      mapSessionRow(sessionRow({ trade_count: 0, untagged_count: 0 }))
        .allTradesPlaybookTagged,
    ).toBe(false)
  })

  it('isNoTradeDay from the 0/1 flag; importedAt passed RAW (L16)', () => {
    expect(mapSessionRow(sessionRow({ no_trade_day: 1 })).isNoTradeDay).toBe(true)
    expect(mapSessionRow(sessionRow()).isNoTradeDay).toBe(false)
    expect(mapSessionRow(sessionRow()).importedAt).toBe('2026-06-10 14:03:22')
    expect(mapSessionRow(sessionRow({ imported_at: null })).importedAt).toBeNull()
  })
})

describe('A1 flow-shaped: raw row → assembly → REAL engine → disciplined_entry', () => {
  it('a 0/1 row with positive distances produces the discipline intent end-to-end', () => {
    store.tradeRows = [tradeRow()] // tf_1m_macd_positive = 1 (raw INTEGER)
    const trades = assembleTradeFacts('2026-06-05')
    const intents = computeAwardIntents({
      nowIso: '2026-06-12T20:00:00.000Z',
      sessions: [],
      trades,
      existing: [],
    })
    expect(intents.map((i) => i.idempotency_key)).toContain('discipline:abc')
    expect(
      intents.find((i) => i.event_type === 'disciplined_entry')?.xp,
    ).toBe(15)
  })
})

describe('assemblers', () => {
  it('assembleSessionFacts maps rows; scoped variant passes the dates IN-params', () => {
    store.sessionRows = [sessionRow()]
    const all = assembleSessionFacts()
    expect(all).toHaveLength(1)
    expect(all[0].date).toBe('2026-06-10')

    assembleSessionFacts(['2026-06-09', '2026-06-10'])
    const scopedSql = store.sqls[store.sqls.length - 1]
    expect(scopedSql).toMatch(/IN \(\?, \?\)/)
    expect(store.params[store.params.length - 1]).toEqual([
      '2026-06-09',
      '2026-06-10',
    ])
  })

  it('assembleTradeFacts passes fromDate first; scoped dates append', () => {
    store.tradeRows = [tradeRow()]
    assembleTradeFacts('2026-06-05')
    expect(store.params[store.params.length - 1]).toEqual(['2026-06-05'])

    assembleTradeFacts('2026-06-05', ['2026-06-10'])
    expect(store.params[store.params.length - 1]).toEqual([
      '2026-06-05',
      '2026-06-10',
    ])
  })

  it('the trade query keeps the defensive TRIM note guard', () => {
    assembleTradeFacts('2026-06-05')
    const sql = store.sqls[store.sqls.length - 1]
    expect(sql).toMatch(/TRIM\(/)
    expect(sql).toMatch(/note_text/)
  })

  it('assembleExistingEvents returns the three ledger columns as-is', () => {
    store.eventRows = [
      {
        event_type: 'session_journaled',
        idempotency_key: 'session:2026-06-10',
        source_ref: '2026-06-10',
      },
    ]
    expect(assembleExistingEvents()).toEqual([
      {
        event_type: 'session_journaled',
        idempotency_key: 'session:2026-06-10',
        source_ref: '2026-06-10',
      },
    ])
  })

  it('lookupTradeDates passes the ids and returns distinct dates', () => {
    store.dateRows = [{ date: '2026-06-09' }, { date: '2026-06-10' }]
    expect(lookupTradeDates([5, 7, 9])).toEqual(['2026-06-09', '2026-06-10'])
    expect(store.params[store.params.length - 1]).toEqual([5, 7, 9])
  })

  it('listTradeDates returns every distinct non-deleted trade date (S4 streak feed)', () => {
    store.dateRows = [{ date: '2026-06-09' }, { date: '2026-06-10' }]
    expect(listTradeDates()).toEqual(['2026-06-09', '2026-06-10'])
    const sql = store.sqls[store.sqls.length - 1]
    expect(sql).toMatch(/deleted_at IS NULL/)
  })

  // ── A2 allowlist guard ────────────────────────────────────────────────
  // The invariant is "facts.ts cannot read anything not explicitly
  // permitted", NOT "doesn't mention pnl" — avg_buy_price would have
  // passed a pnl blocklist. Every identifier-like token in every SQL
  // string the assemblers prepare must be in the closed permitted set.

  const SQL_KEYWORDS = new Set([
    'with', 'as', 'select', 'from', 'where', 'and', 'union', 'left',
    'join', 'on', 'order', 'by', 'asc', 'in', 'count', 'min', 'coalesce',
    'exists', 'trim', 'null', 'is', 'not', 'distinct',
  ])
  const TABLES_AND_ALIASES = new Set([
    'trades', 'session_meta', 'trade_notes', 'trade_technicals',
    'xp_events', 'universe', 't', 'u', 'sm', 'n', 'tt',
  ])
  const PERMITTED_COLUMNS = new Set([
    // trades
    'id', 'date', 'deleted_at', 'playbook_id', 'catalyst_type',
    'content_hash', 'created_at',
    // session_meta
    'sentiment', 'no_trade_day',
    // trade_notes
    'trade_id', 'note_text',
    // trade_technicals — D7's tf_1m snapshot only
    'tf_1m_macd_positive', 'tf_1m_vwap_dist_pct', 'tf_1m_ema9_dist_pct',
    // xp_events ledger projection
    'event_type', 'idempotency_key', 'source_ref',
    // SELECT output aliases
    'trade_count', 'untagged_count', 'imported_at', 'has_note',
    'tt_trade_id',
  ])

  function unpermittedTokens(sql: string): string[] {
    const tokens = sql.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? []
    return tokens.filter(
      (tok) =>
        !SQL_KEYWORDS.has(tok) &&
        !TABLES_AND_ALIASES.has(tok) &&
        !PERMITTED_COLUMNS.has(tok),
    )
  }

  it('A2 allowlist guard: every SQL identifier facts.ts prepares is explicitly permitted', () => {
    assembleSessionFacts()
    assembleSessionFacts(['2026-06-10'])
    assembleTradeFacts('2026-06-05')
    assembleTradeFacts('2026-06-05', ['2026-06-10'])
    assembleExistingEvents()
    lookupTradeDates([1])
    listTradeDates()
    expect(store.sqls.length).toBeGreaterThanOrEqual(7)
    for (const sql of store.sqls) {
      expect(unpermittedTokens(sql), `unpermitted identifiers in: ${sql}`).toEqual([])
      expect(sql).not.toMatch(/pnl/i) // second line of defense
    }
  })

  it('A2 guard self-test: the checker rejects a P&L column by construction', () => {
    expect(
      unpermittedTokens('SELECT t.avg_buy_price FROM trades t'),
    ).toEqual(['avg_buy_price'])
    expect(unpermittedTokens('SELECT t.net_pnl FROM trades t')).toEqual([
      'net_pnl',
    ])
  })
})
