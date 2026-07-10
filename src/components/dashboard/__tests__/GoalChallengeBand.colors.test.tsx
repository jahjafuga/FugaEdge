import { render, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GoalChallengeBand from '@/components/dashboard/GoalChallengeBand'
import { ipc } from '@/lib/ipc'

// Renderer-style test (no jest-dom — className / textContent assertions, per the
// Settings + NoTradeDayModal tests). Covers Item 2: the Daily Goal widget colors
// its four P&L-driven elements by the SIGN of today's P&L —
//   negative → loss (red), positive → win (green), zero → neutral/tertiary —
// for (1) the dollar figure, (2) the percentage, (3) the target icon, and
// (4) the progress-bar fill. The "In play" STATUS PILL is deliberately EXCLUDED
// (it encodes a rule/max-loss breach, an orthogonal concept) — the pill-guard
// test at the bottom locks that scope decision.
vi.mock('@/lib/ipc', () => ({
  ipc: {
    goalsProgressRead: vi.fn(),
  },
}))

const m = vi.mocked(ipc)

// The Daily Goal card is a <section aria-label="Daily goal">; the Main Challenge
// card is a separate sibling section, so scoping to it keeps the shared
// .text-4xl / progress-bar selectors unambiguous.
function dailyCard(container: HTMLElement): HTMLElement {
  return container.querySelector('[aria-label="Daily goal"]') as HTMLElement
}

// The four sign-driven nodes inside the Daily Goal card.
function parts(card: HTMLElement) {
  return {
    dollar: card.querySelector('.text-4xl') as HTMLElement, // big signed $ figure
    pct: card.querySelector('.text-3xl') as HTMLElement, // headline %
    icon: card.querySelector('.h-14') as HTMLElement, // IconBadge ring span
    bar: card.querySelector('[style*="width"]') as HTMLElement, // ProgressBar fill
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // No active equity goal → Main Challenge shows its empty state; we only assert
  // on the Daily Goal half. Resolving [] lets the async effect settle in-act.
  m.goalsProgressRead.mockResolvedValue([] as never)
})

// Render the band and wait for the goalsProgressRead effect to settle (the Main
// Challenge "No challenge set" state) so the async setState lands inside act().
async function renderBand(props: {
  todayPnl: number
  dailyProfitTarget: number
  maxDailyLoss: number
}) {
  const { container, findByText } = render(<GoalChallengeBand {...props} />)
  await findByText(/No challenge set/i)
  return dailyCard(container)
}

describe('GoalChallengeBand — Daily Goal sign coloring (Item 2)', () => {
  it('NEGATIVE day: dollar, %, icon, and bar carry the LOSS color (not win)', async () => {
    const card = await renderBand({ todayPnl: -8, dailyProfitTarget: 100, maxDailyLoss: 50 })
    const { dollar, pct, icon, bar } = parts(card)

    // sanity: the right nodes were grabbed
    expect(dollar.textContent).toContain('-$8')
    expect(pct.textContent).toContain('-8%')

    // dollar + % → text-loss, never text-win
    expect(dollar.className).toContain('text-loss')
    expect(dollar.className).not.toContain('text-win')
    expect(pct.className).toContain('text-loss')
    expect(pct.className).not.toContain('text-win')

    // icon glyph → loss token; bar fill → bg-loss
    expect(icon.className).toContain('text-loss')
    expect(icon.className).not.toContain('text-win')
    expect(bar.className).toContain('bg-loss')
    expect(bar.className).not.toContain('bg-win')
  })

  it('POSITIVE day: dollar, %, icon, and bar stay WIN (regression guard)', async () => {
    const card = await renderBand({ todayPnl: 40, dailyProfitTarget: 100, maxDailyLoss: 50 })
    const { dollar, pct, icon, bar } = parts(card)

    expect(dollar.textContent).toContain('+$40')
    expect(dollar.className).toContain('text-win')
    expect(dollar.className).not.toContain('text-loss')
    expect(pct.className).toContain('text-win')
    expect(pct.className).not.toContain('text-loss')
    expect(icon.className).toContain('text-win')
    expect(bar.className).toContain('bg-win')
    expect(bar.className).not.toContain('bg-loss')
  })

  it('ZERO day: dollar, %, icon, and bar are NEUTRAL/tertiary (not green, not red)', async () => {
    const card = await renderBand({ todayPnl: 0, dailyProfitTarget: 100, maxDailyLoss: 50 })
    const { dollar, pct, icon, bar } = parts(card)

    expect(dollar.className).toContain('text-fg-tertiary')
    expect(dollar.className).not.toContain('text-win')
    expect(dollar.className).not.toContain('text-loss')
    expect(pct.className).toContain('text-fg-tertiary')
    expect(pct.className).not.toContain('text-win')
    expect(icon.className).toContain('text-fg-tertiary')
    expect(bar.className).toContain('bg-fg-tertiary')
  })

  it('PILL GUARD: the status pill is NOT recolored by P&L sign — a negative but non-breached day still shows a WIN-colored "In play" pill', async () => {
    // -8 is a loss but well short of the -50 max-loss floor, so the day is still
    // "in play". Item 2 must leave the pill on its breach logic (win here), NOT
    // flip it red like the dollar/%. If a future change wires the pill to the
    // P&L sign (e.g. pnlClass), this assertion fails.
    const card = await renderBand({ todayPnl: -8, dailyProfitTarget: 100, maxDailyLoss: 50 })

    const pill = within(card).getByText('In play')
    expect(pill.className).toContain('text-win')
    expect(pill.className).not.toContain('text-loss')
  })
})
