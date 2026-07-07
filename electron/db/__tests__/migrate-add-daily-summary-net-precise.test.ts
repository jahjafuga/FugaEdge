// Precision pass Beat F3 — the schema 43 -> 44 migration for the precise daily_summary
// cache. Two effects:
//
//   (1) ADD COLUMN daily_summary.total_pnl_precise (additive, ALWAYS — the B1/F0 idiom).
//       Migration-only (NOT in SCHEMA_SQL's daily_summary CREATE), PRAGMA-gated so it
//       runs on every DB including fresh installs. Sits ABOVE the version gate.
//   (2) A one-time REBUILD of every live trade date's cache so total_pnl_precise is
//       populated for existing dates (the migrate-scratch-reclassify idiom: version gate
//       + latch + backup-abort). The rebuild is WRAPPED in conn.transaction() so a
//       mid-rebuild crash can't half-write the cache (the wrap is F3's addition over the
//       scratch-reclassify precedent).
//
// Same constraint as the other precision-pass migration tests: better-sqlite3's Electron
// ABI won't load under vitest (and recompute-summary transitively pulls it in), so this
// file locks the MECHANICS — the ALTER shape, the DISTINCT-date enumeration, the
// transaction wrap, the version gate, the latch, the backup ordering, the version bump —
// via a capturing shim + a mocked recomputeSummaryForDates. The ROW OUTCOMES
// (total_pnl_precise populated + derived from gross-fees; green-days untouched) are proven
// in the STEP 4 full-dress rehearsal on a real-shaped copy.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import type Database from 'better-sqlite3'

let mockRecomputeCalls: Array<Set<string>> = []
const mockEvents: string[] = []

vi.mock('../../trades/recompute-summary', () => ({
  recomputeSummaryForDates: (dates: Set<string>) => {
    mockEvents.push('recompute')
    mockRecomputeCalls.push(dates)
  },
}))

import {
  migrateAddDailySummaryNetPrecise,
  DAILY_SUMMARY_NET_PRECISE_MIGRATION_LATCH_KEY,
} from '../migrate-add-daily-summary-net-precise'
import { SCHEMA_VERSION } from '../schema'

interface RunEntry {
  sql: string
  args: unknown[]
}

// The schema-43 daily_summary shape (schema.ts CREATE) — total_pnl_precise ABSENT.
const BASE_DS = [
  'date', 'total_pnl', 'total_fees', 'trade_count', 'winners', 'losers',
  'gross_pnl', 'largest_win', 'largest_loss', 'account_id',
]

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

function makeMockDb({
  cols = BASE_DS,
  latched = false,
  liveDates = ['2026-01-05', '2026-01-06', '2026-01-07'],
} = {}) {
  const state = { cols: [...cols], settings: {} as Record<string, string> }
  if (latched) state.settings[DAILY_SUMMARY_NET_PRECISE_MIGRATION_LATCH_KEY] = 'true'
  const runLog: RunEntry[] = []
  const execLog: string[] = []
  const prepLog: string[] = []
  const transactionSpy = vi.fn()

  const mock = {
    prepare(sql: string) {
      const q = norm(sql)
      prepLog.push(q)
      return {
        all: () => {
          if (q === 'PRAGMA table_info(daily_summary)') return state.cols.map((name) => ({ name }))
          if (/SELECT DISTINCT date FROM trades/i.test(q)) return liveDates.map((date) => ({ date }))
          return []
        },
        get: (...a: unknown[]) => {
          if (/SELECT value FROM settings WHERE key/i.test(q)) {
            const key = String(a[0])
            return key in state.settings ? { value: state.settings[key] } : undefined
          }
          return undefined
        },
        run: (...args: unknown[]) => {
          runLog.push({ sql: q, args })
          if (/INSERT INTO settings/i.test(q)) state.settings[String(args[0])] = 'true'
          return { changes: 1, lastInsertRowid: 0 }
        },
      }
    },
    exec(sql: string) {
      const q = norm(sql)
      execLog.push(q)
      const m = q.match(/ALTER TABLE daily_summary ADD COLUMN (\w+)/i)
      if (m && !state.cols.includes(m[1])) state.cols.push(m[1])
    },
    transaction(fn: (...a: unknown[]) => unknown) {
      transactionSpy()
      return (...a: unknown[]) => fn(...a)
    },
  }

  return {
    db: mock as unknown as Database.Database,
    runLog,
    execLog,
    prepLog,
    transactionSpy,
    state,
  }
}

const altersFor = (log: string[], col: string) =>
  log.filter((q) => new RegExp(`ALTER TABLE daily_summary ADD COLUMN ${col}\\b`, 'i').test(q))
const latchWrites = (log: RunEntry[]) =>
  log.filter((e) => /INSERT INTO settings/i.test(e.sql))

beforeEach(() => {
  mockRecomputeCalls = []
  mockEvents.length = 0
})

describe('migrateAddDailySummaryNetPrecise — add daily_summary.total_pnl_precise + rebuild (schema 43 -> 44)', () => {
  it('adds total_pnl_precise as REAL NOT NULL DEFAULT 0 (the migration-only precise-column idiom)', () => {
    const { db, execLog, state } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(altersFor(execLog, 'total_pnl_precise')[0]).toMatch(
      /ALTER TABLE daily_summary ADD COLUMN total_pnl_precise REAL NOT NULL DEFAULT 0/i,
    )
    expect(state.cols).toContain('total_pnl_precise')
  })

  it('rebuilds the cache for ALL distinct live trade dates', () => {
    const { db } = makeMockDb({ liveDates: ['2026-01-05', '2026-01-06', '2026-01-07'] })
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(mockRecomputeCalls).toHaveLength(1)
    expect(mockRecomputeCalls[0]).toEqual(new Set(['2026-01-05', '2026-01-06', '2026-01-07']))
  })

  it('enumerates every live date with no account/sim/range filter (DISTINCT date, deleted_at IS NULL)', () => {
    const { db, prepLog } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(
      prepLog.some((q) => /^SELECT DISTINCT date FROM trades WHERE deleted_at IS NULL$/i.test(q)),
    ).toBe(true)
  })

  it('wraps the rebuild in a transaction and latches after it succeeds', () => {
    const { db, runLog, transactionSpy } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(transactionSpy).toHaveBeenCalled()
    expect(mockRecomputeCalls).toHaveLength(1)
    expect(latchWrites(runLog).length).toBeGreaterThanOrEqual(1)
  })

  it('version gate: priorVersion >= 44 skips the rebuild but the ALTER still runs', () => {
    const { db, execLog } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 44)
    expect(mockRecomputeCalls).toHaveLength(0)
    expect(altersFor(execLog, 'total_pnl_precise')).toHaveLength(1)
  })

  it('fresh install (priorVersion 0): adds the migration-only column but skips the rebuild', () => {
    const { db, execLog } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 0)
    expect(altersFor(execLog, 'total_pnl_precise')).toHaveLength(1)
    expect(mockRecomputeCalls).toHaveLength(0)
  })

  it('a set latch skips the rebuild (belt-and-suspenders idempotency)', () => {
    const { db } = makeMockDb({ latched: true })
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(mockRecomputeCalls).toHaveLength(0)
  })

  it('is idempotent: a second run after success is a latched no-op', () => {
    const { db } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(mockRecomputeCalls).toHaveLength(1)
    migrateAddDailySummaryNetPrecise(db, 43)
    expect(mockRecomputeCalls).toHaveLength(1)
  })

  it('runs the backup BEFORE the rebuild', () => {
    const { db } = makeMockDb()
    const backup = vi.fn(() => mockEvents.push('backup'))
    migrateAddDailySummaryNetPrecise(db, 43, { backup })
    expect(backup).toHaveBeenCalledTimes(1)
    expect(mockEvents).toEqual(['backup', 'recompute'])
  })

  it('a backup failure aborts: no rebuild, no latch', () => {
    const { db, runLog } = makeMockDb()
    migrateAddDailySummaryNetPrecise(db, 43, {
      backup: () => {
        throw new Error('disk full')
      },
    })
    expect(mockRecomputeCalls).toHaveLength(0)
    expect(latchWrites(runLog)).toHaveLength(0)
  })

  it('holds SCHEMA_VERSION at the F3 floor of 44 or later (later beats advance it)', () => {
    // De-brittled from an exact-'44' assertion when the mistakes-backfill beat bumped it to
    // 45; a floor keeps this canary meaningful without breaking on every later bump.
    expect(Number(SCHEMA_VERSION)).toBeGreaterThanOrEqual(44)
  })
})
