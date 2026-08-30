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

    // REWRITTEN BY BEAT ONE HUNDRED EIGHTY-NINE. WAS:
    //   .not.toContain('nothing was filtered')
    // which forbade a string this file has not emitted since the wording it
    // names was retired. It could not fail, so it guarded nothing.
    //
    // THE DISTINCTION IT WAS FOR IS REAL AND IS NOW ASSERTED DIRECTLY. When
    // the composed state IS still filtering, the line must say so; the
    // whole-book sentence is for the case where nothing is in force.
    // CORRECTED: this helper does not hand the line the before and after
    // state, and a line that was not SHOWN the state makes no claim about it
    // -- that is the discipline written at the top of the file. So the
    // property to pin is that it makes NO false claim either way, and in
    // particular does not call a filtered book the whole book.
    const line = lineFor(second, 131)
    expect(
      line,
      `the line called a filtered book the whole book: ${line}`,
    ).not.toContain('this is your whole book')
    expect(line, `the line claimed a state it was never shown: ${line}`).not.toMatch(
      /unchanged/i,
    )
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

describe('RW2 with NO state supplied the line makes no claim about the state', () => {
  // INVERTED IN PLACE. The old assertion is kept verbatim here rather than
  // deleted, because it encoded a design this beat replaced:
  //
  //     it('the state really is empty, and the line still answers', ...)
  //       expect(line, 'the line stopped mentioning filters entirely')
  //         .toMatch(/filter/i)
  //
  // That was right while ONE wording had to serve every path: the line always
  // spoke of filters because it could not tell the paths apart. It can now,
  // and the price is a caller who supplies the states. A caller who does NOT
  // has shown the line nothing, so the line says nothing about it -- the same
  // discipline as refusing to print a count with no result set behind it.
  // `lineFor` deliberately omits them, which is what this case now pins, and
  // RX4 is its companion: WITH the states, the line speaks and speaks truly.
  it('it answers, names the refused text, and claims nothing it cannot see', () => {
    const out = resolveQuery(NONSENSE, MIN, RW_NOW, emptyFilters())
    expect(isFiltering(out.state), 'the base was not empty').toBe(false)
    const line = lineFor(out, 140)
    expect(line, 'the line described a state it was never shown').not.toMatch(/filter|unchanged/i)
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
  it('the response names what it could not read in ITS OWN words', () => {
    // RETIRED AND REPLACED BY BEAT ONE HUNDRED EIGHTY-NINE. WAS:
    //   .not.toContain('match anything in this book')
    // The forbidden phrase belongs to QueryBubble, a component this file
    // cannot reach, so responseLine could never emit it and the assertion
    // could never fail. Forbidding a string from a module that does not own
    // it is not a scope guard, it is a coincidence.
    //
    // WHAT THE SCOPE GUARD IS ACTUALLY FOR: the two messages stay separate
    // because each says the unread text in its own voice. That is asserted
    // positively -- this line quotes what it could not read, and the bubble
    // lists the tokens beneath it.
    const refusal = responseLine({ count: 140, applied: [], unresolved: [NONSENSE] })
    expect(refusal).toContain('could not read')
    const partial = responseLine({
      count: 56,
      applied: ['outcome losers'],
      unresolved: ['chinese'],
    })
    expect(partial).toContain('ignored')
    expect(partial).toContain('chinese')
  })
})

// ─── RX : THE RESPONSE TELLS THE TRUTH ON EVERY PATH ─────────────────────────
//
// The previous beat reworded this line to stop it claiming nothing was filtered
// while something was. That fixed the reported case and was FALSE on a path it
// did not test. Measured: ask for a region, then ask against the same region.
// The resolver cancels both sides -- a documented behaviour, not touched here --
// so the state goes from filtering to empty, the ask records nothing applied,
// and the line said the filters were unchanged. They had just been wiped.
//
// THE OLD WORDING WAS TRUE THERE AND FALSE ELSEWHERE; the new one was the exact
// reverse. Neither is sufficient, because both are claims about the STATE made
// from a value that only describes the ASK. The line has to see the state to
// speak about it, and now it does: the caller hands it the state the ask
// composed ON and the state the ask produced.
//
// AND A WIPE IS REPORTED. A filter the user set disappearing without a word is
// the mirror of the invisible exclusion an earlier beat cured -- same disease,
// opposite direction.
//
// WITHOUT THE STATES, NO CLAIM. When the caller supplies neither, the line says
// what it could not read and stops. That is the discipline this file was built
// on: it refuses to print a number when no result set is behind it, and it now
// refuses to describe a state it was not shown.

// resolveQuery, ResolverVocabulary, isFiltering and emptyFilters are already
// imported above by the previous block in this file.

const RX_NOW = new Date('2026-08-22T15:00:00')

/** The minimum book that reaches all three paths: one term to ask for and
 *  against, and nothing else that could shadow it. */
const RX_BOOK: ResolverVocabulary = {
  symbols: [],
  regions: ['China'],
  countries: [],
  sectors: [],
  industries: [],
  playbooks: [],
  catalystTypes: [],
  mistakes: [],
}
const RX_NONSENSE = 'qwzzk'

/** The real two-step composition, not a hand-built state. */
function compose(first: string, second: string) {
  const a = resolveQuery(first, RX_BOOK, RX_NOW, emptyFilters())
  const b = resolveQuery(second, RX_BOOK, RX_NOW, a.state)
  return { a, b }
}
const lineOf = (a: ReturnType<typeof resolveQuery>, b: ReturnType<typeof resolveQuery>) =>
  responseLine({
    count: 0,
    applied: b.applied,
    unresolved: b.unresolved,
    limit: b.state.limit,
    before: a.state,
    after: b.state,
  })

// ─── RX1 : THE CLASH PATH ────────────────────────────────────────────────────

describe('RX1 an ask that WIPES a filter does not call it unchanged', () => {
  it('the premise: the clash really does empty both sides', () => {
    const { a, b } = compose('china', 'not china')
    expect(a.state.regions, 'step one did not filter').toEqual(['China'])
    expect(isFiltering(a.state)).toBe(true)
    expect(b.state.regions, 'the clash did not cancel the include side').toEqual([])
    expect(b.state.excludeRegions, 'the clash did not cancel the exclude side').toEqual([])
    expect(isFiltering(b.state), 'the state is still filtering, so nothing was wiped').toBe(false)
    expect(b.applied, 'the ask recorded something, so this is not the nothing-applied branch').toEqual([])
  })

  it('and the line does not claim the filters are unchanged', () => {
    const { a, b } = compose('china', 'not china')
    const line = lineOf(a, b)
    expect(
      line,
      `the filters went from filtering to empty and the line called that ` +
        `unchanged: ${line}`,
    ).not.toMatch(/unchanged/i)
  })

  it('and it says plainly that nothing is in force, which here is true', () => {
    // REWRITTEN BY BEAT ONE HUNDRED EIGHTY-NINE. WAS:
    //   .not.toContain('nothing was filtered')
    // a string this file cannot emit, so the assertion could not fail.
    //
    // The state here went from filtering to empty, so the honest sentence is
    // the whole-book one -- and that IS what the line must now say. The
    // sibling above already forbids the word unchanged on this path, so the
    // pair still redden different sets, which was the point.
    // CORRECTED: this path takes the DROPPED-VALUES branch and returns
    // before the whole-book sentence is reached, which is right -- the most
    // specific true thing is that a value was asked for and against. That is
    // what it must say, and it must still not say unchanged.
    const { a, b } = compose('china', 'not china')
    const line = lineOf(a, b)
    expect(line).toContain('which you asked for and against')
    expect(line, `the line called a wiped filter unchanged: ${line}`).not.toMatch(/unchanged/i)
  })
})

// ─── RX2 : THE WIPE IS NAMED ─────────────────────────────────────────────────

describe('RX2 the user is told WHAT was removed', () => {
  it('the removed value appears in the line', () => {
    const { a, b } = compose('china', 'not china')
    expect(
      lineOf(a, b),
      'a filter the user set vanished without a word -- the mirror of an ' +
        'invisible filter, and the same disease',
    ).toContain('China')
  })

  it('and the line says it was REMOVED rather than merely mentioning it', () => {
    const { a, b } = compose('china', 'not china')
    expect(lineOf(a, b)).toMatch(/dropped|removed/i)
  })
})

// ─── RX3 : REFUSAL WITH A LIVE FILTER — the previous beat's case ─────────────

describe('RX3 an unreadable ask over a live filter still says unchanged', () => {
  it('because there they are', () => {
    const { a, b } = compose('china', RX_NONSENSE)
    expect(a.state.regions).toEqual(['China'])
    expect(b.state.regions, 'the filter did not survive, so this is a different path').toEqual(['China'])
    expect(isFiltering(b.state)).toBe(true)
    const line = lineOf(a, b)
    expect(line, 'the previous beat\'s fix regressed').toMatch(/unchanged/i)
    expect(line, 'the refused text was dropped').toContain(RX_NONSENSE)
    expect(line, 'a count leaked into a failure line').not.toMatch(/\d+\s*trades?\b/i)
  })
})

// ─── RX4 : REFUSAL WITH NOTHING IN FORCE ─────────────────────────────────────

describe('RX4 an unreadable ask with no filters says something true for that user', () => {
  it('not that filters are unchanged -- there are none to be unchanged', () => {
    const before = emptyFilters()
    const b = resolveQuery(RX_NONSENSE, RX_BOOK, RX_NOW, before)
    expect(isFiltering(b.state), 'the base was not empty').toBe(false)
    const line = responseLine({
      count: 0, applied: b.applied, unresolved: b.unresolved,
      limit: b.state.limit, before, after: b.state,
    })
    expect(line, 'the line still speaks of filters existing').not.toMatch(/unchanged/i)
    expect(line, 'the line stopped speaking to filtering at all').toMatch(/filter/i)
    expect(line).toContain(RX_NONSENSE)
  })
})

// ─── RX5 : A RESOLVED ASK IS UNTOUCHED ───────────────────────────────────────

describe('RX5 a fully resolved ask reports exactly what it applied', () => {
  it('byte-identical, with or without the states supplied', () => {
    const withOut = responseLine({ count: 12, applied: ['outcome losers'], unresolved: [] })
    expect(withOut).toBe('12 trades - outcome losers')
    const withStates = responseLine({
      count: 12, applied: ['outcome losers'], unresolved: [],
      before: emptyFilters(), after: { ...emptyFilters(), outcome: 'losers' },
    })
    expect(withStates, 'the states leaked into the success path').toBe('12 trades - outcome losers')
  })

  it('and the partial line is unchanged -- the ruling is not touched', () => {
    expect(
      responseLine({ count: 56, applied: ['outcome losers'], unresolved: ['chinese'] }),
    ).toBe('56 trades - outcome losers (ignored "chinese")')
  })
})

// ─── RX6 : SCOPE GUARD — the two messages stay separate ──────────────────────

describe('RX6 the per-token seam is not absorbed into this line', () => {
  it('every path says its own piece and none reaches for the other', () => {
    // RETIRED AND REPLACED BY BEAT ONE HUNDRED EIGHTY-NINE, same reason as
    // its sibling above: the forbidden phrase belongs to QueryBubble and this
    // file cannot emit it on any path, so the assertion could not fail.
    //
    // Replaced by the property that actually matters: every path produces a
    // NON-EMPTY sentence, and a path with unread text names it.
    const { a, b } = compose('china', 'not china')
    const lines = [
      lineOf(a, b),
      responseLine({ count: 0, applied: [], unresolved: [RX_NONSENSE] }),
      responseLine({ count: 0, applied: [], unresolved: [] }),
      responseLine({ count: 56, applied: ['outcome losers'], unresolved: ['chinese'] }),
      responseLine({ count: 12, applied: ['outcome losers'], unresolved: [] }),
    ]
    for (const l of lines) {
      expect(l, 'a path produced no sentence at all').not.toBe('')
    }
    expect(
      responseLine({ count: 0, applied: [], unresolved: [RX_NONSENSE] }),
      'a refusal did not name what it could not read',
    ).toContain(RX_NONSENSE)
  })
})

// ─── RX7 : SCOPE GUARD — the CLASH LOGIC is unchanged ───────────────────────

describe('RX7 the clash behaviour is made honest, not different', () => {
  // The wipe may or may not be the right behaviour. That is a separate ruling
  // and this beat does not make it -- so the STATE the clash produces is pinned
  // exactly as it is today.
  it('the same two-step input yields the same state', () => {
    const { b } = compose('china', 'not china')
    expect(b.state.regions).toEqual([])
    expect(b.state.excludeRegions).toEqual([])
    expect(b.applied).toEqual([])
    expect(
      b.ambiguous,
      'the clash stopped offering the choice it has always offered',
    ).toEqual([{ text: 'China', candidates: ['include China', 'exclude China'] }])
  })
})
