// @vitest-environment jsdom
// BEAT 242 — THE SCORE ROW IS DERIVED FROM THE CEILING, NOT TYPED BESIDE IT.
//
// The pillar ceiling was written in three independent places: the resolver, so
// a spoken score above it could be refused; the filter preferences, so a stored
// one could be rejected; and this panel, as five literal buttons. Three copies
// of one fact, agreeing only because someone typed the same digit three times.
//
// The panel's copy was the quiet one. It validates nothing, so nothing would
// have failed if it drifted — the trader would simply have been offered a
// button the filter rejects, or denied one it accepts, with no error anywhere.
//
// These cases REFERENCE SCORE_CEILING rather than the digit. Written against a
// literal they would pass whether the row were derived or hardcoded, which is
// exactly the vacuity that let three copies exist in the first place.
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TradesFilters from '@/components/trades/TradesFilters'
import {
  filterPrefsKey,
  readTradesFilters,
  TRADES_FILTER_PREFS_VERSION,
} from '@/lib/prefs/tradesFilters'
import {
  emptyFilters,
  SCORE_CEILING,
  type DnaFilterAsk,
  type TradesFilterState,
} from '@/core/trades/tradesFilter'
import { makeTrade } from '@/test/fixtures/trade'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

const BOOK: TradeListRow[] = [makeTrade({ id: 1, symbol: 'HLPX', net_pnl: 10 })]

function openDnaPanel() {
  const state: TradesFilterState = emptyFilters()
  render(<TradesFilters filters={state} onChange={vi.fn()} trades={BOOK} />)
  // The panel is behind its own trigger; the buttons do not exist until it
  // opens. fireEvent, not a raw DOM .click(), so React's synthetic handler
  // actually runs -- the raw call left the panel shut and the first draft of
  // this guard failed on its own harness rather than on the product.
  fireEvent.click(screen.getByTitle('Filter by DNA score'))
}

/** Every score button, in DOM order. They are labelled "Score at least N". */
function scoreButtons(): HTMLElement[] {
  return screen.getAllByLabelText(/^Score at least \d+$/)
}

describe('F11 the score row is exactly as tall as the ceiling', () => {
  it('renders exactly SCORE_CEILING buttons', () => {
    openDnaPanel()
    expect(
      scoreButtons().length,
      'the row does not follow the ceiling',
    ).toBe(SCORE_CEILING)
  })

  it('F11b the highest button IS the ceiling', () => {
    openDnaPanel()
    const labels = scoreButtons().map((b) => b.getAttribute('aria-label'))
    expect(labels[labels.length - 1]).toBe(`Score at least ${SCORE_CEILING}`)
  })

  it('F11c CONTROL: each button is its own position, one indexed', () => {
    // Without this, F11 and F11b would pass on a row that rendered the right
    // COUNT with the wrong VALUES — five buttons all reading "1", say.
    openDnaPanel()
    const labels = scoreButtons().map((b) => b.getAttribute('aria-label'))
    expect(labels).toEqual(
      Array.from({ length: SCORE_CEILING }, (_, i) => `Score at least ${i + 1}`),
    )
  })
})

// ─── K : THE UPPER BOUND REACHES THE PANEL ──────────────────────────────────
//
// R311: a vocabulary entry may not set a value the owning panel cannot display
// and clear. The resolver learned maxScore two beats ago and the preference
// layer this one, which left the panel as the only place the field existed
// without a way to see it or turn it off -- a filter a trader could arrive at
// by typing and then not find, which is the shape R311 is written against.

/** A CONTROLLED panel: clicks actually land, so a case can look at the result
 *  rather than at the argument a spy was handed. */
function Controlled({ dna }: { dna?: Partial<DnaFilterAsk> }) {
  const [state, setState] = useState<TradesFilterState>({
    ...emptyFilters(),
    dna: { minScore: null, maxScore: null, bucket: 'any', ...dna },
  })
  return <TradesFilters filters={state} onChange={setState} trades={BOOK} />
}

function openControlled(dna?: Partial<DnaFilterAsk>) {
  render(<Controlled dna={dna} />)
  fireEvent.click(screen.getByTitle('Filter by DNA score'))
}

/** The max buttons, labelled to mirror the min row. */
function maxButtons(): HTMLElement[] {
  return screen.getAllByLabelText(/^Score at most \d+$/)
}

/** The badge on the trigger. Absent entirely when the ask is empty. */
function badge(): string | null {
  const trigger = screen.getByTitle('Filter by DNA score')
  const el = trigger.querySelector('span')
  return el ? (el.textContent ?? '') : null
}

describe('K the ceiling is displayable and clearable, not just typeable', () => {
  it('K1 a lone MAX makes the ask active and counts as one', () => {
    // WITHOUT THIS the panel reads a max-only ask as empty: no badge, no lit
    // border, and no Clear row -- the ask is on and the panel says it is off.
    openControlled({ maxScore: 3 })
    expect(badge(), 'a max-only ask did not register as active').toBe('1')
  })

  it('K1b both bounds together count as two, not one', () => {
    openControlled({ minScore: 2, maxScore: 4 })
    expect(badge(), 'the two bounds were counted as one filter').toBe('2')
  })

  it('K2 Clear DNA resets the ceiling as well as the floor', () => {
    // THE R311 HALF THAT MATTERS MOST. A value that can be set and not unset
    // is worse than one that cannot be set at all: the trader is looking at a
    // filtered table with no visible cause and no way back.
    openControlled({ minScore: 2, maxScore: 4 })
    fireEvent.click(screen.getByText('Clear DNA'))
    expect(badge(), 'something survived Clear DNA').toBeNull()
    // THE BADGE ALONE IS NOT ENOUGH, and the first draft of this case proved
    // it by passing against the uncured panel. Clear rebuilt the ask as
    // { minScore, bucket } and dropped maxScore off the object; `active` did
    // not read the field either, so the badge went dark and the case went
    // green while the panel was blind to the ceiling in BOTH places at once.
    // Reading the buttons back closes that: a surviving ceiling is visible
    // whether or not the badge notices it.
    //
    // NO RE-CLICK ON THE TRIGGER HERE. Clear DNA does not close the panel --
    // it has no setOpen(false) -- so the trigger is a TOGGLE and clicking it
    // shut the panel instead of reopening it. That put this case red on its
    // own harness rather than on the product, which is a different fault from
    // the one it is written to catch.
    const pressed = [...scoreButtons(), ...maxButtons()].filter(
      (b) => b.getAttribute('aria-pressed') === 'true',
    )
    expect(pressed.map((b) => b.getAttribute('aria-label')), 'a bound survived Clear DNA').toEqual([])
  })

  it('K3 the max row is exactly as tall as the ceiling, one indexed', () => {
    openControlled()
    expect(maxButtons().map((b) => b.getAttribute('aria-label'))).toEqual(
      Array.from({ length: SCORE_CEILING }, (_, i) => `Score at most ${i + 1}`),
    )
  })

  it('K4 a floor set ABOVE a standing ceiling clears the ceiling', () => {
    // SATISFIABILITY, THE PANEL'S VERSION. The resolver can refuse a
    // contradictory pair in a sentence; the panel has nowhere to say one, so
    // it keeps the ask satisfiable instead -- the same move setBucket already
    // makes when an incomplete bucket meets a score bar. Clearing the other
    // bound is VISIBLE: the button goes dark. Clamping would be silent.
    openControlled({ maxScore: 2 })
    fireEvent.click(screen.getByLabelText('Score at least 4'))
    expect(
      maxButtons().filter((b) => b.getAttribute('aria-pressed') === 'true'),
      'the panel is holding an ask no trade can satisfy',
    ).toEqual([])
    expect(badge(), 'the floor did not take').toBe('1')
  })

  it('K4b CONTROL: an EQUAL pair is satisfiable and both stay lit', () => {
    // "at least 4, at most 4" means exactly four passed. Without this K4
    // would pass on a rule that cleared the other bound on every pair.
    openControlled({ maxScore: 4 })
    fireEvent.click(screen.getByLabelText('Score at least 4'))
    expect(badge(), 'an equal pair was treated as a contradiction').toBe('2')
  })
})

describe('M7 what the reader recovers is a state the panel can express', () => {
  // R311 FROM THE STORAGE SIDE. The rule says a vocabulary entry may not set
  // a value the owning panel cannot display and clear; a stored blob can set
  // one just as easily, and arrives without any sentence being spoken.
  //
  // ASSERTED BY RENDERING, not by comparing against a literal I hoped for. A
  // hand-written expectation would only prove the cross-check does what I
  // wrote it to do. Feeding the recovered state to the real panel and reading
  // the buttons back proves the panel can actually show it and turn it off.
  const recover = (dna: Record<string, unknown>) => {
    localStorage.setItem(
      filterPrefsKey('all'),
      JSON.stringify({ v: TRADES_FILTER_PREFS_VERSION, state: { dna } }),
    )
    return readTradesFilters('all')
  }

  it('the recovered state renders, and every lit button matches it', () => {
    const state = recover({ bucket: 'incomplete', minScore: 3, maxScore: 4 })
    render(<TradesFilters filters={state} onChange={vi.fn()} trades={BOOK} />)
    fireEvent.click(screen.getByTitle('Filter by DNA score'))
    const lit = (re: RegExp) =>
      screen
        .getAllByLabelText(re)
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
        .map((b) => b.getAttribute('aria-label'))
    // WHAT THE PANEL SHOWS IS WHAT THE READER RETURNED -- in both directions,
    // so neither a lit button without a value nor a value without a lit
    // button can hide here.
    expect(lit(/^Score at least \d+$/)).toEqual(
      state.dna.minScore === null ? [] : [`Score at least ${state.dna.minScore}`],
    )
    expect(lit(/^Score at most \d+$/)).toEqual(
      state.dna.maxScore === null ? [] : [`Score at most ${state.dna.maxScore}`],
    )
    // and the state is not one the resolver would have refused
    const d = state.dna
    expect(
      (d.minScore !== null && d.maxScore !== null && d.minScore > d.maxScore) ||
        (d.bucket === 'incomplete' && (d.minScore !== null || d.maxScore !== null)),
      `the panel is showing a contradiction: ${JSON.stringify(d)}`,
    ).toBe(false)
  })

  it('and the panel can CLEAR whatever it recovered', () => {
    // The other half of R311. A value that can arrive and not be dismissed
    // leaves a filtered table with no visible cause and no way back.
    const state = recover({ bucket: 'incomplete', minScore: 3, maxScore: 4 })
    const Controlled2 = () => {
      const [s, setS] = useState(state)
      return <TradesFilters filters={s} onChange={setS} trades={BOOK} />
    }
    render(<Controlled2 />)
    fireEvent.click(screen.getByTitle('Filter by DNA score'))
    const clear = screen.queryByText('Clear DNA')
    if (clear) fireEvent.click(clear)
    const trigger = screen.getByTitle('Filter by DNA score')
    expect(trigger.querySelector('span'), 'something survived, or could not be cleared').toBeNull()
  })
})
