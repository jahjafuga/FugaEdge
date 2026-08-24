// v0.2.7 -- TRADES FOR ONE SETUP. The read half.
//
// Brendan's ask: open a playbook setup and see the trades logged under it,
// instead of going to the Trades page to hunt for them. The recon found the row
// payload already correct -- listTrades returns the full TradeListRow the panel
// needs and already selects playbook_id / playbook_name -- and the only thing
// missing was a way to ASK for one setup. So this is ONE optional condition on
// an existing query, not a new read.
//
// PRIMARY SETUPS ONLY (founder-ruled). trades.playbook_id is the primary,
// grade-bearing setup; the trade_playbooks junction holds SECONDARY confluence
// tags. The per-playbook stats read (playbook/repo.ts:106) counts PRIMARY only,
// and that count is already on screen beside the setup name as "{n}t". If this
// read included confluence trades the panel would list more trades than the
// number printed next to it -- a contradiction the user can see. So the two
// reads must carry the SAME predicate, and G4 pins exactly that.
//
// SQL-contract via a ROUTING shim (the playbook-scope.test.ts idiom):
// better-sqlite3's native binary will not load under vitest, and a shim that
// routes off the SQL the seam generated makes the row assertions load-bearing --
// an implementation that drops a clause falls into a wider route and the rows
// break, rather than the test silently passing on synthetic data.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let captured: { sql: string; args: unknown[] }[] = []

/** The OUTER where -- from the always-present soft-delete condition up to the
 *  outer ORDER BY. Slicing this way keeps SIM_WALL's own subquery WHERE and the
 *  LEFT JOIN count subqueries out of every assertion below. */
function whereOf(sql: string): string {
  const start = sql.indexOf('WHERE t.deleted_at')
  const end = sql.indexOf('ORDER BY t.open_time')
  return start === -1 || end === -1 ? '' : sql.slice(start, end)
}

/** A TradeRowDb-shaped row, keyed by the three things these guards care about:
 *  which setup is PRIMARY, which account, and whether it is in the Trash. */
function fakeRow(
  id: number,
  playbook_id: number | null,
  account_id: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    date: '2026-05-01',
    symbol: 'RDGT',
    side: 'long',
    open_time: '2026-05-01T13:30:00Z',
    close_time: '2026-05-01T13:35:00Z',
    is_open: 0,
    shares_bought: 100,
    avg_buy_price: 2.89,
    shares_sold: 100,
    avg_sell_price: 2.92,
    gross_pnl: 3,
    total_fees: 0.15,
    commission: 0.1,
    net_pnl: 2.85,
    executions_json: '[]',
    source_format: 'execution',
    entry_timeframe: null,
    entry_ema9_distance_pct: null,
    tf_1m_ema9_dist_pct: null,
    tf_1m_vwap_dist_pct: null,
    mae: null,
    mfe: null,
    daily_change_pct: null,
    rvol: null,
    playbook_id,
    playbook_name: playbook_id == null ? null : 'Micro Pullback',
    playbook_tier: playbook_id == null ? null : 'A',
    confidence: null,
    planned_risk: null,
    planned_stop_loss_price: null,
    float_shares: null,
    shares_outstanding: null,
    catalyst_type: null,
    days_since_catalyst: null,
    country: null,
    country_name: null,
    region: null,
    country_source: null,
    sector: null,
    industry: null,
    market_cap: null,
    stop_source: null,
    deleted_at: null,
    account_id,
    note_text: null,
    attachment_count: 0,
    secondary_tag_count: 0,
    mistake_link_count: 0,
    mistake_tags_json: null,
    ...over,
  }
}

// THE BOOK. Trades 1 and 2 have Micro Pullback (7) as their PRIMARY setup.
// Trade 3's primary is a DIFFERENT setup (9) and it merely carries 7 as a
// CONFLUENCE tag -- it must never appear. Trade 4 is Micro Pullback but sim.
// Trade 5 is Micro Pullback but soft-deleted.
const BOOK = [
  fakeRow(1, 7, 'ACCT-A'),
  fakeRow(2, 7, 'ACCT-B'),
  fakeRow(3, 9, 'ACCT-A', { secondary_tag_count: 1 }),
  fakeRow(4, 7, 'ACCT-SIM'),
  fakeRow(5, 7, 'ACCT-A', { deleted_at: '2026-05-02T00:00:00Z' }),
]

/** The set a CONFLUENCE-inclusive read would return -- trade 3 joins. Used only
 *  to prove the primary-only expectation is not vacuous. */
const CONFLUENCE_TAGGED_WITH_7 = new Set([3])

/** Routes the way the real DB would, off the SQL the seam generated. */
function route(sql: string, args: unknown[]): unknown[] {
  const where = whereOf(sql)
  let rows = BOOK

  if (/t\.playbook_id = \?/.test(where)) {
    const pb = args.find((a) => typeof a === 'number') as number | undefined
    const wantsConfluence = /trade_playbooks/i.test(where)
    rows = rows.filter(
      (r) =>
        r.playbook_id === pb ||
        (wantsConfluence && CONFLUENCE_TAGGED_WITH_7.has(r.id as number)),
    )
  }
  if (/t\.deleted_at IS NULL/.test(where)) {
    rows = rows.filter((r) => r.deleted_at === null)
  }
  if (/account_id = \?/.test(where)) {
    const acct = args.find((a) => typeof a === 'string' && String(a).startsWith('ACCT-'))
    rows = rows.filter((r) => r.account_id === acct)
  } else if (where.includes(SIM_WALL)) {
    rows = rows.filter((r) => r.account_id !== 'ACCT-SIM')
  }
  return rows
}

const capturingDb = {
  prepare: (sql: string) => ({
    all: (...args: unknown[]) => {
      captured.push({ sql, args })
      return route(sql, args)
    },
    get: () => null,
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
  }),
}

vi.mock('../../db/database', () => ({ openDatabase: () => capturingDb }))

import { listTrades } from '../list'

const lastSql = () => captured[captured.length - 1]

beforeEach(() => {
  captured = []
})

// --- G1 ---------------------------------------------------------------------

describe('G1 PRIMARY setups only -- a confluence-tagged trade never appears', () => {
  it('returns only the trades whose primary setup is the requested one', () => {
    const rows = listTrades({ playbookId: 7 })
    expect(rows.map((r) => r.id)).toEqual([1, 2])
  })

  it('the trade carrying this setup only as a CONFLUENCE tag is absent', () => {
    const rows = listTrades({ playbookId: 7 })
    expect(
      rows.find((r) => r.id === 3),
      'a confluence-tagged trade leaked into a primary-only read',
    ).toBeUndefined()
  })

  it('the junction is never consulted in the WHERE -- only as a count join', () => {
    listTrades({ playbookId: 7 })
    const sql = lastSql()!.sql
    expect(
      whereOf(sql),
      'trade_playbooks reached the WHERE clause -- confluence crept in',
    ).not.toMatch(/trade_playbooks/i)
    // It is still present as the PRE-EXISTING per-trade count subquery, so the
    // assertion above is about placement, not about the table vanishing.
    expect(sql).toMatch(/trade_playbooks/i)
  })

  it('omitting playbookId leaves the query unfiltered by setup (no regression)', () => {
    listTrades({})
    expect(whereOf(lastSql()!.sql)).not.toMatch(/playbook_id/)
  })
})

// --- G2 ---------------------------------------------------------------------

describe('G2 the read carries all three conditions', () => {
  it('playbook_id = ?, deleted_at IS NULL, and the scope clause -- together', () => {
    listTrades({ playbookId: 7 })
    const where = whereOf(lastSql()!.sql)
    expect(where, 'the setup predicate is missing').toMatch(/t\.playbook_id = \?/)
    expect(where, 'the soft-delete filter is missing').toMatch(/t\.deleted_at IS NULL/)
    expect(where, 'the scope clause is missing').toContain(SIM_WALL)
  })

  it('binds the setup id as a parameter, never inlined into the SQL', () => {
    listTrades({ playbookId: 7 })
    expect(lastSql()!.args).toContain(7)
    expect(lastSql()!.sql).not.toMatch(/playbook_id = 7/)
  })

  it('carries account_id = ? under a single-account scope', () => {
    listTrades({ playbookId: 7, accountScope: { accountId: 'ACCT-A' } })
    const c = lastSql()!
    expect(whereOf(c.sql)).toMatch(/account_id = \?/)
    expect(c.args).toEqual([7, 'ACCT-A'])
  })
})

// --- G3 ---------------------------------------------------------------------

describe('G3 scope is obeyed and the Trash never shows', () => {
  it('flipping the account scope changes the result', () => {
    const a = listTrades({ playbookId: 7, accountScope: { accountId: 'ACCT-A' } })
    const b = listTrades({ playbookId: 7, accountScope: { accountId: 'ACCT-B' } })
    expect(a.map((r) => r.id)).toEqual([1])
    expect(b.map((r) => r.id)).toEqual([2])
    expect(a).not.toEqual(b)
  })

  it("the non-sim wall applies under 'all' -- a sim trade never enters the panel", () => {
    const rows = listTrades({ playbookId: 7, accountScope: 'all' })
    expect(rows.map((r) => r.id)).toEqual([1, 2])
    expect(rows.find((r) => r.id === 4), 'a sim trade reached the panel').toBeUndefined()
  })

  it('an absent scope resolves through the seam to the wall, not to unscoped', () => {
    const absent = listTrades({ playbookId: 7 })
    const explicit = listTrades({ playbookId: 7, accountScope: 'all' })
    expect(absent.map((r) => r.id)).toEqual(explicit.map((r) => r.id))
    expect(whereOf(lastSql()!.sql)).toContain(SIM_WALL)
  })

  it('a soft-deleted trade carrying this setup never appears', () => {
    const rows = listTrades({ playbookId: 7 })
    expect(rows.find((r) => r.id === 5), 'a trashed trade reached the panel').toBeUndefined()
  })
})

// --- G4 ---------------------------------------------------------------------

describe('G4 the panel count agrees with the stats count by construction', () => {
  it('this read and the per-playbook stats read carry the SAME predicate', () => {
    // playbook/repo.ts:106 --
    //   FROM trades WHERE playbook_id = ? AND deleted_at IS NULL AND <scope>
    // Identical predicate means an identical row set, so the panel can never
    // list a different number of trades than the "{n}t" printed beside the
    // setup name. This is the agreement guard the primary-only ruling exists
    // for: it holds structurally, not by luck of the fixture.
    listTrades({ playbookId: 7 })
    const where = whereOf(lastSql()!.sql)
    for (const part of [/playbook_id = \?/, /deleted_at IS NULL/]) {
      expect(where, `the stats predicate part ${part} is missing here`).toMatch(part)
    }
    expect(where).toContain(SIM_WALL)
    // And nothing WIDER than the stats read: no junction, no disjunction.
    expect(where, 'this read is wider than the stats read').not.toMatch(/\bOR\b/i)
    expect(where).not.toMatch(/trade_playbooks/i)
  })

  it('the row count equals what that same predicate would count', () => {
    const rows = listTrades({ playbookId: 7, accountScope: 'all' })
    const statsWouldCount = BOOK.filter(
      (r) => r.playbook_id === 7 && r.deleted_at === null && r.account_id !== 'ACCT-SIM',
    ).length
    expect(rows.length).toBe(statsWouldCount)
  })
})
