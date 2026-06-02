// v0.2.3 Phase 1 — SQL-contract tests proving every `FROM trades` READ site
// filters soft-deleted rows (deleted_at IS NULL), that listTrades exposes a
// { deleted } option, and that getTrade deliberately does NOT filter (decision
// #6: it returns deleted rows so the modal/Trash UI can render them).
//
// Why SQL-contract and not behavioral: better-sqlite3's native binary won't
// load under vitest (ERR_DLOPEN_FAILED — Electron ABI), so there is no real DB
// here. We mock openDatabase with a capturing shim, invoke each exported read
// function, and assert the SQL it prepared. The shim returns a universal
// "benign" proxy for every .get()/.all() cell so no read function early-returns
// (which would skip a later query) and none throws on the synthetic data. The
// post-query compute is fed deliberately-fake values and is NOT under test —
// hence the invocation is wrapped so a compute-phase throw can't mask the SQL
// we already captured. Behavioral correctness (deleted rows actually excluded)
// is covered by the Phase 1 sandbox-acceptance step on a real DB copy.

import { describe, expect, it, vi } from 'vitest'

// ── Capturing DB shim ───────────────────────────────────────────────────────

let captured: string[] = []

// A self-absorbing proxy: any property access / call returns itself; coerces
// to 0 (number/string), iterates empty, and is not thenable. Lets every read
// path run to completion without throwing on synthetic data.
const benign: any = new Proxy(function () {}, {
  get(_target, key) {
    if (key === Symbol.toPrimitive) return () => 0
    if (key === Symbol.iterator) return function* () {}
    if (key === 'then') return undefined
    return benign
  },
  apply() {
    return benign
  },
})

const stmt: any = {
  // A one-element array so loop-gated queries (e.g. per-playbook stats) still
  // run, while .map()/for-of stay safe.
  all: () => [benign],
  get: () => benign,
  run: () => ({ changes: 0, lastInsertRowid: 0 }),
  pluck: () => stmt,
  raw: () => stmt,
  iterate: function* () {},
}

const capturingDb: any = {
  prepare: (sql: string) => {
    captured.push(sql)
    return stmt
  },
  exec: (sql: string) => {
    captured.push(sql)
  },
  transaction:
    (fn: any) =>
    (...args: any[]) =>
      fn(...args),
  pragma: () => {},
}

// openDatabase is referenced lazily (only when called in a test body), so the
// const above is initialized by then — no TDZ despite vi.mock hoisting.
vi.mock('../database', () => ({
  openDatabase: () => capturingDb,
  closeDatabase: () => {},
  getDbPath: () => '',
  listTables: () => [],
}))

// settings/export.ts imports electron at module load and needs a save dialog
// to reach its trades query; node:fs/promises.writeFile finalizes the export.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: { fromWebContents: () => undefined },
  dialog: { showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/x.csv' }) },
}))
vi.mock('node:fs/promises', () => ({ writeFile: async () => {} }))

// ── SUTs (imported after the mocks above) ───────────────────────────────────
import { listTrades, getTrade } from '../../trades/list'
import { getReports } from '../../reports/get'
import { getJournalDay } from '../../journal/get'
import { listPlaybooks } from '../../playbook/repo'
import { getWeekDetail } from '../../week/repo'
import { getWeeklySummaries, listTradesForWeek } from '../../calendar/weekly'
import { getCalendarMonth } from '../../calendar/get'
import { getDashboardData } from '../../stats/dashboard'
import { getAnalytics } from '../../analytics/get'
import { countTradesByRegion, countTradesByCountry } from '../../trades/country'
import { exportTradesCsv } from '../../settings/export'

// ── Helpers ──────────────────────────────────────────────────────────────────

const FROM_TRADES = /from\s+trades\b/i
const FILTER = /deleted_at\s+IS\s+NULL/i

async function tradeSqlsFrom(fn: () => unknown | Promise<unknown>): Promise<string[]> {
  captured = []
  try {
    await fn()
  } catch {
    // SQL contract only — synthetic benign data may throw in post-query
    // compute, which is irrelevant and happens after prepare() captured the SQL.
  }
  return captured.filter((s) => FROM_TRADES.test(s))
}

function expectAllFiltered(sqls: string[]) {
  expect(sqls.length).toBeGreaterThan(0)
  for (const s of sqls) expect(s).toMatch(FILTER)
}

// ── Test #1 — the 12 read sites all carry `deleted_at IS NULL` ───────────────

describe('read paths filter soft-deleted trades (deleted_at IS NULL)', () => {
  it('reports/get.ts:628 — getReports', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getReports()))
  })

  it('journal/get.ts:83 — getJournalDay', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getJournalDay('2026-01-02')))
  })

  it('playbook/repo.ts:83 — listPlaybooks → per-playbook stats', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => listPlaybooks()))
  })

  it('week/repo.ts:25 — getWeekDetail', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getWeekDetail('2026-01-04')))
  })

  it('calendar/weekly.ts:227,254 — getWeeklySummaries', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getWeeklySummaries(2026, 1)))
  })

  it('calendar/weekly.ts:274 — listTradesForWeek', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => listTradesForWeek('2026-01-04')))
  })

  it('calendar/get.ts:27,32,76 — getCalendarMonth', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getCalendarMonth(2026, 1)))
  })

  it('stats/dashboard.ts:50,66,73,147,183,240,317 — getDashboardData', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getDashboardData('all')))
  })

  it('analytics/get.ts:894 — getAnalytics', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => getAnalytics()))
  })

  it('trades/country.ts:137 — countTradesByRegion', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => countTradesByRegion()))
  })

  it('trades/country.ts:148 — countTradesByCountry', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => countTradesByCountry()))
  })

  it('settings/export.ts:50 — exportTradesCsv', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => exportTradesCsv({} as any)))
  })

  it('trades/list.ts:131 — listTrades (default)', async () => {
    expectAllFiltered(await tradeSqlsFrom(() => listTrades()))
  })
})

// ── Tests #2/#3 — listTrades option semantics ────────────────────────────────

describe('listTrades deleted-filter option', () => {
  it('#3 — listTrades() with no option emits deleted_at IS NULL', async () => {
    const sqls = await tradeSqlsFrom(() => listTrades())
    expect(sqls.length).toBeGreaterThan(0)
    expect(sqls[0]).toMatch(/deleted_at\s+IS\s+NULL/i)
  })

  it('#2 — listTrades({ deleted: true }) emits deleted_at IS NOT NULL', async () => {
    const sqls = await tradeSqlsFrom(() => listTrades({ deleted: true } as any))
    expect(sqls.length).toBeGreaterThan(0)
    expect(sqls[0]).toMatch(/deleted_at\s+IS\s+NOT\s+NULL/i)
  })
})

// ── Test #4 — getTrade lock (decision #6) ────────────────────────────────────

describe('getTrade does not filter deleted rows (decision #6 lock)', () => {
  it('#4 — getTrade selects t.deleted_at but applies no deleted_at IS NULL filter', async () => {
    const sqls = await tradeSqlsFrom(() => getTrade(1))
    expect(sqls.length).toBeGreaterThan(0)
    const sql = sqls[0]
    // Returns the deleted state so the UI can render it…
    expect(sql).toMatch(/\bt\.deleted_at\b/i)
    // …but never filters it out.
    expect(sql).not.toMatch(/deleted_at\s+IS\s+NULL/i)
  })
})

// ── Test #7 — deleted_at flows through to the returned row shape ──────────────
// (TradeRowDb SELECT + interface field + TradeListRow field + mapper line.)

describe('deleted_at is carried on returned trade rows', () => {
  it('#7 — listTrades rows include a deleted_at field', () => {
    captured = []
    let rows: any[] = []
    try {
      rows = listTrades() as any[]
    } catch {
      /* shape assertion below */
    }
    expect(Array.isArray(rows) && rows.length > 0).toBe(true)
    expect('deleted_at' in rows[0]).toBe(true)
  })

  it('#7 — getTrade row includes a deleted_at field', () => {
    captured = []
    let row: any = null
    try {
      row = getTrade(1)
    } catch {
      /* shape assertion below */
    }
    expect(row).toBeTruthy()
    expect('deleted_at' in row).toBe(true)
  })
})
