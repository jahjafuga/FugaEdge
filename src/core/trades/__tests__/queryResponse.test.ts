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
    expect(out, `a count leaked into a failure line: ${out}`).not.toMatch(/\d+\s*trades?\b/i)
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

// --- G3 (beat seventy: the limit must not be reported as the count) ---------

describe('G3 with a limit active the response names BOTH numbers', () => {
  it('names what matched AND what is shown', () => {
    const out = responseLine({
      count: 28,
      applied: ['outcome losers', 'region China'],
      unresolved: [],
      limit: 10,
    })
    expect(out, `the matched count is missing: ${out}`).toMatch(/\b28\b/)
    expect(out, `the shown count is missing: ${out}`).toMatch(/\b10\b/)
  })

  it('and does NOT present the limit as the match count', () => {
    const out = responseLine({ count: 28, applied: ['outcome losers'], unresolved: [], limit: 10 })
    // "10 trades" would be the lie -- twenty-eight matched, ten are shown.
    expect(out, 'the limit is masquerading as the match count').not.toMatch(/\b10 trades\b/)
    expect(out).toMatch(/\b28 trades\b/)
  })

  it('a limit larger than the match is not announced -- nothing is hidden', () => {
    const out = responseLine({ count: 3, applied: ['outcome losers'], unresolved: [], limit: 10 })
    expect(out).toBe('3 trades - outcome losers')
  })

  it('no limit means the line is exactly what it was before', () => {
    expect(
      responseLine({ count: 140, applied: ['catalyst News / PR'], unresolved: [], limit: null }),
    ).toBe('140 trades - catalyst News / PR')
  })

  it('a limit composes with the ignored clause', () => {
    const out = responseLine({
      count: 28,
      applied: ['outcome losers'],
      unresolved: ['blorp'],
      limit: 10,
    })
    expect(out).toMatch(/28 trades/)
    expect(out).toMatch(/showing 10/)
    expect(out).toMatch(/ignored/)
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

// ─── RW : THE RESPONSE STOPS CONTRADICTING THE STATE ─────────────────────────
//
// The line branched on THIS ASK's applied list and nothing else. So a sentence
// it could not read, typed over a filter already in force, said "nothing was
// filtered" while the header counted a filtered book and the strip named the
// exclusion doing the filtering. Three statements on one screen, two of them
// true. The count was right, the strip was right, and the sentence was wrong.
//
// THE FIX IS WORDING, AND THAT IS NOT A DODGE. "Your filters are unchanged" is
// true whether or not something is in force, so the line needs no knowledge of
// the state to stop lying about it. The alternative -- teaching it the state --
// would mean threading one through from the bubble, and the bubble is out of
// scope this beat. Measured, not preferred: the response has exactly ONE
// caller, so a new parameter is a caller edit, and that decides it.
//
// THE MINIMUM FIXTURE, deliberately. A book rich enough to be realistic can
// mask the very thing under test -- the previous beat's first draft passed for
// the reported case because a second playbook name shadowed the first. The
// contradiction needs exactly two things: a state that IS filtering, and an ask
// that resolves nothing. One region is enough to build both.

import { resolveQuery, type ResolverVocabulary } from '../queryResolver'
import { emptyFilters, isFiltering } from '../tradesFilter'

const RW_NOW = new Date('2026-08-22T15:00:00')

/** The smallest book that can produce the contradiction. One negatable term,
 *  nothing else -- so no second name can shadow anything. */
const MIN: ResolverVocabulary = {
  symbols: [],
  regions: ['USA'],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
}

/** The gibberish ask. Matches nothing in any book, which is the point. */
const NONSENSE = 'qwzzk'

const lineFor = (r: ReturnType<typeof resolveQuery>, count: number) =>
  responseLine({ count, applied: r.applied, unresolved: r.unresolved, limit: r.state.limit })

// ─── RW1 : THE DEFECT ────────────────────────────────────────────────────────

describe('RW1 an unreadable ask never claims nothing is filtered', () => {
  it('driven through the real two-step composition, not a hand-built state', () => {
    // STEP ONE: an ask that actually filters.
    const first = resolveQuery('not usa', MIN, RW_NOW, emptyFilters())
    expect(first.state.excludeRegions, 'step one did not filter, so step two proves nothing').toEqual(['USA'])

    // STEP TWO: an ask it cannot read, composed on top -- exactly what happens
    // when the user types again without clearing.
    const second = resolveQuery(NONSENSE, MIN, RW_NOW, first.state)
    expect(second.applied, 'step two resolved something').toEqual([])
    expect(
      isFiltering(second.state),
      'the composed state is not filtering, so there is no contradiction to catch',
    ).toBe(true)

    const line = lineFor(second, 131)
    expect(
      line,
      `the response said nothing was filtered while the state still excludes a ` +
        `region and the header counts a filtered book: ${line}`,
    ).not.toContain('nothing was filtered')
  })

  it('and it still names what it could not read', () => {
    const first = resolveQuery('not usa', MIN, RW_NOW, emptyFilters())
    const second = resolveQuery(NONSENSE, MIN, RW_NOW, first.state)
    expect(lineFor(second, 131)).toContain(NONSENSE)
  })

  it('and it still carries no count', () => {
    // The original ruling. Nothing resolved means no result set to describe,
    // and that must survive the rewording.
    const first = resolveQuery('not usa', MIN, RW_NOW, emptyFilters())
    const second = resolveQuery(NONSENSE, MIN, RW_NOW, first.state)
    expect(lineFor(second, 131)).not.toMatch(/\d+\s*trades?\b/i)
  })
})

// ─── RW2 : THE DISCRIMINATING COMPANION ──────────────────────────────────────

describe('RW2 an unreadable ask on an EMPTY state still speaks to filters', () => {
  // Without this, RW1 passes for a line that stopped mentioning filters at all
  // -- which would be a different regression wearing the same green.
  it('the state really is empty, and the line still answers', () => {
    const out = resolveQuery(NONSENSE, MIN, RW_NOW, emptyFilters())
    expect(isFiltering(out.state), 'the base was not empty').toBe(false)
    const line = lineFor(out, 140)
    expect(line, 'the line stopped mentioning filters entirely').toMatch(/filter/i)
    expect(line, 'the refused text was dropped').toContain(NONSENSE)
    expect(line, 'a count leaked into a failure line').not.toMatch(/\d+\s*trades?\b/i)
  })
})

// ─── RW3 : A RESOLVED ASK IS UNTOUCHED ───────────────────────────────────────

describe('RW3 a fully resolved ask reports exactly what it applied', () => {
  it('byte-identical to what ships today', () => {
    expect(
      responseLine({ count: 12, applied: ['outcome losers'], unresolved: [] }),
    ).toBe('12 trades - outcome losers')
  })

  it('and the rewording did not leak into the success path', () => {
    const line = responseLine({ count: 12, applied: ['outcome losers'], unresolved: [] })
    expect(line, 'a working query was told its filters were unchanged').not.toMatch(/unchanged/i)
  })
})

// ─── RW4 : PARTIAL IS UNCHANGED — THE RULING IS NOT TOUCHED ──────────────────

describe('RW4 a partly resolved ask still names the ignored text', () => {
  // The partial-application RULING is not this beat's to change: a query that
  // resolves some tokens still applies them. Only the wording of the
  // nothing-resolved branch moves.
  it('the count, the applied list, and the ignored clause', () => {
    expect(
      responseLine({ count: 56, applied: ['outcome losers'], unresolved: ['chinese'] }),
    ).toBe('56 trades - outcome losers (ignored "chinese")')
  })
})

// ─── RW5 : SCOPE GUARD — the two messages stay separate ──────────────────────

describe('RW5 the per-token seam is not absorbed into this line', () => {
  // The bubble has its own message for unmatched text, gated purely on the
  // unresolved list and independent of what applied. It appeared beside a
  // WORKING chip in the reported frame, which is correct behaviour, and it is
  // not this file's to produce.
  it('the response never emits the bubble seam phrase', () => {
    const inputs: Parameters<typeof responseLine>[0][] = [
      { count: 140, applied: [], unresolved: [NONSENSE] },
      { count: 140, applied: [], unresolved: [] },
      { count: 56, applied: ['outcome losers'], unresolved: ['chinese'] },
      { count: 12, applied: ['outcome losers'], unresolved: [] },
    ]
    for (const i of inputs) {
      expect(
        responseLine(i),
        'the two messages were merged -- the bubble seam is per-token and correct',
      ).not.toContain('match anything in this book')
    }
  })
})
