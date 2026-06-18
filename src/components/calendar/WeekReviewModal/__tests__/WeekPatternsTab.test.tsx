// @vitest-environment jsdom
//
// Phase 5 Beat C — the weekly Patterns tab. Verifies the BALANCED framing the
// phase exists for: process terms → "What's working" (FIRST), pitfalls → "Watch
// for", structure / tickers / setups → "Context"; entry-recurrence "N days"
// counts; the observational caption; and an honest empty state. The matcher +
// aggregation are the real Beat-A/B code; only ipc.playbooksList is mocked.

import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { WeekDetail, WeekJournalEntry, WeekMetrics } from '@shared/week-types'
import type { TradeListRow } from '@shared/trades-types'

vi.mock('@/lib/ipc', () => ({ ipc: { playbooksList: vi.fn() } }))

import WeekPatternsTab from '../WeekPatternsTab'
import { ipc } from '@/lib/ipc'

const playbooksList = vi.mocked(ipc.playbooksList)

function entry(
  premarket_notes: string,
  postsession_notes = '',
  date = '2026-06-01',
): WeekJournalEntry {
  return { date, premarket_notes, postsession_notes }
}
function makeDetail(over: Partial<WeekDetail>): WeekDetail {
  return {
    weekStart: '2026-05-31',
    weekEnd: '2026-06-06',
    metrics: {} as unknown as WeekMetrics,
    trades: [],
    notes: '',
    entries: [],
    ...over,
  }
}

beforeEach(() => {
  playbooksList.mockReset()
  playbooksList.mockResolvedValue([])
})

describe('WeekPatternsTab — balanced grouping + framing', () => {
  it('routes process / pitfall / structure terms into their own sections', async () => {
    const detail = makeDetail({
      entries: [
        entry('kept discipline and followed the plan'),
        entry('had FOMO and chased the move'),
        entry('watched the VWAP', 'gap and go'),
      ],
    })
    render(<WeekPatternsTab detail={detail} />)

    const working = await screen.findByTestId('patterns-section-working')
    expect(within(working).getByText('discipline · 1 day')).toBeTruthy()
    expect(within(working).getByText('followed plan · 1 day')).toBeTruthy()

    const watch = screen.getByTestId('patterns-section-watch')
    expect(within(watch).getByText('FOMO · 1 day')).toBeTruthy()
    expect(within(watch).getByText('chased · 1 day')).toBeTruthy()

    const context = screen.getByTestId('patterns-section-context')
    expect(within(context).getByText('VWAP · 1 day')).toBeTruthy()
    expect(within(context).getByText('gap · 1 day')).toBeTruthy()
  })

  it('renders "What\'s working" FIRST, before "Watch for" (strengths-first)', async () => {
    const detail = makeDetail({ entries: [entry('discipline', 'FOMO')] })
    render(<WeekPatternsTab detail={detail} />)
    const working = await screen.findByTestId('patterns-section-working')
    const watch = screen.getByTestId('patterns-section-watch')
    expect(
      working.compareDocumentPosition(watch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows the observational caption (counts, not judgments)', async () => {
    const detail = makeDetail({ entries: [entry('discipline')] })
    render(<WeekPatternsTab detail={detail} />)
    expect(await screen.findByText(/counts, not judgments/i)).toBeTruthy()
  })

  it('counts ENTRIES that mention a term ("N days", entry-recurrence)', async () => {
    const detail = makeDetail({
      entries: [entry('FOMO'), entry('more FOMO'), entry('FOMO again'), entry('calm')],
    })
    render(<WeekPatternsTab detail={detail} />)
    expect(await screen.findByText('FOMO · 3 days')).toBeTruthy()
  })

  it('tickers land in Context with recurrence counts', async () => {
    const detail = makeDetail({
      trades: [{ symbol: 'TSLA' } as unknown as TradeListRow],
      entries: [entry('traded $TSLA'), entry('$TSLA again')],
    })
    render(<WeekPatternsTab detail={detail} />)
    const context = await screen.findByTestId('patterns-section-context')
    expect(within(context).getByText('TSLA · 2 days')).toBeTruthy()
  })

  it('setups (from playbooksList) land in Context', async () => {
    playbooksList.mockResolvedValue([{ name: 'Bull Flag' } as any])
    const detail = makeDetail({ entries: [entry('a clean bull flag setup')] })
    render(<WeekPatternsTab detail={detail} />)
    const chip = await screen.findByText('Bull Flag · 1 day')
    expect(screen.getByTestId('patterns-section-context').contains(chip)).toBe(true)
  })
})

describe('WeekPatternsTab — honest empty', () => {
  it('no entries → honest empty state, no chips, no fabricated patterns', async () => {
    render(<WeekPatternsTab detail={makeDetail({ entries: [] })} />)
    expect(await screen.findByText(/no recurring topics yet/i)).toBeTruthy()
    expect(screen.queryByTestId('patterns-section-working')).toBeNull()
    expect(screen.queryByTestId('patterns-section-watch')).toBeNull()
    expect(screen.queryByTestId('patterns-section-context')).toBeNull()
  })

  it('entries with no matching terms → honest empty state', async () => {
    render(<WeekPatternsTab detail={makeDetail({ entries: [entry('quiet day, nothing notable')] })} />)
    expect(await screen.findByText(/no recurring topics yet/i)).toBeTruthy()
  })
})
