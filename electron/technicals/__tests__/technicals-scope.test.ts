// Multi-account (Technicals slice, beat 1) — listTradesWithTechnicals joins
// the account seam. Routing-shim style (the playbook-scope mirror): the fake
// db routes the bulk read BY THE SQL THE SEAM GENERATES — single scope routes
// by the bound account id, the non-sim wall routes to the non-sim union, and
// the legacy-unfiltered route carries a POISONED SIM ROW so a missing seam
// clause breaks the numbers. The LEFT-JOIN null convention (trades with no
// technicals row appear with technicals: null — the excluded-count chip's
// input) must survive under every scope.

import { describe, expect, it, beforeEach, vi } from 'vitest'
import { SIM_WALL } from '../../accounts/scope'

let alls: { sql: string; args: unknown[] }[] = []

// Minimal TradeWithTechnicalsDbRow rows. tt-null = the LEFT-JOIN-miss row.
function dbRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 0, symbol: 'AAA', date: '2026-06-10', side: 'long', net_pnl: 0,
    open_time: '2026-06-10T13:30:00.000Z', source_format: null,
    playbook_id: null, playbook_name: null,
    tt_trade_id: null,
    tf_1m_macd_line: null, tf_1m_signal_line: null, tf_1m_histogram: null,
    tf_1m_histogram_prior: null, tf_1m_macd_positive: null,
    tf_1m_macd_open: null, tf_1m_macd_rising: null,
    tf_1m_vwap: null, tf_1m_vwap_dist_pct: null,
    tf_1m_ema9: null, tf_1m_ema9_dist_pct: null,
    tf_1m_ema20: null, tf_1m_ema20_dist_pct: null,
    tf_1m_ema9_above_ema20: null,
    tf_5m_macd_line: null, tf_5m_signal_line: null, tf_5m_histogram: null,
    tf_5m_histogram_prior: null, tf_5m_macd_positive: null,
    tf_5m_macd_open: null, tf_5m_macd_rising: null,
    tf_5m_vwap: null, tf_5m_vwap_dist_pct: null,
    tf_5m_ema9: null, tf_5m_ema9_dist_pct: null,
    tf_5m_ema20: null, tf_5m_ema20_dist_pct: null,
    tf_5m_ema9_above_ema20: null,
    data_complete: null, computed_at: null, schema_version: null,
    ...over,
  }
}

const A1 = dbRow({
  id: 1, net_pnl: 100, date: '2026-06-10',
  tt_trade_id: 1, data_complete: 1, computed_at: '2026-06-10T20:00:00.000Z', schema_version: 1,
})
// The LEFT-JOIN-null row: a trade with NO technicals snapshot yet.
const A2_NO_TT = dbRow({ id: 2, net_pnl: 40, date: '2026-06-09' })
const B1 = dbRow({
  id: 3, net_pnl: -30, date: '2026-06-08',
  tt_trade_id: 3, data_complete: 1, computed_at: '2026-06-08T20:00:00.000Z', schema_version: 1,
})
const SIM_POISON = dbRow({ id: 9, net_pnl: 999, date: '2026-06-07' })

const BY_ACCOUNT: Record<string, unknown[]> = {
  'ACCT-A': [A1, A2_NO_TT],
  'ACCT-B': [B1],
}

function route(sql: string, args: unknown[]): unknown[] {
  if (/account_id = \?/.test(sql)) {
    const acct = args[args.length - 1] as string
    return BY_ACCOUNT[acct] ?? []
  }
  if (sql.includes(SIM_WALL)) {
    return [A1, A2_NO_TT, B1]
  }
  // Legacy-unfiltered — the latent sim leak this beat kills.
  return [A1, A2_NO_TT, B1, SIM_POISON]
}

const mockDb = {
  prepare(sql: string) {
    return {
      all: (...args: unknown[]) => {
        alls.push({ sql, args })
        if (/FROM trades/i.test(sql)) return route(sql, args)
        return []
      },
      get: () => undefined,
    }
  },
}

vi.mock('../../db/database', () => ({ openDatabase: () => mockDb }))

import { listTradesWithTechnicals } from '../repo'

beforeEach(() => {
  alls = []
})

describe('listTradesWithTechnicals — account scope through the seam', () => {
  it("single scope: that account's rows only; SQL carries account_id = ? with the bind", () => {
    const rows = listTradesWithTechnicals({ accountScope: { accountId: 'ACCT-A' } })
    expect(alls[0].sql).toMatch(/account_id = \?/)
    expect(alls[0].sql).toMatch(/t\.deleted_at IS NULL/i)
    expect(alls[0].args).toEqual(['ACCT-A'])
    expect(rows.map((r) => r.id)).toEqual([1, 2])
    expect(rows.map((r) => r.net_pnl)).toEqual([100, 40])
  })

  it("'all': the wall in the SQL; the poisoned sim row never appears", () => {
    const rows = listTradesWithTechnicals({ accountScope: 'all' })
    expect(alls[0].sql).toContain(SIM_WALL)
    expect(alls[0].args).toEqual([])
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3])
    expect(rows.some((r) => r.net_pnl === 999)).toBe(false)
  })

  it("absent scope: byte-equal to explicit 'all', wall in the SQL", () => {
    const absent = listTradesWithTechnicals({})
    expect(alls[0].sql).toContain(SIM_WALL)
    alls = []
    const explicit = listTradesWithTechnicals({ accountScope: 'all' })
    expect(absent).toEqual(explicit)
  })

  it('scope COMPOSES with from/to: both conds present, binds ordered range-then-account', () => {
    listTradesWithTechnicals({
      from: '2026-06-01',
      to: '2026-06-30',
      accountScope: { accountId: 'ACCT-A' },
    })
    const { sql, args } = alls[0]
    expect(sql).toMatch(/t\.date >= \?/)
    expect(sql).toMatch(/t\.date <= \?/)
    expect(sql).toMatch(/account_id = \?/)
    expect(args).toEqual(['2026-06-01', '2026-06-30', 'ACCT-A'])
  })

  it('the LEFT-JOIN null convention survives under every scope (technicals: null rows still return)', () => {
    const single = listTradesWithTechnicals({ accountScope: { accountId: 'ACCT-A' } })
    const noTT = single.find((r) => r.id === 2)!
    expect(noTT).toBeTruthy()
    expect(noTT.technicals).toBeNull()

    alls = []
    const all = listTradesWithTechnicals({ accountScope: 'all' })
    expect(all.find((r) => r.id === 2)!.technicals).toBeNull()
  })
})
