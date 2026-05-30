// Tests for the v0.2.2 Commit A float-rename migration (schema 20 → 21).
//
// The migration COPIES legacy shares-outstanding values from float_shares/
// float (where they're mislabeled) into the correctly-named shares_outstanding
// columns, then NULLs the old columns so a subsequent FMP enrichment (Commit B)
// can repopulate them with REAL free float.
//
// IMPORTANT shape note: by the time migrateFloatRename runs, the
// shares_outstanding columns already exist on both tables — they're added by
// the standard idempotent ALTERs in migrateAfterSchema (mirror of how
// float_shares was added). This migration owns DATA, not SCHEMA. So the mock
// DB initial state below reflects that: shares_outstanding columns present,
// but the data hasn't been moved yet.
//
// Test infra: same constraint as migrate-content-hash.test.ts — better-
// sqlite3's native binary won't load under vitest. The mock DB shim tracks
// columns + row data + settings table + the run log. Same pattern as the
// refresh-batch-cancel test's vi.mock('../db/database').
//
// User's explicit requirement: idempotency must be PROVEN in tests (not just
// smoke) before this touches a real DB.

import { describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import {
  FLOAT_RENAME_LATCH_KEY,
  migrateFloatRename,
} from '../migrate-float-rename'

// ── Mock DB shim ──────────────────────────────────────────────────────────

interface MockTradesRow {
  id: number
  float_shares: number | null
  shares_outstanding: number | null
}
interface MockMarketRow {
  symbol: string
  float: number | null
  shares_outstanding: number | null
}
interface MockState {
  tradesCols: string[]
  marketCols: string[]
  trades: MockTradesRow[]
  marketData: MockMarketRow[]
  settings: Map<string, string>
  /** SQL statements observed by .run() / .exec() — for diagnostic assertions. */
  runLog: string[]
}

function makeMockDb(initial: {
  tradesCols: string[]
  marketCols: string[]
  trades: MockTradesRow[]
  marketData: MockMarketRow[]
  settings?: Record<string, string>
}): Database.Database & { _state: MockState } {
  const state: MockState = {
    tradesCols: [...initial.tradesCols],
    marketCols: [...initial.marketCols],
    trades: initial.trades.map((r) => ({ ...r })),
    marketData: initial.marketData.map((r) => ({ ...r })),
    settings: new Map(Object.entries(initial.settings ?? {})),
    runLog: [],
  }

  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)

      if (q === 'PRAGMA table_info(trades)') {
        return { all: () => state.tradesCols.map((name) => ({ name })) }
      }
      if (q === 'PRAGMA table_info(market_data)') {
        return { all: () => state.marketCols.map((name) => ({ name })) }
      }

      // Settings reads — latch lookup.
      if (q === 'SELECT value FROM settings WHERE key = ?') {
        return {
          get: (key: string) => {
            const value = state.settings.get(key)
            return value === undefined ? undefined : { value }
          },
        }
      }

      // Settings writes — latch upsert.
      if (
        q ===
        `INSERT INTO settings (key, value) VALUES (?, 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'`
      ) {
        return {
          run: (key: string) => {
            state.runLog.push(`SET_LATCH ${key}`)
            state.settings.set(key, 'true')
            return { changes: 1, lastInsertRowid: 0 }
          },
        }
      }

      // UPDATE trades SET shares_outstanding = float_shares WHERE …
      if (
        q ===
        'UPDATE trades SET shares_outstanding = float_shares WHERE float_shares IS NOT NULL'
      ) {
        return {
          run: () => {
            state.runLog.push(q)
            let n = 0
            for (const r of state.trades) {
              if (r.float_shares != null) {
                r.shares_outstanding = r.float_shares
                n++
              }
            }
            return { changes: n, lastInsertRowid: 0 }
          },
        }
      }

      // UPDATE market_data SET shares_outstanding = float WHERE …
      if (
        q ===
        'UPDATE market_data SET shares_outstanding = float WHERE float IS NOT NULL'
      ) {
        return {
          run: () => {
            state.runLog.push(q)
            let n = 0
            for (const r of state.marketData) {
              if (r.float != null) {
                r.shares_outstanding = r.float
                n++
              }
            }
            return { changes: n, lastInsertRowid: 0 }
          },
        }
      }

      throw new Error(`unexpected prepare() SQL in test: ${q}`)
    },
    exec(sql: string) {
      const q = norm(sql)
      state.runLog.push(q)
      if (q === 'UPDATE trades SET float_shares = NULL') {
        for (const r of state.trades) r.float_shares = null
        return
      }
      if (q === 'UPDATE market_data SET float = NULL') {
        for (const r of state.marketData) r.float = null
        return
      }
      throw new Error(`unexpected exec() SQL in test: ${q}`)
    },
    transaction(fn: () => void) {
      // Pass-through — tests never assert mid-transaction visibility.
      return () => fn()
    },
  }

  return Object.assign(mock as unknown as Database.Database, { _state: state })
}

// Initial column lists — by the time the migration runs, the additive ALTER
// in migrateAfterSchema has already added shares_outstanding to both tables.
const POST_ALTER_TRADES_COLS = [
  'id',
  'symbol',
  'float_shares',
  'shares_outstanding',
  'country',
  'mae',
  'mfe',
]
const POST_ALTER_MARKET_COLS = [
  'symbol',
  'float',
  'shares_outstanding',
  'market_cap',
  'sector',
  'country',
]

// ── Tests ─────────────────────────────────────────────────────────────────

describe('migrateFloatRename — schema 20 → 21 data move', () => {
  it('copies legacy float_shares → shares_outstanding, NULLs the old columns, sets the latch', () => {
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [
        { id: 1, float_shares: 632201, shares_outstanding: null },   // CLIK-like
        { id: 2, float_shares: 80532, shares_outstanding: null },    // PRFX-like
        { id: 3, float_shares: null, shares_outstanding: null },     // pre-null
      ],
      marketData: [
        { symbol: 'CLIK', float: 632201, shares_outstanding: null },
        { symbol: 'PRFX', float: 80532, shares_outstanding: null },
        { symbol: 'LABT', float: null, shares_outstanding: null },
      ],
    })

    const result = migrateFloatRename(db, /* priorVersion */ 20)

    expect(result.ran).toBe(true)
    expect(result.tradesRowsCopied).toBe(2)    // null row not copied
    expect(result.marketDataRowsCopied).toBe(2)

    // Trades: legacy values preserved under the correct name; old column NULLed.
    expect(db._state.trades[0]).toEqual({
      id: 1,
      float_shares: null,
      shares_outstanding: 632201,
    })
    expect(db._state.trades[1]).toEqual({
      id: 2,
      float_shares: null,
      shares_outstanding: 80532,
    })
    // Pre-existing-null row stays null on both columns.
    expect(db._state.trades[2]).toEqual({
      id: 3,
      float_shares: null,
      shares_outstanding: null,
    })

    // Market data: same pattern.
    expect(db._state.marketData[0]).toEqual({
      symbol: 'CLIK',
      float: null,
      shares_outstanding: 632201,
    })
    expect(db._state.marketData[2]).toEqual({
      symbol: 'LABT',
      float: null,
      shares_outstanding: null,
    })

    // Latch set so subsequent runs no-op.
    expect(db._state.settings.get(FLOAT_RENAME_LATCH_KEY)).toBe('true')
  })

  it('IS IDEMPOTENT — running twice produces identical final state, second run is a latched no-op', () => {
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [{ id: 1, float_shares: 100000, shares_outstanding: null }],
      marketData: [{ symbol: 'XYZ', float: 100000, shares_outstanding: null }],
    })

    const first = migrateFloatRename(db, 20)
    expect(first.ran).toBe(true)
    expect(first.tradesRowsCopied).toBe(1)
    expect(first.marketDataRowsCopied).toBe(1)

    // Snapshot the post-migration state.
    const snapshotTrades = JSON.parse(JSON.stringify(db._state.trades))
    const snapshotMarket = JSON.parse(JSON.stringify(db._state.marketData))

    // Run again — latch fires immediately, no SQL touches data.
    const second = migrateFloatRename(db, 20) // SAME priorVersion: latch is the truth
    expect(second.ran).toBe(false)
    expect(second.reason).toBe('latched')
    expect(second.tradesRowsCopied).toBe(0)
    expect(second.marketDataRowsCopied).toBe(0)

    // Final state identical to single-run.
    expect(db._state.trades).toEqual(snapshotTrades)
    expect(db._state.marketData).toEqual(snapshotMarket)
  })

  it('skips on fresh install (priorVersion = 0) AND sets the latch defensively', () => {
    // Fresh install: migrateAfterSchema's ALTERs already added the new
    // columns; there's no legacy data to move. Set the latch so a future
    // corrupted priorVersion read can't re-trigger.
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [],
      marketData: [],
    })

    const result = migrateFloatRename(db, 0)
    expect(result.ran).toBe(false)
    expect(result.reason).toBe('fresh-install')
    // Defensive latch — protects Commit B's freshly-fetched FMP float values
    // from being NULLed if priorVersion ever reads stale on a later launch.
    expect(db._state.settings.get(FLOAT_RENAME_LATCH_KEY)).toBe('true')
  })

  it('skips when priorVersion >= 21 (already-migrated path), and sets the latch defensively', () => {
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [{ id: 1, float_shares: null, shares_outstanding: 632201 }],
      marketData: [{ symbol: 'CLIK', float: null, shares_outstanding: 632201 }],
    })

    const result = migrateFloatRename(db, 21)
    expect(result.ran).toBe(false)
    expect(result.reason).toBe('already-migrated')
    expect(db._state.settings.get(FLOAT_RENAME_LATCH_KEY)).toBe('true')

    // Critically: the existing (already-migrated) data is UNTOUCHED.
    expect(db._state.trades[0].shares_outstanding).toBe(632201)
    expect(db._state.marketData[0].shares_outstanding).toBe(632201)
  })

  it('LATCH is the truth even when priorVersion claims pre-migration', () => {
    // Defense: a corrupted priorVersion read (e.g. _meta inconsistency)
    // must NOT re-trigger the data move once the latch is set. This is the
    // load-bearing guarantee that Commit B's freshly-populated FMP float
    // values won't be erased on a buggy second launch.
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [{ id: 1, float_shares: 132507, shares_outstanding: 632201 }],
      marketData: [{ symbol: 'CLIK', float: 132507, shares_outstanding: 632201 }],
      settings: { [FLOAT_RENAME_LATCH_KEY]: 'true' }, // latch ALREADY set
    })

    const result = migrateFloatRename(db, 20) // STALE version says "run me"

    expect(result.ran).toBe(false)
    expect(result.reason).toBe('latched')
    // float_shares and float UNCHANGED — the latch saved them.
    expect(db._state.trades[0].float_shares).toBe(132507)
    expect(db._state.marketData[0].float).toBe(132507)
  })

  it('runs the COPY → NULL → latch statements in the expected order', () => {
    // The order matters: COPY before NULL — reversed would erase the legacy
    // data before it's preserved. Latch lands LAST inside the transaction
    // so a crash mid-move can't leave us latched-without-data.
    const db = makeMockDb({
      tradesCols: POST_ALTER_TRADES_COLS,
      marketCols: POST_ALTER_MARKET_COLS,
      trades: [{ id: 1, float_shares: 100000, shares_outstanding: null }],
      marketData: [{ symbol: 'XYZ', float: 100000, shares_outstanding: null }],
    })

    migrateFloatRename(db, 20)

    expect(db._state.runLog).toEqual([
      'UPDATE trades SET shares_outstanding = float_shares WHERE float_shares IS NOT NULL',
      'UPDATE market_data SET shares_outstanding = float WHERE float IS NOT NULL',
      'UPDATE trades SET float_shares = NULL',
      'UPDATE market_data SET float = NULL',
      `SET_LATCH ${FLOAT_RENAME_LATCH_KEY}`,
    ])
  })
})
