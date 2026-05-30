import { describe, expect, it } from 'vitest'
import { isCountryReResolvable, normalizeIso } from '../source'

// Pure logic behind the country repo's re-resolve guard + manual-override
// normalization. (The SQL glue can't run under vitest — better-sqlite3's
// native binary is built for Electron's ABI — so the load-bearing rules live
// here as pure functions; the thin DB reads/writes are diff-reviewed + smoked.)

describe('isCountryReResolvable — which rows an auto-resolve may overwrite', () => {
  it('always protects manual rows (force or not)', () => {
    expect(isCountryReResolvable('manual', false)).toBe(false)
    expect(isCountryReResolvable('manual', true)).toBe(false)
  })

  it('re-resolves null / unknown / inferred on an incremental run', () => {
    expect(isCountryReResolvable(null, false)).toBe(true)
    expect(isCountryReResolvable('unknown', false)).toBe(true)
    expect(isCountryReResolvable('inferred', false)).toBe(true) // the new value, re-resolvable
  })

  it('leaves confident polygon rows alone incrementally; re-resolves them on force', () => {
    expect(isCountryReResolvable('polygon', false)).toBe(false)
    expect(isCountryReResolvable('polygon', true)).toBe(true)
  })
})

describe('normalizeIso — manual-override input cleanup', () => {
  it('uppercases a valid alpha-2', () => {
    expect(normalizeIso('il')).toBe('IL')
    expect(normalizeIso('US')).toBe('US')
  })

  it('rejects anything that is not alpha-2 → null', () => {
    expect(normalizeIso('USA')).toBeNull()
    expect(normalizeIso('')).toBeNull()
    expect(normalizeIso(null)).toBeNull()
    expect(normalizeIso('1L')).toBeNull()
  })
})
