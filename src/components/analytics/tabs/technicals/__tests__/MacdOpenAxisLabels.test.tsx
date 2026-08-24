// @vitest-environment jsdom
// v0.2.7 — G5/G8: the open/closed axis reaches the surface.
//
// R3 — the four headers carry NO direction glyphs. The rising/falling axis
// earned its arrows because it described a direction of travel; open/closed
// is a STATE, and an arrow on a state is decoration pretending to be meaning.
// R6 — the exclusion chip stops saying "no prior bar": that named the
// histogram's missing predecessor, which this axis no longer consults. What
// keeps a trade out of the split now is a signal line that has not settled.

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { computeMacdBuckets } from '@/core/technicals/macdBuckets'
import { makeCompleteSnapshot, makeRow } from '@/test/fixtures/technicals'
import MacdStateGrid from '../MacdStateGrid'
import UnclassifiedChip from '../UnclassifiedChip'

const ROWS = [
  makeRow({ id: 1, technicals: makeCompleteSnapshot({ macd_positive: true, macd_open: true }) }),
  makeRow({ id: 2, technicals: makeCompleteSnapshot({ macd_positive: true, macd_open: false }) }),
  makeRow({ id: 3, technicals: makeCompleteSnapshot({ macd_positive: false, macd_open: true }) }),
  makeRow({ id: 4, technicals: makeCompleteSnapshot({ macd_positive: false, macd_open: false }) }),
]

// ─── G5 ──────────────────────────────────────────────────────────────────────

describe('G5 the grid renders the four open/closed headers, glyph-free', () => {
  it('the exact four strings are present', () => {
    render(
      <MacdStateGrid
        stats={computeMacdBuckets(ROWS, '1m')}
        filteredRows={ROWS}
        timeframe="1m"
      />,
    )
    for (const label of [
      'Positive + Open',
      'Positive + Closed',
      'Negative + Open',
      'Negative + Closed',
    ]) {
      expect(screen.getByText(label), `missing header: ${label}`).toBeTruthy()
    }
  })

  it('no direction glyph survives anywhere in the grid', () => {
    const { container } = render(
      <MacdStateGrid
        stats={computeMacdBuckets(ROWS, '1m')}
        filteredRows={ROWS}
        timeframe="1m"
      />,
    )
    const text = container.textContent ?? ''
    expect(text.includes('▲'), 'an up glyph survived the rename').toBe(false)
    expect(text.includes('▼'), 'a down glyph survived the rename').toBe(false)
    expect(text, 'the old axis wording survived').not.toMatch(/Rising|Falling/)
  })
})

// ─── G8 ──────────────────────────────────────────────────────────────────────

describe('G8 the exclusion chip names the unsettled signal', () => {
  it('the MACD default reason is the new wording', () => {
    render(<UnclassifiedChip count={3} />)
    const el = screen.getByText(/excluded from this split/)
    expect(el.textContent).toContain('signal not settled')
  })

  it('and the split path holds no prior-bar string', () => {
    render(<UnclassifiedChip count={3} />)
    expect(
      screen.getByText(/excluded from this split/).textContent,
      'the prior-bar wording survived in the MACD split path',
    ).not.toMatch(/prior bar/i)
  })

  it('the other sections keep passing their own reason', () => {
    render(<UnclassifiedChip count={2} reason="no vwap data" />)
    expect(screen.getByText(/excluded from this split/).textContent).toContain('no vwap data')
  })
})
