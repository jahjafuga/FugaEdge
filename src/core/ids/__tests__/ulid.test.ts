import { describe, expect, it } from 'vitest'
import { newUlid } from '../ulid'

// v0.2.5 Phase A — ULID generation for the identity tables (spec §B: every
// new-table id is a ULID). Monotonic within the process so ids minted in
// the same millisecond still sort by creation order.

const CROCKFORD_B32 = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/

describe('newUlid', () => {
  it('returns a 26-character id', () => {
    expect(newUlid()).toHaveLength(26)
  })

  it('uses the Crockford base32 charset (no I, L, O, U; uppercase)', () => {
    for (let i = 0; i < 20; i++) {
      expect(newUlid()).toMatch(CROCKFORD_B32)
    }
  })

  it('two consecutive ids sort lexicographically ascending (monotonic)', () => {
    // Same-millisecond mints are the case that matters: a plain ulid() can
    // tie-then-shuffle, the monotonic factory cannot.
    const a = newUlid()
    const b = newUlid()
    expect(a < b).toBe(true)
  })
})
