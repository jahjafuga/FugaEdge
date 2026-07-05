// Ocean One fee-merge Beat 2 — the DEDUP half (the dupe bug itself).
//
// The bug: an Ocean One "Trades" import of a day the trader already has as DAS
// executions inserts a SECOND, duplicate round trip — because OO trips commit as
// source_format='execution' and the (symbol,date) supersede only yields
// source_format='summary' trips to executions.
//
// This drives the REAL parser output through the REAL markSummariesSuperseded
// (repo.ts), over the summary-supersede-guard SQL shim (better-sqlite3 won't load
// under vitest). COVERED DAY: a DAS execution covering the OO trip's (symbol,date)
// must flip the OO trip to 'duplicate' (commit then skips it — no dupe). OO-ONLY
// DAY: the same OO trip, uncovered, stays 'new' (it's the only record — it must
// import). Both hinge on the parser tagging OO trips 'summary' (Beat 2).

import { describe, expect, it, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'
import type { RoundTrip } from '@shared/import-types'

let dbExecutionRows: { symbol: string; date: string }[] = []

const mockDb = {
  prepare(sql: string) {
    return {
      run: () => ({ changes: 0, lastInsertRowid: 0 }),
      get: () => undefined,
      all: () => {
        if (/SELECT\s+DISTINCT\s+symbol,\s*date\s+FROM\s+trades/i.test(sql)) return dbExecutionRows
        return []
      },
    }
  },
  transaction(fn: (...a: unknown[]) => unknown) {
    return (...a: unknown[]) => fn(...a)
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))
vi.mock('../apply-fees', () => ({ recomputeFeesForDateSymbol: vi.fn() }))
vi.mock('../../trades/recompute-summary', () => ({ recomputeSummaryForDates: vi.fn() }))
vi.mock('../../accounts/repo', () => ({
  getDefaultAccountId: () => 'ACCT-TEST',
  ensureDefaultAccountId: () => 'ACCT-TEST',
}))

import { markSummariesSuperseded } from '../repo'
import { parseOceanOneXls } from '../parse-ocean-one'

// One ZZZ trip on 2026-05-01 — the day the trader also has in DAS.
function ooBuffer(): Uint8Array {
  const header = [
    'Opened', 'Closed', 'Held', 'Symbol', 'Type', 'Entry', 'Exit', 'Qty', 'Gross',
    'Comm', 'Ecn Fee', 'SEC', 'ORF', 'CAT', 'TAF', 'OCC', 'NSCC', 'Acc', 'Clr', 'Misc', 'Net',
  ]
  const rows: string[][] = [
    ['5/1/2026'],
    header,
    ['5/1/2026 9:37:35', '9:38:20', '00:00:45', 'ZZZ', 'Long', '2.00', '2.50', '10', '5.00',
      '0.10', '0', '0.02', '0', '0.03', '0.04', '0', '0', '0', '0', '0', '4.81'],
    ['Equities', '', '', '', '', '', '', '', '5.00'],
    [],
  ]
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Trades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
}

// A DAS execution for the same (symbol, date) — the authoritative coverage.
function dasExecTrip(symbol: string, date: string): RoundTrip {
  return {
    date,
    symbol,
    side: 'long',
    open_time: `${date}T13:37:35.000Z`,
    close_time: `${date}T13:38:20.000Z`,
    is_open: false,
    shares_bought: 10,
    avg_buy_price: 2,
    shares_sold: 10,
    avg_sell_price: 2.5,
    gross_pnl: 5,
    total_fees: 0,
    net_pnl: 5,
    exec_hash: `DAS-EH-${symbol}-${date}`,
    content_hash: `DAS-CH-${symbol}-${date}`,
    executions: [],
    status: 'new',
    source_format: 'execution',
  }
}

beforeEach(() => {
  dbExecutionRows = []
})

describe('Ocean One fee-merge — covered day (dupe fix)', () => {
  it('a DAS execution in the SAME batch supersedes the OO trip (→ duplicate, not inserted)', () => {
    const oo = parseOceanOneXls(ooBuffer()).roundTrips
    expect(oo).toHaveLength(1)
    const { trips, superseded } = markSummariesSuperseded(
      [dasExecTrip('ZZZ', '2026-05-01'), ...oo],
      'ACCT-TEST',
    )
    expect(superseded).toBe(1)
    expect(trips.find((t) => t.source_broker === 'OceanOne')!.status).toBe('duplicate')
    expect(trips.find((t) => t.source_format === 'execution')!.status).toBe('new')
  })

  it('a DAS execution already in the DB (prior import) supersedes the OO trip', () => {
    dbExecutionRows = [{ symbol: 'ZZZ', date: '2026-05-01' }]
    const oo = parseOceanOneXls(ooBuffer()).roundTrips
    const { trips, superseded } = markSummariesSuperseded(oo, 'ACCT-TEST')
    expect(superseded).toBe(1)
    expect(trips[0].status).toBe('duplicate')
  })
})

describe('Ocean One fee-merge — OO-only day (no matching DAS trade)', () => {
  it('the OO trip stays "new" (it is the only record of that trade → must import)', () => {
    const oo = parseOceanOneXls(ooBuffer()).roundTrips
    const { trips, superseded } = markSummariesSuperseded(oo, 'ACCT-TEST')
    expect(superseded).toBe(0)
    expect(trips[0].status).toBe('new')
  })
})

describe('Ocean One fee-merge — re-import idempotency', () => {
  it('an OO trip already marked "duplicate" (hash-matched on re-import) is not re-counted', () => {
    // annotateTripStatus flips a re-dropped OO trip to 'duplicate' upstream; the
    // status==='new' gate means the supersede pass leaves it alone.
    const oo = parseOceanOneXls(ooBuffer()).roundTrips.map((t) => ({ ...t, status: 'duplicate' as const }))
    const { trips, superseded } = markSummariesSuperseded(
      [dasExecTrip('ZZZ', '2026-05-01'), ...oo],
      'ACCT-TEST',
    )
    expect(superseded).toBe(0)
    expect(trips.find((t) => t.source_broker === 'OceanOne')!.status).toBe('duplicate')
  })
})
