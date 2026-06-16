import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock-contract test (settings / profile-repo precedent — better-sqlite3 does
// not load under vitest). A capturing shim over openDatabase emulates the exact
// session_meta upserts the repo issues, so we can prove saveNoTradeDay writes
// ONLY the no-trade columns and PRESERVES an existing sentiment. This is the
// regression guard for the dashboard "sentiment clobber" — the no-trade flow
// must never overwrite the sentiment the MarketSentimentCard owns.

interface Row {
  date: string
  sentiment: number | null
  notes: string
  no_trade_day: number
  no_trade_reason: string
  day_mistakes_json: string
}

const { store } = vi.hoisted(() => ({
  store: { rows: new Map<string, Row>() },
}))

function blankRow(date: string): Row {
  return {
    date,
    sentiment: null,
    notes: '',
    no_trade_day: 0,
    no_trade_reason: '',
    day_mistakes_json: '[]',
  }
}

vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => {
      // saveSentiment — upsert the sentiment column only.
      if (/INSERT INTO session_meta \(date, sentiment, updated_at\)/i.test(sql)) {
        return {
          run: (date: string, sentiment: number | null) => {
            const r = store.rows.get(date) ?? blankRow(date)
            r.sentiment = sentiment
            store.rows.set(date, r)
            return { changes: 1 }
          },
        }
      }
      // saveNoTradeDay — upsert the no-trade columns only.
      if (/INSERT INTO session_meta \(date, no_trade_day, no_trade_reason, updated_at\)/i.test(sql)) {
        return {
          run: (date: string, ntd: number, reason: string) => {
            const r = store.rows.get(date) ?? blankRow(date)
            r.no_trade_day = ntd
            r.no_trade_reason = reason
            store.rows.set(date, r)
            return { changes: 1 }
          },
        }
      }
      // getSessionMeta — SELECT ... FROM session_meta WHERE date = ?
      if (/SELECT[\s\S]*FROM session_meta/i.test(sql)) {
        return { get: (date: string) => store.rows.get(date) }
      }
      throw new Error('unexpected SQL in session-repo mock: ' + sql)
    },
  }),
}))

import { saveSentiment, saveNoTradeDay, getSessionMeta } from '../repo'

const DATE = '2026-06-16'

describe('saveNoTradeDay — sentiment-agnostic no-trade write (clobber guard)', () => {
  beforeEach(() => {
    store.rows.clear()
  })

  it('sets no_trade_day + reason WITHOUT clobbering an existing sentiment', () => {
    // Trader picked sentiment 5 (e.g. via the standalone MarketSentimentCard).
    saveSentiment(DATE, 5)
    expect(getSessionMeta(DATE)?.sentiment).toBe(5)

    // Marking a no-trade day must NOT touch sentiment.
    const out = saveNoTradeDay(DATE, true, 'Choppy market')
    expect(out.no_trade_day).toBe(true)
    expect(out.no_trade_reason).toBe('Choppy market')
    expect(out.sentiment).toBe(5) // PRESERVED — the regression guard

    const reread = getSessionMeta(DATE)
    expect(reread?.sentiment).toBe(5)
    expect(reread?.no_trade_day).toBe(true)
    expect(reread?.no_trade_reason).toBe('Choppy market')
  })

  it('unmarking (no_trade_day=false) clears the reason and still preserves sentiment', () => {
    saveSentiment(DATE, 3)
    saveNoTradeDay(DATE, true, 'News event / FOMC')
    const out = saveNoTradeDay(DATE, false, '')
    expect(out.no_trade_day).toBe(false)
    expect(out.no_trade_reason).toBe('')
    expect(out.sentiment).toBe(3) // still preserved
  })

  it('creates a row with no_trade set when none exists yet (sentiment stays null)', () => {
    const out = saveNoTradeDay(DATE, true, 'Personal — off day')
    expect(out.no_trade_day).toBe(true)
    expect(out.no_trade_reason).toBe('Personal — off day')
    expect(out.sentiment).toBeNull()
  })
})
