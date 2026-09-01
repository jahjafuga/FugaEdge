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
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TradesFilters from '@/components/trades/TradesFilters'
import { emptyFilters, SCORE_CEILING, type TradesFilterState } from '@/core/trades/tradesFilter'
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
