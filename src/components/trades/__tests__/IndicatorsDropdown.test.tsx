import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IndicatorsDropdown } from '../ChartTab'

// Tests for §H's 4th (MACD) toggle in the chart's IndicatorsDropdown. The
// dropdown is a pure component (lightweight-charts is a type-only / dynamic import
// in ChartTab, so this import doesn't load the chart lib) — exported from ChartTab
// purely so this can render it in isolation. The ChartTab persistence wiring
// (settingsGet/settingsSave) + the actual pane mount/unmount live in the
// chart-host, which doesn't render under jsdom; those stay manual/visual.

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    tfLabel: '1m',
    showEma9: true,
    showEma20: true,
    showVwap: true,
    showMacd: true,
    onToggleEma9: vi.fn(),
    onToggleEma20: vi.fn(),
    onToggleVwap: vi.fn(),
    onToggleMacd: vi.fn(),
    ...overrides,
  }
  render(<IndicatorsDropdown {...props} />)
  return props
}

const openPanel = () =>
  fireEvent.click(screen.getByRole('button', { name: /Indicators/ }))

describe('IndicatorsDropdown — §H MACD toggle', () => {
  it('renders all four indicator toggles once opened', () => {
    setup()
    openPanel()
    expect(screen.getByRole('button', { name: /9EMA/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /EMA20/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /VWAP/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /MACD/ })).toBeTruthy()
  })

  it('shows the active count as N/4 (all four on → 4/4)', () => {
    setup()
    expect(screen.getByText('4/4')).toBeTruthy()
  })

  it('counts only active toggles (MACD-only → 1/4)', () => {
    setup({ showEma9: false, showEma20: false, showVwap: false, showMacd: true })
    expect(screen.getByText('1/4')).toBeTruthy()
  })

  it('the MACD toggle reflects its active state via aria-pressed', () => {
    setup({ showMacd: false })
    openPanel()
    expect(
      screen.getByRole('button', { name: /MACD/ }).getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('clicking the MACD toggle fires onToggleMacd', () => {
    const props = setup()
    openPanel()
    fireEvent.click(screen.getByRole('button', { name: /MACD/ }))
    expect(props.onToggleMacd).toHaveBeenCalledTimes(1)
  })
})
