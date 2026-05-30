import { describe, expect, it, vi } from 'vitest'

// better-sqlite3's native binary won't load under vitest (Electron ABI), so we
// can't run the UPDATE against a real DB. This guards the SQL *contract* via a
// captured prepare/run: the bulk override must set source 'manual', scope to
// WHERE symbol = ?, and carry NO manual-skip clause (so it overwrites prior
// 'inferred' AND 'manual' rows). Real filtering/overwrite is smoke-verified.

let captured: { sql: string; args: unknown[] } | null = null
vi.mock('../../db/database', () => ({
  openDatabase: () => ({
    prepare: (sql: string) => ({
      run: (...args: unknown[]) => {
        captured = { sql, args }
        return { changes: args.length }
      },
    }),
  }),
}))

import { applySymbolCountryManual } from '../country'

describe('applySymbolCountryManual — bulk per-symbol manual override', () => {
  it('sets every trade of the symbol to manual with no manual-skip (overwrites inferred)', () => {
    captured = null
    applySymbolCountryManual('CLIK', 'cn') // lowercase normalizes to CN

    expect(captured).not.toBeNull()
    const { sql, args } = captured!
    expect(sql).not.toMatch(/!=\s*'manual'/) // crucial: no skip → overwrites inferred/manual
    expect(sql).toMatch(/WHERE\s+symbol\s*=\s*\?/i)
    expect(sql).toMatch(/country_source\s*=\s*'manual'/i)
    expect(args).toEqual(['CN', 'China', 'China', 'CLIK']) // iso, name, region, symbol
  })

  it('null country clears to Unknown but stays source manual', () => {
    captured = null
    applySymbolCountryManual('CLIK', null)
    expect(captured!.args).toEqual([null, 'Unknown', 'Unknown', 'CLIK'])
  })
})
