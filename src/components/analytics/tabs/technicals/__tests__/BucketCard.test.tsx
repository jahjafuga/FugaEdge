import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BucketStats } from '@/core/technicals/macdBuckets'
import BucketCard from '../BucketCard'

// Direct unit tests for the extracted presentational shell (F4 phase 3/3). The
// fdec47d characterization tests cover BucketCard indirectly through
// MacdBucketCard's MACD-specific Records; these exercise its OWN contract with
// SENTINEL tint strings — deliberately NOT MACD-flavored — to prove the seam is
// genuinely palette-agnostic: arbitrary class strings flow through, and isOpen
// selects between them. If a future beat retints the sections or swaps the tint
// mechanism for theme tokens, this file should not need to change.
//
// Standard fireEvent + RTL queries; no fake timers / no userEvent (the card has
// neither). The "—" below is U+2014 EM DASH, byte-identical to the shell +
// format.percent. Same RED-on-first-run discipline as the characterization
// layer: BucketCard already works (fdec47d proves the MACD case), so a RED here
// means the test is wrong, not the component.
const REST_CLASS = 'bg-test-rest-tint'
const ACTIVE_CLASS = 'bg-test-active-tint'

const FULL: BucketStats = {
  n: 12,
  winRate: 0.5,
  netPnl: 170,
  avgWinner: 220,
  avgLoser: -90,
  expectancy: 25,
}
const EMPTY: BucketStats = {
  n: 0,
  winRate: null,
  netPnl: 0,
  avgWinner: null,
  avgLoser: null,
  expectancy: null,
}
const LOW: BucketStats = {
  n: 3,
  winRate: 0.33,
  netPnl: 40,
  avgWinner: 60,
  avgLoser: -20,
  expectancy: null,
}

const base = {
  title: 'Test Title ▲',
  stats: FULL,
  isOpen: false,
  onClick: () => {},
  restTintClass: REST_CLASS,
  activeTintClass: ACTIVE_CLASS,
}

describe('BucketCard — shared shell (direct unit tests)', () => {
  it('renders the title and all six stat rows with percent/signed formatting', () => {
    render(<BucketCard {...base} stats={FULL} />)
    expect(screen.getByText(/Test Title/)).toBeTruthy() // title
    expect(screen.getByText('12')).toBeTruthy() // Trades
    expect(screen.getByText('50%')).toBeTruthy() // Win rate — percent(0.5, 0)
    expect(screen.getByText('+$170.00')).toBeTruthy() // Net P&L — signed(170)
    expect(screen.getByText('+$220.00')).toBeTruthy() // Avg winner — signed(220)
    expect(screen.getByText('-$90.00')).toBeTruthy() // Avg loser — signed(-90)
    expect(screen.getByText('+$25.00')).toBeTruthy() // Expectancy — signed(25)
  })

  it('renders "—" for the four nullable stats and $0.00 net P&L on an empty bucket', () => {
    render(<BucketCard {...base} stats={EMPTY} />)
    // winRate, avgWinner, avgLoser, expectancy all null → four em-dashes.
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.getByText('$0.00')).toBeTruthy() // Net P&L — signed(0)
    expect(screen.getByText('0')).toBeTruthy() // Trades
  })

  it('shows the Low sample badge only when 0 < n < 5', () => {
    const low = render(<BucketCard {...base} stats={LOW} />)
    expect(screen.getByText('Low sample')).toBeTruthy() // n = 3
    low.unmount()

    const full = render(<BucketCard {...base} stats={FULL} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 12 (>= 5)
    full.unmount()

    render(<BucketCard {...base} stats={EMPTY} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 0
  })

  it('closed state: rest tint applied (not active), subtle/hover border, aria-expanded=false', () => {
    render(<BucketCard {...base} isOpen={false} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain(REST_CLASS)
    expect(btn.className).not.toContain(ACTIVE_CLASS)
    expect(btn.className).toContain('border-border-subtle')
    expect(btn.className).toContain('hover:border-gold/40')
    expect(btn.className).not.toContain('border-gold/60')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('open state: active tint applied (not rest), gold/60 border, aria-expanded=true', () => {
    render(<BucketCard {...base} isOpen={true} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain(ACTIVE_CLASS)
    expect(btn.className).not.toContain(REST_CLASS)
    expect(btn.className).toContain('border-gold/60')
    expect(btn.className).not.toContain('hover:border-gold/40')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('fires onClick once per click', () => {
    const onClick = vi.fn()
    render(<BucketCard {...base} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
