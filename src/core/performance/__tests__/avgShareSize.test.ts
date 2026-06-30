import { describe, it, expect } from 'vitest'
import { avgShareSize } from '../avgShareSize'

// Avg Share Size (djsevans87) — mean over trades of position size, where position
// size = Math.max(shares_bought, shares_sold) (the established convention). Equals
// Dave's "shares traded / trades / 2" on every closed trade (builder closes only
// at flat position, so bought == sold). Zero-position rows excluded; empty → null.
const t = (b: number, s: number) => ({ shares_bought: b, shares_sold: s })

describe('avgShareSize', () => {
  it('empty set → null (em-dash downstream, never 0/NaN)', () => {
    expect(avgShareSize([])).toBeNull()
  })

  it('a closed trade → its position size', () => {
    expect(avgShareSize([t(100, 100)])).toBe(100)
  })

  it('uses max(legs), NOT (bought+sold)/2 — proves the convention', () => {
    // bought 100, sold 80 → max = 100 (not 90)
    expect(avgShareSize([t(100, 80)])).toBe(100)
  })

  it('mean of per-trade position sizes', () => {
    expect(avgShareSize([t(100, 100), t(300, 300)])).toBe(200)
  })

  it('zero-position rows are filtered out', () => {
    expect(avgShareSize([t(0, 0)])).toBeNull()
    expect(avgShareSize([t(100, 100), t(0, 0)])).toBe(100) // not 50
  })
})
