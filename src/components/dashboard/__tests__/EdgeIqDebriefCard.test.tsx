/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DayMetrics, DayDetail } from '@shared/day-types'
import type { EdgeScoreResult } from '@/core/score/edgeScore'

// The card composes three data sources; we mock them at the module boundary and
// assert the REAL rendered branch (no-trade prompt / today's score / 30-day
// fallback). This covers the branches the live-look cannot reach — the sandbox
// copy has 0 trades today, so only the empty state renders in-app.
vi.mock('@/lib/useTodayEdgeScore', () => ({ useTodayEdgeScore: vi.fn() }))
vi.mock('@/lib/useEdgeScore', () => ({ useEdgeScore: vi.fn() }))
vi.mock('@/data/dayRepo', () => ({ dayRepo: { getDayDetail: vi.fn() } }))

import EdgeIqDebriefCard from '../EdgeIqDebriefCard'
import { useTodayEdgeScore } from '@/lib/useTodayEdgeScore'
import { useEdgeScore } from '@/lib/useEdgeScore'
import { dayRepo } from '@/data/dayRepo'

const result = (over: Partial<EdgeScoreResult>): EdgeScoreResult => ({
  score: null,
  axes: [],
  n: 0,
  suppressed: true,
  provisional: false,
  ...over,
})

const day = (over: Partial<DayMetrics> = {}): DayMetrics =>
  ({
    date: '2026-06-15',
    dayOfWeek: 'Monday',
    grossPnl: 0,
    totalFees: 0,
    netPnl: 0,
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    scratchCount: 0,
    winRate: null,
    biggestWin: null,
    worstLoss: null,
    firstTradePnl: null,
    avgRMultiple: null,
    avgWin: null,
    avgLoss: null,
    sessionFirstTradeTime: null,
    sessionLastTradeTime: null,
    symbolBreakdown: [],
    totalShares: 0,
    totalDollarVolume: 0,
    mostUsedPlaybook: null,
    moneyLeftOnTable: null,
    moneyLeftCoverage: null,
    avgTradePnl: null,
    avgPerShareGainLoss: null,
    profitFactor: null,
    pnlRatio: null,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    avgHoldSeconds: null,
    avgHoldSecondsWinners: null,
    avgHoldSecondsLosers: null,
    avgHoldSecondsScratches: null,
    stdDevPnl: null,
    avgMfeDollars: null,
    avgMaeDollars: null,
    mistakeTagCounts: [],
    ...over,
  }) as DayMetrics

const detail = (metrics: DayMetrics): DayDetail => ({
  date: metrics.date,
  metrics,
  trades: [],
  note: null,
  ruleBreaks: [],
})

const renderCard = () =>
  render(
    <MemoryRouter>
      <EdgeIqDebriefCard />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.mocked(useEdgeScore).mockReturnValue({ result: null, loading: false, error: null })
  vi.mocked(dayRepo.getDayDetail).mockResolvedValue(detail(day()))
})

describe('EdgeIqDebriefCard', () => {
  it('shows the honest no-trade prompt when there are no trades today', async () => {
    vi.mocked(useTodayEdgeScore).mockReturnValue({
      result: result({ n: 0, suppressed: true }),
      loading: false,
      error: null,
    })
    renderCard()
    expect(await screen.findByText(/your debrief lands after your first fill/i)).toBeTruthy()
    expect(screen.getByText('View Full EdgeIQ')).toBeTruthy()
  })

  it("shows today's score + tier (TODAY, provisional) when the day has enough trades", async () => {
    vi.mocked(useTodayEdgeScore).mockReturnValue({
      result: result({ score: 84, n: 8, suppressed: false, provisional: true }),
      loading: false,
      error: null,
    })
    vi.mocked(dayRepo.getDayDetail).mockResolvedValue(
      detail(
        day({
          tradeCount: 8,
          symbolBreakdown: [
            { symbol: 'AAPL', tradeCount: 3, netPnl: 250 },
            { symbol: 'TSLA', tradeCount: 2, netPnl: -90 },
          ],
          mostUsedPlaybook: { playbook: 'Bull Flag', tradeCount: 5, winRate: 0.6 },
        }),
      ),
    )
    renderCard()
    expect(await screen.findByText('Consistent')).toBeTruthy()
    expect(screen.getByText('84')).toBeTruthy()
    expect(screen.getByText('TODAY')).toBeTruthy()
    expect(screen.getByText('Provisional')).toBeTruthy()
    // reworded columns — "edge" is reserved for the 90-day EdgeInsights panel
    expect(screen.getByText('Worked')).toBeTruthy()
    expect(screen.getByText('Leaked')).toBeTruthy()
    // today's most-used playbook (descriptive daily fact; sample size visible)
    expect(screen.getByText('Bull Flag')).toBeTruthy()
    expect(screen.getByText('5 trades · 60% win')).toBeTruthy()
  })

  it('falls back to the 30-day score (labeled) when today is too thin to score', async () => {
    vi.mocked(useTodayEdgeScore).mockReturnValue({
      result: result({ score: null, n: 3, suppressed: true }),
      loading: false,
      error: null,
    })
    vi.mocked(useEdgeScore).mockReturnValue({
      result: result({ score: 72, n: 140, suppressed: false, provisional: false }),
      loading: false,
      error: null,
    })
    vi.mocked(dayRepo.getDayDetail).mockResolvedValue(
      detail(day({ tradeCount: 3, symbolBreakdown: [{ symbol: 'NVDA', tradeCount: 3, netPnl: -40 }] })),
    )
    renderCard()
    expect(await screen.findByText('Developing')).toBeTruthy()
    expect(screen.getByText('72')).toBeTruthy()
    expect(screen.getByText('30-DAY')).toBeTruthy()
    // no playbook tagged → honest empty state, never a fabricated setup
    expect(screen.getByText('No setup tagged today.')).toBeTruthy()
  })

  it('shows the playbook win rate with the sample size visible (no inflated 1-trade claim)', async () => {
    vi.mocked(useTodayEdgeScore).mockReturnValue({
      result: result({ score: 60, n: 6, suppressed: false, provisional: true }),
      loading: false,
      error: null,
    })
    vi.mocked(dayRepo.getDayDetail).mockResolvedValue(
      detail(
        day({ tradeCount: 6, mostUsedPlaybook: { playbook: 'Micro Pullback', tradeCount: 1, winRate: 1 } }),
      ),
    )
    renderCard()
    expect(await screen.findByText('Micro Pullback')).toBeTruthy()
    // singular "trade" + the count beside 100% so it can't read as inflated edge
    expect(screen.getByText('1 trade · 100% win')).toBeTruthy()
  })
})
