// v0.2.7 — NINE SENTENCE-ONLY CHANGES, AND NOT ONE ROW MOVES.
//
// Beat one hundred eighty-six measured six wording defects and three range
// items against the shipped tree. Every one of them is a claim the product
// makes about its own answer, and every one was measurably wrong or
// unhelpful. This file pins the corrected wording BY LITERAL, and it pins the
// thing that makes a wording beat safe: that nothing here can change a row.
//
// THE ONE STRUCTURAL DECISION, MEASURED RATHER THAN CHOSEN. Offers are
// deduplicated by DISPLAY STRING at the render seam. Entry identity does not
// survive into `ambiguous` — only a display does — and three measurements
// decided the shape:
//   deduping by ask TEXT fixes four of the twenty-four measured cases and
//     leaves twenty, because "clear setup" and "forced trade" are different
//     texts offering the SAME entry;
//   display is NOT identity in general — thirteen displays are shared across
//     kinds on the measured books, "China" being both a country and a region;
//   but across three thousand seven hundred and fifty-three driven runs, the
//     number of runs where a shared-display entry arrived from two different
//     texts is ZERO, with a control that fires on unrestricted displays.
// So on every measured book the merge cannot join two different entries.

import { describe, expect, it } from 'vitest'
import { OFFER_CEILING, countOffers, dedupeOffers, responseLine } from '../queryResponse'
import { emptyFilters } from '../tradesFilter'
import { resolveQuery, type ResolverVocabulary } from '../queryResolver'

const EMPTY_VOCAB = {
  symbols: [], regions: [], countries: [], sectors: [], industries: [],
  playbooks: [], catalystTypes: [], mistakes: [],
} as unknown as ResolverVocabulary

const base = {
  count: 140,
  applied: [] as string[],
  unresolved: [] as string[],
  before: emptyFilters(),
  after: emptyFilters(),
}

describe('SW1 the refusal quotes the FULL PHRASE the trader typed', () => {
  it('a multi-token ask is quoted whole, not by the span that failed', () => {
    const line = responseLine({
      ...base,
      unresolved: ['nrva trdaes'],
      typed: 'show me my nrva trdaes',
    })
    expect(line).toContain('"show me my nrva trdaes"')
    expect(line, 'the failed span leaked instead of the typed sentence').not.toContain(
      '"nrva trdaes"',
    )
  })
  it('and with no typed text supplied the old head is unchanged', () => {
    expect(responseLine({ ...base, unresolved: ['trdaes'] })).toContain('"trdaes"')
  })
})

describe('SW2 two candidates resolving to ONE entry render as ONE chip', () => {
  it('the same display from two different texts collapses', () => {
    const out = dedupeOffers([
      { text: 'clear setup', candidates: ['No clear setup / forced trade'] },
      { text: 'forced trade', candidates: ['No clear setup / forced trade'] },
    ])
    expect(out.flatMap((a) => a.candidates)).toEqual(['No clear setup / forced trade'])
  })
  it('and two genuinely different entries both survive', () => {
    const out = dedupeOffers([
      { text: 'pullback', candidates: ['1-min Pullback', '5-min Pullback'] },
    ])
    expect(out.flatMap((a) => a.candidates)).toEqual(['1-min Pullback', '5-min Pullback'])
  })
})

describe('SW3 a refusal that filtered nothing does not read as a result', () => {
  it('the sentence says what the trader is looking at', () => {
    const line = responseLine({ ...base, unresolved: ['zzz'], typed: 'zzz' })
    expect(line).toContain('this is your whole book')
  })
  it('and STILL carries no count, which was already ruled', () => {
    const line = responseLine({ ...base, unresolved: ['zzz'], typed: 'zzz' })
    expect(line, 'a count leaked into a failure line').not.toMatch(/\d+\s*trades?\b/i)
  })
})

describe('SW4 two different asks do not produce identical sentences', () => {
  it('an ask carrying offers reads differently from one that carries none', () => {
    const withOffers = responseLine({
      ...base,
      count: 28,
      applied: ['showing 1, newest first'],
      limit: 1,
      offers: { shown: 2, total: 2 },
    })
    const without = responseLine({
      ...base,
      count: 28,
      applied: ['showing 1, newest first'],
      limit: 1,
    })
    expect(withOffers).not.toBe(without)
    expect(withOffers).toContain('2')
  })
})

describe('SW5 the offer ceiling is ten and the suppressed count is NAMED', () => {
  it('the constant is exported and is ten', () => {
    expect(OFFER_CEILING).toBe(10)
  })
  it('an ask exceeding the ceiling shows ten and says how many it did not', () => {
    const many = Array.from({ length: 26 }, (_v, i) => 'Entry ' + String(i))
    const out = dedupeOffers([{ text: 'loss', candidates: many }])
    expect(out.flatMap((a) => a.candidates)).toHaveLength(OFFER_CEILING)
    const line = responseLine({
      ...base,
      applied: ['outcome winners'],
      offers: { shown: OFFER_CEILING, total: 26 },
    })
    expect(line, 'a silent truncation is the dishonesty this campaign removes').toContain('16')
  })
})

// SW6 IS RETIRED, NOT DELETED. It pinned that a range on a column holding
// unmeasured rows says how many it skipped -- the item beat one hundred
// eighty-six called U1.
//
// WHY IT WAS REMOVED FROM SCOPE, and this is a measurement, not a change of
// mind. The clause was built and guarded and it fired on ZERO of five
// thousand one hundred and eighty-eight driven runs. The counter was handed
// the rows the page is SHOWING, and those rows have already had their
// unmeasured ones removed by the very filter that removed them; counting
// them among the survivors can only return zero. The count has to be taken
// BEFORE the range filter runs, and the only place holding the rows on both
// sides is tradesFilter, which was outside this beat's cap.
//
// WHO DELIVERS IT: a later beat, with the seam sized for a caller that can
// see the pre-filter rows. Until then the product says nothing about
// coverage, which is honest, rather than carrying a clause no ask can
// produce.
describe('SW6 a range NAMES what it dropped', () => {
  // REVERSED BY BEAT ONE HUNDRED NINETY FIVE. THE OLD ASSERTION, VERBATIM:
  //
  //   describe('SW6 the coverage clause is NOT claimed', () => {
  //     it('a range says nothing about unmeasured rows, because nothing counts them', () => {
  //       const line = responseLine({ ...base, applied: ['float at most 1000000'] })
  //       expect(line).not.toContain('never measured')
  //     })
  //   })
  //
  // BEAT ONE HUNDRED NINETY ONE measured why it could not be built then: the
  // count has to come from the rows BEFORE the filter ran, and no caller held
  // them. BEAT ONE HUNDRED NINETY TWO landed it once the page supplied them.
  // The guard stayed GREEN through that whole landing, because it calls the
  // sentence builder without the field and therefore cannot see the clause --
  // it was never broken, only WRONG about what the product says. THIS beat is
  // the reversing one.
  it('the dropped count is in the sentence', () => {
    const line = responseLine({
      ...base,
      applied: ['float at most 1000000'],
      coverage: [{ skipped: 23, column: 'float' }],
    })
    expect(line).toContain('23')
    expect(line).toContain('never measured')
  })
  it('CONTROL -- a fully covered column still says nothing', () => {
    const line = responseLine({
      ...base,
      applied: ['float at most 1000000'],
      coverage: [{ skipped: 0, column: 'float' }],
    })
    expect(line).not.toContain('never measured')
  })
})

// SW7 IS RETIRED, NOT DELETED. It pinned that a negated ask says how many of
// its rows were never measured -- the item beat one hundred eighty-six
// called U3, whose reproducer is the largest book answering four hundred and
// forty five to "not macd positive" when only six are genuinely negative.
//
// WHY IT WAS REMOVED FROM SCOPE, and it is a DIFFERENT reason from SW6. U3
// was scoped as a range item and it is not one: a MACD exclusion is not a
// range, so a counter reading the range state would never see it however
// many rows it was given. U3 has to be RE-SCOPED as an exclusion item before
// it can be built at all.
//
// WHO DELIVERS IT: the same later beat, re-scoped. The control that used to
// live here -- that a fully covered column says nothing -- is kept below,
// because it still passes and still means something.
describe('SW7 an exclusion NAMES what it kept unmeasured', () => {
  // REVERSED BY BEAT ONE HUNDRED NINETY FIVE. THE OLD ASSERTION, VERBATIM:
  //
  //   describe('SW7 the unknown count on a negated ask is NOT claimed', () => {
  //     it('an exclusion says nothing about unmeasured rows', () => {
  //       const line = responseLine({
  //         ...base,
  //         count: 445,
  //         applied: ['excluding macd positive (1-minute)'],
  //       })
  //       expect(line).not.toContain('never measured')
  //       expect(line).toContain('445 trades')
  //     })
  //   })
  //
  // The reproducer this was written around is the largest book answering four
  // hundred and forty five to a question about a signal it never computed for
  // four hundred and thirty nine of them. BEAT ONE HUNDRED NINETY TWO landed
  // the count; this guard could not see it for the same reason SW6 could not.
  it('the kept-but-unmeasured count is in the sentence, beside the total', () => {
    const line = responseLine({
      ...base,
      count: 445,
      applied: ['excluding macd positive (1-minute)'],
      excluded: { skipped: 439, column: 'macd' },
    })
    expect(line).toContain('445 trades')
    expect(line).toContain('439')
    expect(line).toContain('never measured')
  })
  it('CONTROL -- a fully covered field still says nothing', () => {
    const line = responseLine({
      ...base,
      count: 94,
      applied: ['excluding macd positive (1-minute)'],
      excluded: { skipped: 0, column: 'macd' },
    })
    expect(line).not.toContain('never measured')
    expect(line).toContain('94 trades')
  })
})

describe('SW8 the inclusive bound is explicit in the wording', () => {
  // THE FIRST VERSION OF THIS GUARD WAS DEFECTIVE AND IS RECORDED HERE. It
  // handed responseLine the strings 'avg_buy at least 2' and asserted they
  // came back, which pins nothing: the line echoes what it is given. The
  // wording is built by the RESOLVER, so that is where it must be asserted.
  const r = (q: string) =>
    resolveQuery(q, EMPTY_VOCAB, new Date('2026-06-15T15:00:00'), emptyFilters())
  it('a minimum reads as at least, from the resolver itself', () => {
    expect(r('price over 2').applied).toEqual(['avg_buy at least 2'])
  })
  it('and a maximum reads as at most', () => {
    expect(r('price under 10').applied).toEqual(['avg_buy at most 10'])
  })
  it('and a two-sided range says both', () => {
    expect(r('price 2 to 10').applied).toEqual(['avg_buy at least 2', 'avg_buy at most 10'])
  })
})

describe('SW9 NOTHING HERE CHANGES A ROW', () => {
  // The line is a pure function of what it is handed. If any of the nine
  // reached into the filter layer this would be the assertion that caught it:
  // the same inputs with and without every new field must report the SAME
  // count, because the count is passed IN and never recomputed.
  it('the count is echoed, never recomputed, whatever the new fields say', () => {
    const plain = responseLine({ ...base, count: 17, applied: ['outcome winners'] })
    const dressed = responseLine({
      ...base,
      count: 17,
      applied: ['outcome winners'],
      typed: 'winners',
      offers: { shown: 3, total: 9 },
    })
    expect(plain).toContain('17 trades')
    expect(dressed).toContain('17 trades')
  })
})

describe('SW10 the dedupe precondition -- two KINDS sharing one display', () => {
  // WHY THIS GUARD EXISTS. Beat one hundred eighty-seven proved deduping the
  // chip list by DISPLAY safe by measurement: thirteen displays are shared
  // across kinds on the three measured books, but across three thousand seven
  // hundred and fifty-three runs, ZERO runs saw a shared display arrive from
  // two different texts. That is a fact about THREE BOOKS. A fourth could
  // break it, and a display-only merge would then quietly fold two real
  // choices into one chip.
  //
  // SO THE CURE DOES NOT DEDUPE BY DISPLAY ALONE. Entry identity IS available
  // where `ambiguous` is built -- every vocabulary push site holds the pool
  // entry and its KIND -- so the resolver records display and kind together in
  // a local table that never escapes, and the merge is keyed on BOTH. No
  // exported type changes, and no book can make the merge wrong.
  it('two entries of DIFFERENT kinds sharing a display BOTH survive', () => {
    const out = dedupeOffers(
      [
        { text: 'china', candidates: ['China'] },
        { text: 'cn', candidates: ['China'] },
      ],
      (_display, text) => (text === 'china' ? 1 : 2),
    )
    expect(out.flatMap((a) => a.candidates)).toEqual(['China', 'China'])
  })
  it('and two of the SAME kind still collapse to one', () => {
    const out = dedupeOffers(
      [
        { text: 'clear setup', candidates: ['No clear setup / forced trade'] },
        { text: 'forced trade', candidates: ['No clear setup / forced trade'] },
      ],
      () => 8,
    )
    expect(out.flatMap((a) => a.candidates)).toEqual(['No clear setup / forced trade'])
  })
  it('and with no kind known at all it falls back to display, as before', () => {
    const out = dedupeOffers([
      { text: 'top ten', candidates: ['net P&L', 'gain %'] },
      { text: 'top five', candidates: ['net P&L', 'gain %'] },
    ])
    expect(out.flatMap((a) => a.candidates)).toEqual(['net P&L', 'gain %'])
  })
})

describe('SW11 a duplicate never spends the ceiling', () => {
  // WHY THIS GUARD EXISTS. Beat 189 asked whether the ceiling could ever
  // discard a DISTINCT reading while keeping a DUPLICATE. Reading the code
  // says no -- the dedupe test continues before the ceiling is consulted, so
  // a duplicate never spends ceiling budget. But nothing PINNED that, and an
  // ordering that is only true by reading is one edit away from being false.
  //
  // AND WHAT ACTUALLY MAKES IT SO -- corrected after a plant proved the first
  // reading wrong. It is NOT the order of the two tests: swapping them was
  // planted and reddened NOTHING, because `kept` is incremented only after
  // BOTH tests pass. The property that makes the ceiling honest is that the
  // counter counts ACCEPTED readings, never inspected ones. Either order is
  // safe while that holds, and this guard pins the property rather than the
  // arrangement.
  //
  // THE DISCRIMINATOR: twelve copies of one reading, then a thirteenth that
  // is genuinely different. If duplicates ever spent the ceiling, the
  // distinct one would be discarded and eleven repetitions of the first
  // would be reported as options the trader was not shown -- a truncation
  // notice about nothing.
  it('twelve duplicates do not spend the ceiling and a distinct reading survives', () => {
    const many = Array.from({ length: 12 }, () => 'Revenge trade (after a loss)')
    const out = dedupeOffers([{ text: 'loss', candidates: [...many, 'Traded through max loss'] }])
    expect(out.flatMap((a) => a.candidates)).toEqual([
      'Revenge trade (after a loss)',
      'Traded through max loss',
    ])
  })
  it('and the true total counts readings, not repetitions', () => {
    const many = Array.from({ length: 12 }, () => 'Revenge trade (after a loss)')
    expect(countOffers([{ text: 'loss', candidates: [...many, 'Traded through max loss'] }])).toBe(2)
  })
})
