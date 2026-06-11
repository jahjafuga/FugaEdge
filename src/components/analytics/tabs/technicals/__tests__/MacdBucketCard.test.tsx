import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BucketStats } from '@/core/technicals/macdBuckets'
import MacdBucketCard from '../MacdBucketCard'

// Characterization tests (F4 phase 1/3) — lock the CURRENT externally observable
// behavior of MacdBucketCard before the BucketCard shell extraction (phase 2/3).
// Assertions hit only the public contract: rendered stat text (percent/signed
// formatting + the "—" null fallbacks), the Low sample badge boundary, the
// aria-expanded mirror of isOpen, the isOpen-conditional tint + border classes
// (the exact strings phase 2 relocates into BucketCard), and onClick firing.
// NEVER the TINT_BG constants, the StatRow subcomponent, or the static chrome.
//
// Standard fireEvent + RTL queries — the card has no timers, so (unlike the
// MacdStateGrid suite) there are no fake timers here; userEvent stays banned by
// the established convention regardless. These tests must pass UNCHANGED through
// phase 2: MacdBucketCard keeps its public props (tint enum in, resolved classes
// out) while delegating render to the extracted BucketCard.
//
// No BucketStats factory exists (src/test/fixtures/technicals.ts builds rows /
// snapshots, not stats, and the card consumes BucketStats directly) — stats are
// inlined literals so every formatted-output assertion is exact and self-evident.
// The "—" below is U+2014 EM DASH, byte-identical to the card + format.percent.
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
  title: 'Positive + Rising ▲',
  tint: 'pos-rising' as const,
  stats: FULL,
  isOpen: false,
  onClick: () => {},
}

describe('MacdBucketCard — presentational card (characterization)', () => {
  it('renders the title and all six stat rows with percent/signed formatting', () => {
    render(<MacdBucketCard {...base} stats={FULL} />)
    expect(screen.getByText(/Positive \+ Rising/)).toBeTruthy() // title
    expect(screen.getByText('12')).toBeTruthy() // Trades
    expect(screen.getByText('50%')).toBeTruthy() // Win rate — percent(0.5, 0)
    expect(screen.getByText('+$170.00')).toBeTruthy() // Net P&L — signed(170)
    expect(screen.getByText('+$220.00')).toBeTruthy() // Avg winner — signed(220)
    expect(screen.getByText('-$90.00')).toBeTruthy() // Avg loser — signed(-90)
    expect(screen.getByText('+$25.00')).toBeTruthy() // Expectancy — signed(25)
  })

  it('renders "—" for the four nullable stats and $0.00 net P&L on an empty bucket', () => {
    render(<MacdBucketCard {...base} stats={EMPTY} />)
    // winRate, avgWinner, avgLoser, expectancy all null → four em-dashes.
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.getByText('$0.00')).toBeTruthy() // Net P&L — signed(0)
    expect(screen.getByText('0')).toBeTruthy() // Trades
  })

  it('shows the Low sample badge only when 0 < n < 5', () => {
    const low = render(<MacdBucketCard {...base} stats={LOW} />)
    expect(screen.getByText('Low sample')).toBeTruthy() // n = 3
    low.unmount()

    const full = render(<MacdBucketCard {...base} stats={FULL} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 12 (>= 5)
    full.unmount()

    render(<MacdBucketCard {...base} stats={EMPTY} />)
    expect(screen.queryByText('Low sample')).toBeNull() // n = 0
  })

  it('closed state: rest tint + subtle/hover border, aria-expanded=false', () => {
    render(<MacdBucketCard {...base} tint="pos-rising" isOpen={false} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-macd-pos-rising/[0.12]')
    expect(btn.className).toContain('border-border-subtle')
    expect(btn.className).toContain('hover:border-gold/40')
    expect(btn.className).not.toContain('bg-macd-pos-rising/[0.18]')
    expect(btn.className).not.toContain('border-gold/60')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('open state: active tint + gold/60 border, aria-expanded=true', () => {
    render(<MacdBucketCard {...base} tint="pos-rising" isOpen={true} />)
    const btn = screen.getByRole('button')
    expect(btn.className).toContain('bg-macd-pos-rising/[0.18]')
    expect(btn.className).toContain('border-gold/60')
    expect(btn.className).not.toContain('bg-macd-pos-rising/[0.12]')
    expect(btn.className).not.toContain('hover:border-gold/40')
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('fires onClick once per click', () => {
    const onClick = vi.fn()
    render(<MacdBucketCard {...base} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
