// @vitest-environment jsdom
// v0.2.7 — S3: NO TABLE ROW EVER HIDES BENEATH THE FAB.
//
// Edge's disc floats fixed at the viewport's bottom-right; without clearance
// the last row's Net P&L cell sits under it at maximum scroll (the frames
// caught it). The fix is bottom padding INSIDE the table's scroll container,
// at least the FAB's vertical footprint (offset 24 + disc 48 + breathing
// room 16 = 88), so the final row always clears the disc regardless of where
// the card's bottom edge lands. Geometry assertion on the mechanism — jsdom
// has no layout, so the guard pins the inline padding that produces it.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TradesTable from '../TradesTable'
import { EDGE_FAB_CLEARANCE_PX } from '../QueryBubble'
import { makeTrade } from '@/test/fixtures/trade'

vi.mock('@/lib/ipc', () => ({
  ipc: new Proxy({}, { get: () => () => Promise.resolve([]) }),
}))

describe('S3 the scroll container clears the FAB', () => {
  it('inline bottom padding is at least the FAB footprint', () => {
    const noop = (() => Promise.resolve(null)) as never
    render(
      <TradesTable
        trades={[makeTrade({ id: 1 }), makeTrade({ id: 2 })]}
        onSaveNote={noop} onSaveTimeframe={noop} onSavePlaybook={noop}
        onSaveConfidence={noop} onSavePlannedRisk={noop} onSavePlannedStopLoss={noop}
        onSaveFloat={noop} onSaveCatalyst={noop} onSaveCountry={noop}
      />,
    )
    const scroller = screen.getByRole('table').closest('div[style]') as HTMLElement | null
    const pad = scroller ? parseInt(scroller.style.paddingBottom || '0', 10) : 0
    expect(EDGE_FAB_CLEARANCE_PX, 'the clearance constant shrank below the disc').toBeGreaterThanOrEqual(88)
    expect(pad, 'the scroll container has no FAB clearance').toBeGreaterThanOrEqual(EDGE_FAB_CLEARANCE_PX)
  })
})
