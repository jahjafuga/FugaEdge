import { describe, it, expect } from 'vitest'
import { scopeFilter, SIM_WALL } from '../scope'

// Multi-account Beat 4 — the ONE scoping seam every filtering slice reuses.
// 'all' means every NON-SIM account by definition: the sim wall is built in
// from day one (vacuously true while sim imports stay blocked).

describe('scopeFilter', () => {
  it("single account -> 'account_id = ?' with the id as the bind", () => {
    const f = scopeFilter({ accountId: 'ACCT-X' })
    expect(f.clause).toBe('account_id = ?')
    expect(f.params).toEqual(['ACCT-X'])
  })

  it("'all' -> the sim-wall subquery with no binds", () => {
    const f = scopeFilter('all')
    expect(f.clause).toBe(SIM_WALL)
    expect(f.params).toEqual([])
  })

  it('the sim wall excludes sim-typed accounts by definition', () => {
    expect(SIM_WALL).toMatch(
      /account_id IN \(SELECT id FROM accounts WHERE account_type != 'sim'\)/,
    )
  })
})
