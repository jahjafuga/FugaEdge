import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UnclassifiedChip from '../UnclassifiedChip'

// Locks the per-section exclusion-chip copy added in the visual-settle pass: the
// reason is section-specific (VWAP / EMA carry their own axis wording) and
// defaults to MACD's §A3 first-bar text so its call site stays unchanged.
describe('UnclassifiedChip', () => {
  it('renders the count + the default (MACD) reason', () => {
    render(<UnclassifiedChip count={3} />)
    expect(
      screen.getByText('3 excluded from this split (no prior bar)'),
    ).toBeTruthy()
  })

  it('renders a section-specific reason when provided', () => {
    render(<UnclassifiedChip count={2} reason="no vwap data" />)
    expect(
      screen.getByText('2 excluded from this split (no vwap data)'),
    ).toBeTruthy()
  })

  it('renders nothing at count 0', () => {
    const { container } = render(
      <UnclassifiedChip count={0} reason="no 9 ema data" />,
    )
    expect(container.firstChild).toBeNull()
  })
})
