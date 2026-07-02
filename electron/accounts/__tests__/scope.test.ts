import { describe, it, expect } from 'vitest'
import { scopeFilter, scopeCacheKey, SIM_WALL } from '../scope'

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

// Analytics slice — the memoized read handlers (analytics/reports) key their
// TTL cache BY SCOPE; without this a switcher flip within the TTL would serve
// one scope's payload to another. The key shape is the seam's business.
describe('scopeCacheKey', () => {
  it("'all' -> the literal 'all'", () => {
    expect(scopeCacheKey('all')).toBe('all')
  })

  it('single account -> a per-account key distinct from all and from other accounts', () => {
    expect(scopeCacheKey({ accountId: 'ACCT-X' })).toBe('acct:ACCT-X')
    expect(scopeCacheKey({ accountId: 'ACCT-X' })).not.toBe(scopeCacheKey('all'))
    expect(scopeCacheKey({ accountId: 'ACCT-X' })).not.toBe(
      scopeCacheKey({ accountId: 'ACCT-Y' }),
    )
  })
})
