import { describe, expect, it } from 'vitest'
import { deriveFeesUnavailable } from '../feesUnavailable'

// Only fees_reported matters to the rule.
const reported = { fees_reported: true }
const notReported = { fees_reported: false }

describe('deriveFeesUnavailable', () => {
  it('is FALSE when execs present, no fee file, but trips report inline fees (Lightspeed)', () => {
    // The bug: fees ARE captured inline, so the banner must stay silent.
    expect(deriveFeesUnavailable(true, false, [reported, notReported])).toBe(false)
  })

  it('is TRUE when execs present, no fee file, and no trip reports fees (ThinkorSwim)', () => {
    expect(deriveFeesUnavailable(true, false, [notReported, notReported])).toBe(true)
  })

  it('is FALSE when a companion fee file is also present (DAS two-file)', () => {
    expect(deriveFeesUnavailable(true, true, [notReported])).toBe(false)
  })

  it('is TRUE when execs present, no fee file, and there are no trips', () => {
    expect(deriveFeesUnavailable(true, false, [])).toBe(true)
  })
})
