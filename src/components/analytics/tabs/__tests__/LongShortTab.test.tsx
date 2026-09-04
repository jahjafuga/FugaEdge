// @vitest-environment jsdom
//
// BEAT 283 -- the Long vs Short tab, renderer guards. At RED time the tab does
// not exist, so this whole file dies with "Cannot find module" -- recorded,
// and it proves little; the guard with its own red reason lives in
// direction.test.ts (G2).
//
// THE CHART IS MOCKED. DualEquityChart is recharts inside ResponsiveContainer,
// which needs a real layout engine jsdom does not have; the tab guards here
// are about the grid, the card and the badges, so the chart is a stub that
// records its props. The chart's own math is guarded in direction.test.ts G5.
//
// THE NULL CELL IS ASSERTED VIA THE FORMATTER, never as a literal: the app's
// null string is the formatters' own and this beat's files carry no em dash
// byte anywhere (the wording law), so the expectation imports
// formatProfitFactor and compares against formatProfitFactor(null).
import { render, cleanup, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTrade } from '@/test/fixtures/trade'
import { formatProfitFactor, money } from '@/lib/format'
import { DirectionWording, fillDirection } from '@shared/direction-wording'
import {
  deltaMoney,
  deltaInt,
  deltaRatio,
  deltaDuration,
  deltaR,
  deltaPct,
} from '@/components/analytics/tabs/longShortRows'
import type { TradeListRow } from '@shared/trades-types'

const chartProps: unknown[] = []
vi.mock('@/components/analytics/DualEquityChart', () => ({
  default: (props: Record<string, unknown>) => {
    chartProps.push(props)
    return <div data-testid="dual-chart" />
  },
}))

import LongShortTab from '@/components/analytics/tabs/LongShortTab'

let nextId = 1
function side(kind: 'long' | 'short', n: number, mean = 10, spread = 2): TradeListRow[] {
  const out: TradeListRow[] = []
  for (let i = 0; i < n; i++) {
    out.push(
      makeTrade({
        id: nextId++,
        side: kind,
        net_pnl: i % 2 === 0 ? mean + spread : mean - spread,
        is_open: false,
        date: `2026-07-${String((i % 20) + 1).padStart(2, '0')}`,
      }),
    )
  }
  return out
}

afterEach(() => {
  cleanup()
  chartProps.length = 0
})

describe('LS the tab renders the comparison', () => {
  it('LS1 the three column headers come from the wording', () => {
    render(<LongShortTab trades={[...side('long', 40), ...side('short', 40)]} />)
    // Since beat 287 the side words legitimately repeat (heroes, progress,
    // legend), so the three COLUMN headers are asserted inside thead.
    const heads = [...document.querySelectorAll('thead th')].map((el) => el.textContent)
    expect(heads.join(' ')).toContain(DirectionWording.colLong)
    expect(heads.join(' ')).toContain(DirectionWording.colShort)
    expect(heads.join(' ')).toContain(DirectionWording.colDelta)
  })

  it('LS2 a 40/12 book says 12 of 30 on the identity card', () => {
    render(<LongShortTab trades={[...side('long', 40), ...side('short', 12)]} />)
    const card = document.querySelector('[data-direction-card]')
    expect(card, 'no identity card rendered').toBeTruthy()
    expect(card!.textContent).toContain('12 of 30')
    expect(card!.textContent).toContain(DirectionWording.tierInsufficient)
  })

  it('LS3 a long-only book shows short count 0 and the noSideYet sentence', () => {
    render(<LongShortTab trades={side('long', 8)} />)
    const card = document.querySelector('[data-direction-card]')
    expect(card!.textContent).toContain('No short trades yet')
    const shortCount = document.querySelector('[data-cell="trades-short"]')
    expect(shortCount, 'no short trades cell').toBeTruthy()
    expect(shortCount!.textContent).toBe('0')
  })

  it('LS4 a 9/4 book badges the short column and nulls its earned cells', () => {
    // Rewritten in beat 288 (R202): mean 2 spread 6 gives BOTH sides losers,
    // so profitFactor-long is a real number and profitFactor-short's null is
    // EARNED BY SUPPRESSION, not by an all-win empty denominator. It still
    // guards what it always did: the badge and the withheld thin-side cells.
    render(<LongShortTab trades={[...side('long', 9, 2, 6), ...side('short', 4, 2, 6)]} />)
    // The badge self-describes via its title (LowSampleBadge.tsx:20). Since
    // beat 287 it legitimately appears TWICE -- the column header and the
    // short hero's chip -- so this asserts presence, not singularity.
    expect(screen.getAllByTitle('Low sample: n=4').length).toBeGreaterThanOrEqual(1)
    const nullCell = formatProfitFactor(null)
    expect(document.querySelector('[data-cell="profitFactor-long"]')!.textContent, 'long PF should be a number').not.toBe(nullCell)
    expect(document.querySelector('[data-cell="profitFactor-short"]')!.textContent).toBe(nullCell)
    expect(document.querySelector('[data-cell="expectancy-short"]')!.textContent).toBe(nullCell)
    // The unearned side keeps its ordinary rows.
    expect(document.querySelector('[data-cell="trades-short"]')!.textContent).toBe('4')
  })

  it('LS5 the chart receives the merged curve and both presence flags', () => {
    render(<LongShortTab trades={[...side('long', 6), ...side('short', 5)]} />)
    expect(chartProps.length).toBe(1)
    const p = chartProps[0] as { curve: unknown[]; hasLong: boolean; hasShort: boolean }
    expect(Array.isArray(p.curve)).toBe(true)
    expect(p.curve.length).toBeGreaterThan(0)
    expect(p.hasLong).toBe(true)
    expect(p.hasShort).toBe(true)
  })
})

// ─── Beat 284: the rules row leaves, the excursion rows earn their unit ──────

/** 9 long / 4 short; EXACTLY the first 3 longs carry excursion data. The
 *  expected means below are recomputed from these arrays, never hardcoded. */
const MFES = [1.5, 0.8, 2.2]
const MAES = [0.4, 1.1, 0.6]
function excursionBook(): TradeListRow[] {
  const longs = side('long', 9)
  for (let i = 0; i < 3; i++) {
    longs[i] = { ...longs[i], mfe: MFES[i], mae: MAES[i] }
  }
  return [...longs, ...side('short', 4)]
}

describe('LS6 beat-284 rulings', () => {
  it('G9 rows without dna render NO Rules score label', () => {
    // Analytics rows never carry dna (only Trades.tsx:396 attaches it), so a
    // Rules row here would be a wrong figure, not an empty state.
    render(<LongShortTab trades={[...side('long', 9), ...side('short', 4)]} />)
    expect(
      screen.queryByText(DirectionWording.rowLabels.dnaScore),
      'the Rules score row rendered on rows that cannot carry dna',
    ).toBe(null)
  })

  it('G10 the excursion rows carry per-share unit and true coverage', () => {
    render(<LongShortTab trades={excursionBook()} />)
    const mfeMean = MFES.reduce((s, v) => s + v, 0) / MFES.length
    const label = DirectionWording.rowLabels.avgMfe
    expect(label, 'the MFE label does not name its unit').toContain('per share')
    const cell = document.querySelector('[data-cell="avgMfe-long"]')
    expect(cell, 'no long MFE cell').toBeTruthy()
    expect(cell!.textContent).toContain(money(mfeMean))
    // Coverage counts rows WITH data -- 3, not the side's 9.
    expect(cell!.textContent).toContain('of 3 trades with excursion data')
  })

  it('G11 PIN: MAE displays the stored magnitude, as the app already does', () => {
    // Precedent: TradeDetailSheet.tsx:467 and TradesTable.tsx:853 both render
    // money(mae) with no negation, and the writer stores Math.max(0, ...).
    render(<LongShortTab trades={excursionBook()} />)
    const maeMean = MAES.reduce((s, v) => s + v, 0) / MAES.length
    const cell = document.querySelector('[data-cell="avgMae-long"]')
    expect(cell!.textContent).toContain(money(maeMean))
    expect(cell!.textContent!.includes('-'), 'a minus crept onto a stored magnitude').toBe(false)
  })

  it('G13b the polarity table and the ROWS keys cover each other exactly', async () => {
    const mod = (await import('@/core/performance/direction')) as Record<string, unknown>
    const tab = (await import('@/components/analytics/tabs/longShortRows')) as Record<string, unknown>
    const polarity = mod.METRIC_POLARITY as Record<string, string> | undefined
    // DECLARED RED REASON: the table is absent.
    expect(polarity, 'the polarity table is absent').toBeTruthy()
    const rowKeys = tab.METRIC_ROW_KEYS as string[] | undefined
    expect(rowKeys, 'the tab does not export its row keys').toBeTruthy()
    expect([...Object.keys(polarity!)].sort()).toEqual([...rowKeys!].sort())
  })

  it('G14 leaders hide on a thin book and mark the leading cell on an earned one', () => {
    render(<LongShortTab trades={[...side('long', 9), ...side('short', 4)]} />)
    expect(
      document.querySelector('[data-leader]'),
      'a leader rendered while a side is lowSample',
    ).toBe(null)
    cleanup()
    // 40/40, long mean 50 vs short mean 10: leaders earned, long nets more.
    render(<LongShortTab trades={[...side('long', 40, 50, 2), ...side('short', 40, 10, 2)]} />)
    const cell = document.querySelector('[data-cell="netPnL-long"]')
    expect(cell?.getAttribute('data-leader'), 'the leading cell carries no marker').toBe('long')
    const delta = document.querySelector('[data-cell="netPnL-delta"]')
    expect(delta?.getAttribute('data-leader-color'), 'the delta cell is uncoloured').toBe('long')
  })

  it('G15 the identity card carries two progress bars under the floor', () => {
    render(<LongShortTab trades={[...side('long', 123), ...side('short', 17)]} />)
    const bars = document.querySelectorAll('[data-progress]')
    expect(bars.length, 'the progress bars are absent').toBe(2)
    const short = document.querySelector('[data-progress="short"]')
    expect(short!.textContent).toContain('17 of 30 trades')
    const long = document.querySelector('[data-progress="long"]')
    expect(long!.textContent).toContain('floor cleared')
  })

  it('G16 two heroes; the thin side badges and suppresses its ratios', () => {
    // mean 2 spread 6: +8/-4 alternating, so BOTH sides have losers and both
    // profit factors are numbers before suppression -- an all-win fixture
    // would null them honestly and hide a suppression that stopped working,
    // which is exactly the gap plant P14 exposed on the short side.
    render(<LongShortTab trades={[...side('long', 9, 2, 6), ...side('short', 4, 2, 6)]} />)
    const heroes = document.querySelectorAll('[data-hero]')
    expect(heroes.length, 'the hero cards are absent').toBe(2)
    const shortHero = document.querySelector('[data-hero="short"]') as HTMLElement
    expect(shortHero.querySelector('[title="Low sample: n=4"]'), 'no badge on the thin hero').toBeTruthy()
    // Rewritten in beat 289 (R202): profit factor left the heroes for the
    // grid, so the suppression assertion follows the triad's earned stat --
    // the P&L ratio. It still guards the same rule: the thin side's earned
    // hero stat is withheld while the other side's is a number.
    expect(shortHero.querySelector('[data-hero-stat="plRatio-short"]')!.textContent)
      .toBe(formatProfitFactor(null))
    const longHero = document.querySelector('[data-hero="long"]') as HTMLElement
    expect(longHero.querySelector('[data-hero-stat="plRatio-long"]')!.textContent)
      .not.toBe(formatProfitFactor(null))
  })

  it('G17 the four section labels render, in order, from the wording', () => {
    render(<LongShortTab trades={[...side('long', 40), ...side('short', 40)]} />)
    const labels = [...document.querySelectorAll('[data-section]')].map((el) => el.textContent)
    expect(labels, 'the section rows are absent').toEqual([
      DirectionWording.sectionOutcome,
      DirectionWording.sectionSize,
      DirectionWording.sectionRisk,
      DirectionWording.sectionExcursion,
    ])
  })

  it('G12 the win-rate delta formats as Compare formats it', () => {
    // CompareView.tsx:835 renders win rate with kind="pct"; its private
    // fmtDelta 'pct' arm (:1071) yields for 60% vs 50%:
    //   `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`
    // The expected string is computed HERE by that exact expression.
    const longs = [10, 10, 10, 10, 10, 10, -10, -10, -10, -10].map((p, i) =>
      makeTrade({ id: nextId++, side: 'long', net_pnl: p, is_open: false, date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    const shorts = [10, 10, 10, 10, -10, -10, -10, -10].map((p, i) =>
      makeTrade({ id: nextId++, side: 'short', net_pnl: p, is_open: false, date: `2026-07-${String(i + 1).padStart(2, '0')}` }),
    )
    render(<LongShortTab trades={[...longs, ...shorts]} />)
    const delta = 0.6 - 0.5
    const expected = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`
    expect(document.querySelector('[data-cell="winRate-delta"]')!.textContent).toBe(expected)
  })
})

// ─── Beat 288: gold leaders, signed deltas, no counter ───────────────────────

/** An EARNED book (both sides at 40) where long leads win rate AND net:
 *  long 30 wins +10 / 10 losses -5 (wr .75), short 20/20 (wr .50). */
function earnedBook(): TradeListRow[] {
  const rows: TradeListRow[] = []
  const push = (kind: 'long' | 'short', pnl: number, i: number) =>
    rows.push(makeTrade({ id: nextId++, side: kind, net_pnl: pnl, is_open: false, date: `2026-07-${String((i % 20) + 1).padStart(2, '0')}` }))
  for (let i = 0; i < 30; i++) push('long', 10, i)
  for (let i = 0; i < 10; i++) push('long', -5, i)
  for (let i = 0; i < 20; i++) push('short', 10, i)
  for (let i = 0; i < 20; i++) push('short', -5, i)
  return rows
}

/** Every arm's zero rendering, from the arms themselves. */
const ZERO_FORMS = new Set([
  deltaMoney(0), deltaInt(0), deltaRatio(0), deltaDuration(0), deltaR(0), deltaPct(0),
])

describe('LS7 beat-288 rulings', () => {
  it('G18 the leader is a gold value, not a dot', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const cell = document.querySelector('[data-cell="netPnL-long"]') as HTMLElement
    expect(cell.getAttribute('data-leader'), 'the leader attribute is gone').toBe('long')
    expect(
      cell.querySelector('span[class*="h-1.5 w-1.5"]'),
      'the dot element is still present',
    ).toBe(null)
    expect(
      cell.querySelector('[data-leader-style="gold"]'),
      'the gold value span is absent',
    ).toBeTruthy()
  })

  it('G19 the hero stat takes the same gold on the leading side only', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const lead = document.querySelector('[data-hero-stat="winRate-long"]')
    expect(lead?.getAttribute('data-leader-style'), 'the leading hero stat is unstyled').toBe('gold')
    const other = document.querySelector('[data-hero-stat="winRate-short"]')
    expect(other?.getAttribute('data-leader-style')).toBe(null)
  })

  it('G20 every rendered delta carries an explicit sign', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const nullCell = formatProfitFactor(null)
    const cells = [...document.querySelectorAll('td[data-cell]')].filter((el) =>
      (el.getAttribute('data-cell') ?? '').endsWith('-delta'),
    )
    expect(cells.length).toBeGreaterThan(0)
    for (const el of cells) {
      const text = (el.textContent ?? '').trim()
      if (text === nullCell) continue
      // REWRITTEN IN BEAT 307 (R202). This once carried a money-only
      // exception, because only that arm collapsed its zero. The sign rule is
      // now general: EVERY arm formats its magnitude and drops the sign when
      // that magnitude reads as zero. So the exception is the set of zero
      // renderings, built from the arms themselves rather than listed.
      // What this still guards is unchanged and is the whole point: a delta
      // with a REAL magnitude must say which way it points.
      if (ZERO_FORMS.has(text)) continue
      expect(
        text.startsWith('+') || text.startsWith('-'),
        `unsigned delta in ${el.getAttribute('data-cell')}: "${text}"`,
      ).toBe(true)
    }
  })

  it('G21 the card carries no Long N / Short N counter', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const card = document.querySelector('[data-direction-card]') as HTMLElement
    expect(
      /Long \d+ \/ Short \d+/.test(card.textContent ?? ''),
      'the counter span is still rendered',
    ).toBe(false)
  })

  it('G22 PIN: no gold style anywhere while a side is thin', () => {
    render(<LongShortTab trades={[...side('long', 9, 2, 6), ...side('short', 4, 2, 6)]} />)
    expect(document.querySelector('[data-leader-style]')).toBe(null)
  })
})

// --- Beat 289: the triad, the gold net, the ratio row ------------------------

describe('LS8 beat-289 rulings', () => {
  it('G24 the hero carries exactly winRate, plRatio, expectancy in order', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const keys = [...document.querySelectorAll('[data-hero="long"] [data-hero-stat]')].map(
      (el) => el.getAttribute('data-hero-stat'),
    )
    expect(keys, 'the triad is wrong').toEqual(['winRate-long', 'plRatio-long', 'expectancy-long'])
    expect(
      document.querySelector('[data-hero-stat="profitFactor-long"]'),
      'profit factor is still on the hero',
    ).toBe(null)
  })

  it('G25 the Outcome section reads its seven labels in order, ratio valued', () => {
    render(<LongShortTab trades={earnedBook()} />)
    // The label cells are the FIRST td of each metric row; the Outcome
    // section is everything between the first section row and the second.
    const rows = [...document.querySelectorAll('tbody tr')]
    const sectionIdx = rows
      .map((r, i) => (r.querySelector('[data-section]') ? i : -1))
      .filter((i) => i >= 0)
    const outcome = rows.slice(sectionIdx[0] + 1, sectionIdx[1])
    const labels = outcome.map((r) => r.querySelector('td')!.textContent)
    expect(labels).toEqual([
      DirectionWording.rowLabels.netPnL,
      DirectionWording.rowLabels.trades,
      DirectionWording.rowLabels.winRate,
      DirectionWording.rowLabels.plRatio,
      DirectionWording.rowLabels.profitFactor,
      DirectionWording.rowLabels.expectancy,
      DirectionWording.rowLabels.expectancyR,
    ])
    // AND THE VALUE: earnedBook longs are +10 wins / -5 losses, so the ratio
    // is 2.00 -- recomputed here, and DISTINCT from profit factor's 6.00, so
    // an accessor that read the wrong field cannot pass (plant P23).
    expect(document.querySelector('[data-cell="plRatio-long"]')!.textContent).toContain('2.00')
  })

  it('G26 the hero net wears gold only on the leading side, only when earned', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const longNet = document.querySelector('[data-hero="long"] [data-hero-net]')
    const shortNet = document.querySelector('[data-hero="short"] [data-hero-net]')
    expect(longNet?.getAttribute('data-leader-style'), 'the leading net is unstyled').toBe('gold')
    expect(shortNet?.getAttribute('data-leader-style')).toBe(null)
    cleanup()
    render(<LongShortTab trades={[...side('long', 9, 2, 6), ...side('short', 4, 2, 6)]} />)
    expect(document.querySelector('[data-hero-net][data-leader-style]')).toBe(null)
  })
})

// --- Beat 290: the ratio's own formatter, coloured headers, the empty rule --

describe('LS9 beat-290 rulings', () => {
  it('G27 the plRatio row formats with formatPnlRatio, the type doc named renderer', async () => {
    const rows = (await import('@/components/analytics/tabs/longShortRows')) as Record<string, unknown>
    const fmt = (await import('@/lib/format')) as Record<string, unknown>
    const row = (rows.ROWS as { key: string; fmt: unknown }[]).find((r) => r.key === 'plRatio')!
    expect(row.fmt, 'the plRatio row still wears profit factor formatter').toBe(fmt.formatPnlRatio)
  })

  it('G28 the side headers wear their side colours; the delta header wears none', () => {
    render(<LongShortTab trades={earnedBook()} />)
    const hexToRgb = (hex: string) => {
      const n = parseInt(hex.slice(1), 16)
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    }
    const longTh = document.querySelector('th[data-side="long"]') as HTMLElement
    expect(longTh, 'no data-side on the LONG header').toBeTruthy()
    expect(longTh.style.color).toBe(hexToRgb('#3b82f6'))
    const shortTh = document.querySelector('th[data-side="short"]') as HTMLElement
    expect(shortTh, 'no data-side on the SHORT header').toBeTruthy()
    expect(shortTh.style.color).toBe(hexToRgb('#f97316'))
    const deltaTh = [...document.querySelectorAll('thead th')].find((el) =>
      (el.textContent ?? '').includes(DirectionWording.colDelta),
    ) as HTMLElement
    expect(deltaTh.getAttribute('data-side')).toBe(null)
    expect(deltaTh.style.color).toBe('')
  })

  it('G29 an empty side is the null cell everywhere except its zero Trades', () => {
    render(<LongShortTab trades={side('long', 28, 2, 6)} />)
    const nullCell = formatProfitFactor(null)
    const cell = (k: string) => document.querySelector(`[data-cell="${k}"]`)!.textContent
    // DECLARED RED: netPnL-short renders money(0) today (the snapshot's
    // empty-set counts fall to zero, overviewSnapshot.ts:30-31), as does the
    // short hero net.
    expect(cell('netPnL-short'), 'an empty side renders $0.00').toBe(nullCell)
    expect(cell('netPnL-delta'), 'a delta against an empty side survived').toBe(nullCell)
    expect(cell('trades-short'), 'the Trades exception broke').toBe('0')
    expect(cell('winRate-short')).toBe(nullCell)
    expect(cell('plRatio-short')).toBe(nullCell)
    expect(cell('avgWinner-short')).toBe(nullCell)
    const heroNet = document.querySelector('[data-hero="short"] [data-hero-net]')
    expect(heroNet!.textContent, 'the empty hero net renders $0.00').toBe(nullCell)
  })
})

// --- Beat 298: the tab takes the shared filter bar ---------------------------

/** A book whose rows carry a playbook, so a real facet can narrow it. */
function playbookBook(): TradeListRow[] {
  const rows: TradeListRow[] = []
  const push = (kind: 'long' | 'short', pnl: number, pb: string | null, i: number) =>
    rows.push(makeTrade({
      id: nextId++, side: kind, net_pnl: pnl, is_open: false,
      playbook_name: pb,
      date: '2026-07-' + String((i % 20) + 1).padStart(2, '0'),
    }))
  // 9 long: 5 on Bull Flag (three winners, two losers), 4 elsewhere.
  for (let i = 0; i < 3; i++) push('long', 40, 'Bull Flag', i)
  for (let i = 0; i < 2; i++) push('long', -15, 'Bull Flag', i + 3)
  for (let i = 0; i < 4; i++) push('long', 7, 'Other', i + 5)
  // 4 short: 2 on Bull Flag, 2 elsewhere.
  for (let i = 0; i < 2; i++) push('short', 12, 'Bull Flag', i)
  for (let i = 0; i < 2; i++) push('short', -9, 'Other', i + 2)
  return rows
}

/** Drive the bar's playbook facet through the bar's OWN idiom, the one
 *  AnalyticsFilterBar.multiselect.test.tsx:48-54 uses: the facet lives behind
 *  the "More filters" expander, so open that, open the facet, pick the option. */
function pickPlaybook(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
  fireEvent.click(screen.getByRole('button', { name: /^playbook/i }))
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('LS10 beat-298: the filter bar', () => {
  it('G33 ONE pass: the long column equals the engine on the same filters', async () => {
    const rows = playbookBook()
    render(<LongShortTab trades={rows} />)
    pickPlaybook('Bull Flag')
    const { computeOverviewSnapshot } = await import('@/core/performance/overviewSnapshot')
    const { emptyFilters } = await import('@/core/performance/filters')
    // Recomputed HERE, from the same rows, in ONE engine call.
    const expected = computeOverviewSnapshot(rows, {
      ...emptyFilters(), playbooks: ['Bull Flag'], side: 'long',
    }).metrics.netPnL
    expect(document.querySelector('[data-cell="netPnL-long"]')!.textContent).toContain(money(expected))
  })

  it('G34 the SIDE facet is hidden on this tab, and shown on a control bar', async () => {
    render(<LongShortTab trades={playbookBook()} />)
    const inTab = document.querySelectorAll('[data-facet="side"]').length
    expect(inTab, 'the side facet is still rendered on the tab').toBe(0)
    cleanup()
    const { default: AnalyticsFilterBar } = await import('@/components/analytics/AnalyticsFilterBar')
    const { emptyFilters } = await import('@/core/performance/filters')
    render(
      <AnalyticsFilterBar
        trades={playbookBook()}
        filters={emptyFilters()}
        onFiltersChange={() => {}}
      />,
    )
    const onControl = document.querySelectorAll('[data-facet="side"]').length
    expect(onControl, 'the CONTROL bar does not show a side facet either').toBeGreaterThan(0)
  })

  it('G35 the scope line appears only when a filter is active', () => {
    render(<LongShortTab trades={playbookBook()} />)
    const card = () => document.querySelector('[data-direction-card]')!.textContent ?? ''
    expect(card(), 'the scope line shows on an unfiltered book').not.toContain('not the whole book')
    pickPlaybook('Bull Flag')
    expect(card(), 'no scope line under an active filter').toContain('not the whole book')
    expect(card()).toContain('7')
  })

  it('G36 the earned read follows the filter', () => {
    // 40 long + 40 short unfiltered reads preliminary; Bull Flag leaves
    // 40 long and 12 short, which falls back under the floor.
    const rows: TradeListRow[] = []
    for (let i = 0; i < 40; i++) {
      rows.push(makeTrade({ id: nextId++, side: 'long', net_pnl: i % 2 ? 8 : -4, is_open: false, playbook_name: 'Bull Flag', date: '2026-07-' + String((i % 20) + 1).padStart(2, '0') }))
    }
    for (let i = 0; i < 12; i++) {
      rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: i % 2 ? 9 : -5, is_open: false, playbook_name: 'Bull Flag', date: '2026-07-' + String((i % 20) + 1).padStart(2, '0') }))
    }
    for (let i = 0; i < 28; i++) {
      rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: i % 2 ? 9 : -5, is_open: false, playbook_name: 'Other', date: '2026-07-' + String((i % 20) + 1).padStart(2, '0') }))
    }
    render(<LongShortTab trades={rows} />)
    const card = () => document.querySelector('[data-direction-card]')!.textContent ?? ''
    expect(card(), 'the unfiltered book should be preliminary').toContain(DirectionWording.tierPreliminary)
    pickPlaybook('Bull Flag')
    expect(card(), 'the filtered read did not fall back').toContain(DirectionWording.tierInsufficient)
    expect(card()).toContain('12 of 30')
  })
})

// --- Beat 300: the date strip tells the truth about itself -------------------

/** Rows spread across months, dated RELATIVE TO NOW so the guard does not
 *  depend on the wall clock: rangeForQuickKey computes its windows from
 *  new Date(), so a fixed fixture date would drift into and out of range. */
function spreadBook(): TradeListRow[] {
  const iso = (daysAgo: number) => {
    const d = new Date()
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString().slice(0, 10)
  }
  const rows: TradeListRow[] = []
  const at = (daysAgo: number, side: 'long' | 'short', pnl: number) =>
    rows.push(makeTrade({ id: nextId++, side, net_pnl: pnl, is_open: false, date: iso(daysAgo) }))
  // inside 7d
  at(1, 'long', 20); at(2, 'short', -8); at(5, 'long', 11)
  // inside 30d, outside 7d
  at(12, 'long', -6); at(25, 'short', 14)
  // inside 90d, outside 30d
  at(45, 'long', 9); at(80, 'short', -5)
  // outside 90d but inside the year so far, and one far older
  at(200, 'long', 30); at(400, 'short', 7)
  return rows
}

/** The key the Segment is styling as selected, by Segment.tsx:23-27's own
 *  active classes. Scoped by p-0.5 so the bar's FIELD skeleton cannot match. */
function litKey(): string | null {
  const roots = [...document.querySelectorAll('div.inline-flex.h-8.items-center.p-0\\.5')]
  for (const root of roots) {
    const keys = [...root.querySelectorAll('button')]
    if (!keys.some((k) => /^(7D|30D|90D|YTD|ALL)$/.test(k.textContent ?? ''))) continue
    const lit = keys.filter((k) => k.className.includes('text-gold'))
    return lit.length === 1 ? (lit[0].textContent ?? null) : null
  }
  return null
}

const clickKey = (label: string) =>
  fireEvent.click(screen.getByRole('button', { name: label }))

describe('LS11 beat-300: the quick range strip', () => {
  it('G40 the clicked key is the lit key', () => {
    render(<LongShortTab trades={spreadBook()} />)
    expect(litKey(), 'the strip does not open on ALL').toBe('ALL')
    for (const key of ['7D', '30D', '90D', 'YTD']) {
      clickKey(key)
      expect(litKey(), 'clicked ' + key + ' and the strip lit something else').toBe(key)
    }
    clickKey('ALL')
    expect(litKey()).toBe('ALL')
  })

  it('G41 the lit key and the applied window are the same fact', async () => {
    const rows = spreadBook()
    render(<LongShortTab trades={rows} />)
    const { rangeForQuickKey } = await import('@/components/analytics/AnalyticsFilterBar')
    for (const key of ['7D', '30D', '90D']) {
      clickKey(key)
      const range = rangeForQuickKey(key.toLowerCase() as never)!
      // Recomputed HERE from the fixture, not read back from the component.
      const expected = rows.filter((t) => t.date >= range.from && t.date <= range.to).length
      expect(litKey()).toBe(key)
      const bar = document.body.textContent ?? ''
      expect(bar, key + ' lit but the count line disagrees').toContain(
        expected + ' of ' + rows.length + ' round trips',
      )
    }
  })

  it('G42 PIN: the scope line is gated on NARROWING, not on having a filter', () => {
    render(<LongShortTab trades={spreadBook()} />)
    const card = () => document.querySelector('[data-direction-card]')!.textContent ?? ''
    clickKey('7D')
    expect(card(), 'a narrowing key showed no scope line').toContain('not the whole book')
    clickKey('ALL')
    expect(card(), 'a key that selects every row still claimed a narrowed book').not.toContain(
      'not the whole book',
    )
  })
})

describe('LS12 beat-302: a custom window clears the strip', () => {
  it('G50 setting a From date darkens the strip, moves the counts, scopes the card', () => {
    const rows = spreadBook()
    render(<LongShortTab trades={rows} />)
    clickKey('90D')
    expect(litKey(), 'the fixture click did not take').toBe('90D')
    const before = document.body.textContent ?? ''

    // A custom window through More filters: narrower than 90 days, so the
    // counts must move and no key can honestly describe it.
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    const iso = (daysAgo: number) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return d.toISOString().slice(0, 10)
    }
    fireEvent.change(screen.getByLabelText(/^from$/i), { target: { value: iso(3) } })

    expect(litKey(), 'a key stayed lit for a window it did not produce').toBe(null)
    const after = document.body.textContent ?? ''
    expect(after, 'the counts did not move').not.toBe(before)
    const card = document.querySelector('[data-direction-card]')!.textContent ?? ''
    expect(card, 'no scope line under a custom window').toContain('not the whole book')
  })
})

// --- Beat 307: three honesty fixes ------------------------------------------

describe('LS13 beat-307', () => {
  it('G57 Expectancy (R) is EARNED and withheld on a thin side', () => {
    // Both sides carry r_multiple, so the only reason to withhold is the
    // sample: 4 shorts is under the low-sample floor.
    const rows: TradeListRow[] = []
    for (let i = 0; i < 9; i++) {
      rows.push(makeTrade({ id: nextId++, side: 'long', net_pnl: i % 2 ? 8 : -4, is_open: false, r_multiple: 1.5, date: '2026-07-15' }))
    }
    for (let i = 0; i < 4; i++) {
      rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: i % 2 ? 9 : -3, is_open: false, r_multiple: 2.5, date: '2026-07-15' }))
    }
    render(<LongShortTab trades={rows} />)
    const nullCell = formatProfitFactor(null)
    const long = document.querySelector('[data-cell="expectancyR-long"]')!.textContent ?? ''
    const short = document.querySelector('[data-cell="expectancyR-short"]')!.textContent ?? ''
    expect(long, 'the earned side lost its R expectancy').toContain('R')
    expect(short.startsWith(nullCell), 'the thin side still reports an R expectancy: ' + short).toBe(true)
    expect(document.querySelector('[data-cell="expectancyR-delta"]')!.textContent).toBe(nullCell)
  })

  it('G58 a delta whose magnitude rounds to zero carries no sign', () => {
    // Six a side, so nothing is withheld. The short is built a hair above the
    // long on the money and ratio arms, and dead level on the pct and int
    // arms, so four different arms are exercised by one fixture.
    const rows: TradeListRow[] = []
    for (let i = 0; i < 3; i++) rows.push(makeTrade({ id: nextId++, side: 'long', net_pnl: 10, is_open: false, mfe: 1, date: '2026-07-15' }))
    for (let i = 0; i < 3; i++) rows.push(makeTrade({ id: nextId++, side: 'long', net_pnl: -5, is_open: false, mfe: 1, date: '2026-07-15' }))
    for (let i = 0; i < 3; i++) rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: 10.02, is_open: false, mfe: 1.004, date: '2026-07-15' }))
    for (let i = 0; i < 3; i++) rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: -5, is_open: false, mfe: 1.004, date: '2026-07-15' }))
    render(<LongShortTab trades={rows} />)

    const cell = (k: string) => document.querySelector(`[data-cell="${k}-delta"]`)!.textContent ?? ''
    // money: 1.000 vs 1.004 is four tenths of a cent, which prints as zero.
    expect(cell('avgMfe'), 'the money arm signed a zero').toBe(money(0))
    // ratio: 2.000 vs 2.004 likewise.
    expect(cell('plRatio'), 'the ratio arm signed a zero').toBe('0.00')
    // pct and int: dead level, so exactly zero.
    expect(cell('winRate'), 'the pct arm signed a zero').toBe('0.0%')
    expect(cell('trades'), 'the int arm signed a zero').toBe('0')
    // AND THE SIGNS STILL WORK where the magnitude is real.
    expect(cell('netPnL').startsWith('+') || cell('netPnL').startsWith('-')).toBe(true)
  })

  it('G59 the float coverage line names the BOOK as its denominator', () => {
    const rows: TradeListRow[] = []
    for (let i = 0; i < 6; i++) rows.push(makeTrade({ id: nextId++, side: 'long', net_pnl: 8, is_open: false, float_shares: 500_000, date: '2026-07-15' }))
    for (let i = 0; i < 6; i++) rows.push(makeTrade({ id: nextId++, side: 'short', net_pnl: -3, is_open: false, float_shares: null, date: '2026-07-15' }))
    render(<LongShortTab trades={rows} />)
    fireEvent.click(screen.getByRole('button', { name: /more filters/i }))
    fireEvent.click(screen.getByRole('button', { name: /^float/i }))
    fireEvent.click(screen.getByRole('button', { name: /Nano/i }))

    const line = document.querySelector('[data-float-coverage]')
    expect(line, 'no coverage line while the float facet is active').toBeTruthy()
    const text = line!.textContent ?? ''
    expect(text, 'the coverage line does not name the book').toContain('book')
    expect(text).toBe(
      fillDirection(DirectionWording.floatCoverage, { k: 6, n: 12 }),
    )
  })
})
