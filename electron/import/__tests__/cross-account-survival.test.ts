// Multi-account Beat 2 — the CROSS-ACCOUNT SURVIVAL suite (the beat's soul).
// The two destructive commit() guards and the preview covered-set become
// account-scoped so one account's import can never destroy another's rows:
//   - purgeOpen:        DELETE … is_open = 1        AND account_id = ?
//   - supersedeSummary: DELETE … source_format='summary' … AND account_id = ?
//   - markSummariesSuperseded's DB covered-set:      AND account_id = ?
// Stateful shim: a trades table keyed by account; the DELETEs enforce their
// own predicates so survival is proven by rows remaining, not by regex alone.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type { RoundTrip } from '@shared/import-types'

const { feesSpy, summarySpy, defaultSpy, ensureSpy } = vi.hoisted(() => ({
  feesSpy: vi.fn(),
  summarySpy: vi.fn(),
  defaultSpy: vi.fn(() => 'ACCT-DEFAULT'),
  ensureSpy: vi.fn(() => 'ACCT-DEFAULT'),
}))

interface Row {
  symbol: string
  date: string
  account_id: string
  is_open: number
  source_format: string
  exec_hash: string
  content_hash: string
  deleted: boolean
}

let table: Row[] = []
let runLog: { sql: string; args: unknown[] }[] = []
let coveredSetArgs: unknown[][] = []

const PURGE_RE = /DELETE FROM trades WHERE symbol = \? AND date = \? AND is_open = 1 AND account_id = \?/i
const SUPERSEDE_RE = /DELETE FROM trades WHERE symbol = \? AND date = \? AND source_format = 'summary' AND deleted_at IS NULL AND account_id = \?/i
const COVERED_RE = /SELECT DISTINCT symbol, date FROM trades WHERE source_format != 'summary' AND deleted_at IS NULL AND account_id = \?/i

const mockDb = {
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        runLog.push({ sql, args })
        if (PURGE_RE.test(sql)) {
          const [symbol, date, acct] = args as [string, string, string]
          const before = table.length
          table = table.filter(
            (r) => !(r.symbol === symbol && r.date === date && r.is_open === 1 && r.account_id === acct),
          )
          return { changes: before - table.length, lastInsertRowid: 0 }
        }
        if (SUPERSEDE_RE.test(sql)) {
          const [symbol, date, acct] = args as [string, string, string]
          const before = table.length
          table = table.filter(
            (r) =>
              !(
                r.symbol === symbol &&
                r.date === date &&
                r.source_format === 'summary' &&
                !r.deleted &&
                r.account_id === acct
              ),
          )
          return { changes: before - table.length, lastInsertRowid: 0 }
        }
        if (/INSERT\s+OR\s+IGNORE\s+INTO\s+trades/i.test(sql)) {
          const p = args[0] as Record<string, unknown>
          table.push({
            symbol: p.symbol as string,
            date: p.date as string,
            account_id: p.account_id as string,
            is_open: p.is_open as number,
            source_format: p.source_format as string,
            exec_hash: p.exec_hash as string,
            content_hash: p.content_hash as string,
            deleted: false,
          })
          return { changes: 1, lastInsertRowid: table.length }
        }
        return { changes: 0, lastInsertRowid: 0 }
      },
      get: () => undefined,
      all: (...args: unknown[]) => {
        if (COVERED_RE.test(sql)) {
          coveredSetArgs.push(args)
          const [acct] = args as [string]
          const seen = new Set<string>()
          const out: { symbol: string; date: string }[] = []
          for (const r of table) {
            if (r.source_format !== 'summary' && !r.deleted && r.account_id === acct) {
              const k = `${r.symbol}|${r.date}`
              if (!seen.has(k)) {
                seen.add(k)
                out.push({ symbol: r.symbol, date: r.date })
              }
            }
          }
          return out
        }
        return []
      },
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: feesSpy }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: summarySpy }))
vi.mock('../../accounts/repo', () => ({
  getDefaultAccountId: defaultSpy,
  ensureDefaultAccountId: ensureSpy,
}))

import { commit, markSummariesSuperseded } from '../repo'

function trip(over: Partial<RoundTrip> = {}): RoundTrip {
  return {
    date: '2026-06-15',
    symbol: 'ACME',
    side: 'long',
    open_time: '2026-06-15T14:30:00.000Z',
    close_time: '2026-06-15T15:00:00.000Z',
    is_open: false,
    shares_bought: 100,
    avg_buy_price: 10,
    shares_sold: 100,
    avg_sell_price: 11,
    gross_pnl: 100,
    total_fees: 0,
    net_pnl: 100,
    exec_hash: `EH-${Math.random().toString(36).slice(2, 8)}`,
    content_hash: `CH-${Math.random().toString(36).slice(2, 8)}`,
    executions: [],
    status: 'new',
    source_format: 'execution',
    ...over,
  }
}

function seed(row: Partial<Row>): void {
  table.push({
    symbol: 'ACME',
    date: '2026-06-15',
    account_id: 'ACCT-A',
    is_open: 0,
    source_format: 'execution',
    exec_hash: `EH-seed-${table.length}`,
    content_hash: `CH-seed-${table.length}`,
    deleted: false,
    ...row,
  })
}

beforeEach(() => {
  table = []
  runLog = []
  coveredSetArgs = []
  feesSpy.mockClear()
  summarySpy.mockClear()
  defaultSpy.mockClear()
  ensureSpy.mockClear()
})

describe('purgeOpen — cross-account survival', () => {
  it("Account A's OPEN trip SURVIVES Account B's import of the same symbol+date", () => {
    seed({ account_id: 'ACCT-A', is_open: 1 })
    commit([trip({ exec_hash: 'EH-B1', content_hash: 'CH-B1' })], [], 'test', 'ACCT-B')
    expect(table.some((r) => r.account_id === 'ACCT-A' && r.is_open === 1)).toBe(true)
  })

  it("SAME account: the stale open trip is still purged exactly as today", () => {
    seed({ account_id: 'ACCT-B', is_open: 1 })
    commit([trip({ exec_hash: 'EH-B2', content_hash: 'CH-B2' })], [], 'test', 'ACCT-B')
    expect(table.some((r) => r.account_id === 'ACCT-B' && r.is_open === 1)).toBe(false)
  })
})

describe('supersedeSummary — cross-account survival', () => {
  it("Account A's summary-sourced rows SURVIVE Account B's authoritative fills for the same symbol+date", () => {
    seed({ account_id: 'ACCT-A', source_format: 'summary' })
    commit([trip({ exec_hash: 'EH-B3', content_hash: 'CH-B3' })], [], 'test', 'ACCT-B')
    expect(table.some((r) => r.account_id === 'ACCT-A' && r.source_format === 'summary')).toBe(true)
  })

  it('SAME account: the stale summary is still hard-deleted exactly as today', () => {
    seed({ account_id: 'ACCT-B', source_format: 'summary' })
    const out = commit([trip({ exec_hash: 'EH-B4', content_hash: 'CH-B4' })], [], 'test', 'ACCT-B')
    expect(out.supersededTrips).toBe(1)
    expect(table.some((r) => r.account_id === 'ACCT-B' && r.source_format === 'summary')).toBe(false)
  })
})

describe('markSummariesSuperseded — account-scoped covered-set', () => {
  it("Account A's DB executions do NOT cover Account B's incoming summary (it stays new)", () => {
    seed({ account_id: 'ACCT-A', source_format: 'execution', symbol: 'X', date: '2026-06-15' })
    const { trips, superseded } = markSummariesSuperseded(
      [trip({ symbol: 'X', source_format: 'summary' })],
      'ACCT-B',
    )
    expect(superseded).toBe(0)
    expect(trips[0].status).toBe('new')
    expect(coveredSetArgs[0]).toEqual(['ACCT-B'])
  })

  it("the SAME account's DB executions still cover its incoming summary (duplicate)", () => {
    seed({ account_id: 'ACCT-B', source_format: 'execution', symbol: 'X', date: '2026-06-15' })
    const { trips, superseded } = markSummariesSuperseded(
      [trip({ symbol: 'X', source_format: 'summary' })],
      'ACCT-B',
    )
    expect(superseded).toBe(1)
    expect(trips[0].status).toBe('duplicate')
  })

  it('same-batch coverage is account-independent (one import = one account) and unchanged', () => {
    const { superseded } = markSummariesSuperseded(
      [
        trip({ symbol: 'Y', source_format: 'execution' }),
        trip({ symbol: 'Y', source_format: 'summary' }),
      ],
      'ACCT-B',
    )
    expect(superseded).toBe(1)
  })
})
