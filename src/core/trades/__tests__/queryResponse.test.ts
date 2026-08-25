// v0.2.7 — THE RESPONSE LINE TELLS THE TRUTH.
//
// THE DEFECT: three queries that resolved to NOTHING each logged the full book
// count and read as success. The line was built from the live filtered count
// and the applied list and nothing else, so when nothing resolved the draft
// filter matched everything, the count was the whole book, and "one hundred
// forty trades" came back looking like an answer.
//
// The count was never wrong. It was the count of a filter that had not been
// applied, reported as though it had.
//
// THE RULING these guards enforce:
//   Nothing resolved -> NO count at all, and say what could not be read. A
//     number here is the lie; removing it is the fix.
//   Something resolved -> the count and the applied list AS BEFORE, plus what
//     was ignored. A partial answer is still an answer, but the user must be
//     told which half of their sentence was thrown away.
//   Everything resolved -> unchanged from what ships today. No new clause, no
//     new punctuation, nothing for a working query to read around.
//
// PURE per ARCHITECTURE #1: the line was built inline in the bubble component,
// where it could not be tested without mounting a page. It is a string
// function over three values and belongs here.

import { describe, expect, it } from 'vitest'
import { responseLine } from '../queryResponse'

// --- G7 ---------------------------------------------------------------------

describe('G7 nothing resolved -- no count, and name what was not read', () => {
  it('carries NO trade count', () => {
    const out = responseLine({ count: 140, applied: [], unresolved: ['under 10', 'dollars'] })
    // NOT "contains no digit": the line echoes the user's own words back, and
    // those may contain numbers -- "under 10" is exactly such a case, and a
    // sibling guard below REQUIRES that echo. What must never appear is a
    // COUNT: a number the user did not type, presented as a result.
    expect(out, `a count leaked into a failure line: ${out}`).not.toMatch(/\d+\s*trades?/i)
  })

  it('names the unresolved text verbatim', () => {
    const out = responseLine({ count: 140, applied: [], unresolved: ['under 10', 'dollars'] })
    expect(out).toContain('under 10')
    expect(out).toContain('dollars')
  })

  it('never says "trades" -- there is no result set to describe', () => {
    const out = responseLine({ count: 140, applied: [], unresolved: ['blorp'] })
    expect(out).not.toMatch(/\btrades?\b/i)
  })

  it('the full-book count is the specific lie this guard exists to stop', () => {
    const out = responseLine({ count: 140, applied: [], unresolved: ['under 10'] })
    expect(out).not.toContain('140')
  })

  it('nothing resolved AND nothing unresolved (pure filler) still reports no count', () => {
    // "of" is filler now: it neither applies nor comes back as unresolved.
    const out = responseLine({ count: 140, applied: [], unresolved: [] })
    expect(out).not.toMatch(/\d/) // nothing echoed here, so no digit at all is right
    expect(out.length, 'a silent empty string reads as a hang').toBeGreaterThan(0)
  })
})

// --- G8 ---------------------------------------------------------------------

describe('G8 partly resolved -- count, what applied, AND what was ignored', () => {
  const out = responseLine({
    count: 12,
    applied: ['region USA', 'losers'],
    unresolved: ['under 10', 'dollars'],
  })

  it('carries the count', () => {
    expect(out).toContain('12')
    expect(out).toMatch(/\b12 trades\b/)
  })

  it('carries the applied list', () => {
    expect(out).toContain('region USA')
    expect(out).toContain('losers')
  })

  it('AND names what was ignored', () => {
    expect(out, `the ignored half is silent: ${out}`).toMatch(/ignored/i)
    expect(out).toContain('under 10')
    expect(out).toContain('dollars')
  })

  it('a single trade reads singular', () => {
    const one = responseLine({ count: 1, applied: ['losers'], unresolved: ['zzz'] })
    expect(one).toMatch(/\b1 trade\b/)
    expect(one).not.toMatch(/\b1 trades\b/)
  })
})

// --- G9 ---------------------------------------------------------------------

describe('G9 fully resolved -- byte-identical to what ships today', () => {
  it('count plus applied list, and NO ignored clause', () => {
    const out = responseLine({ count: 140, applied: ['catalyst News / PR'], unresolved: [] })
    expect(out).toBe('140 trades - catalyst News / PR')
  })

  it('singular, exactly as before', () => {
    const out = responseLine({ count: 1, applied: ['region China', 'losers'], unresolved: [] })
    expect(out).toBe('1 trade - region China, losers')
  })

  it('the word ignored never appears when nothing was ignored', () => {
    const out = responseLine({ count: 9, applied: ['losers'], unresolved: [] })
    expect(out).not.toMatch(/ignored/i)
  })
})
