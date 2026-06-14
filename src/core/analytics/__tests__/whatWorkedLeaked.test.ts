import { describe, it, expect } from 'vitest'
import { splitWorkedLeaked, type WorkedLeakedInput } from '../whatWorkedLeaked'

// v0.2.5 Edge Intelligence Beat 4 — the session/week "What worked / What leaked"
// summary is a PURE DESCRIPTIVE selector over the existing WeekMetrics/DayMetrics
// breakdowns (no n-gated pattern rules — a session/week is too small for them).
// Positive-net symbol/playbook/day + the biggest win → worked; negative-net +
// the worst loss + top mistake tags → leaked.

function mk(over: Partial<WorkedLeakedInput> = {}): WorkedLeakedInput {
  return {
    symbolBreakdown: [],
    biggestWin: null,
    worstLoss: null,
    mistakeTagCounts: [],
    ...over,
  }
}
const labels = (items: { label: string }[]) => items.map((i) => i.label)
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind)

describe('splitWorkedLeaked — symbols split by sign', () => {
  it('positive-net symbols → worked, negative-net → leaked; net 0 excluded', () => {
    const r = splitWorkedLeaked(
      mk({
        symbolBreakdown: [
          { symbol: 'AAA', tradeCount: 3, netPnl: 400 },
          { symbol: 'BBB', tradeCount: 2, netPnl: -250 },
          { symbol: 'CCC', tradeCount: 1, netPnl: 0 },
        ],
      }),
    )
    expect(labels(r.worked)).toContain('AAA')
    expect(labels(r.leaked)).toContain('BBB')
    expect([...labels(r.worked), ...labels(r.leaked)]).not.toContain('CCC')
  })
  it('worst symbols are ordered most-negative first', () => {
    const r = splitWorkedLeaked(
      mk({
        symbolBreakdown: [
          { symbol: 'MILD', tradeCount: 1, netPnl: -50 },
          { symbol: 'BAD', tradeCount: 1, netPnl: -900 },
        ],
      }),
    )
    expect(r.leaked.filter((i) => i.kind === 'symbol').map((i) => i.label)).toEqual(['BAD', 'MILD'])
  })
})

describe('splitWorkedLeaked — biggest win / worst loss + day + playbook', () => {
  it('biggest win → worked (trade), worst loss → leaked (trade)', () => {
    const r = splitWorkedLeaked(
      mk({ biggestWin: { symbol: 'WIN', pnl: 800 }, worstLoss: { symbol: 'LOSS', pnl: -600 } }),
    )
    expect(r.worked.some((i) => i.kind === 'trade' && i.label === 'WIN' && i.netPnl === 800)).toBe(true)
    expect(r.leaked.some((i) => i.kind === 'trade' && i.label === 'LOSS' && i.netPnl === -600)).toBe(true)
  })
  it('bestDay → worked, worstDay → leaked (week input)', () => {
    const r = splitWorkedLeaked(
      mk({ bestDay: { date: '2026-06-08', netPnl: 500 }, worstDay: { date: '2026-06-09', netPnl: -300 } }),
    )
    expect(r.worked.some((i) => i.kind === 'day' && i.label === '2026-06-08')).toBe(true)
    expect(r.leaked.some((i) => i.kind === 'day' && i.label === '2026-06-09')).toBe(true)
  })
  it('positive playbook → worked, negative → leaked (week input)', () => {
    const r = splitWorkedLeaked(
      mk({
        perPlaybook: [
          { playbook: 'Bull Flag', tradeCount: 4, netPnl: 600, winRate: 0.75 },
          { playbook: 'Parabolic Short', tradeCount: 2, netPnl: -200, winRate: 0 },
        ],
      }),
    )
    expect(r.worked.some((i) => i.kind === 'playbook' && i.label === 'Bull Flag')).toBe(true)
    expect(r.leaked.some((i) => i.kind === 'playbook' && i.label === 'Parabolic Short')).toBe(true)
  })
})

describe('splitWorkedLeaked — mistakes are leaked-only', () => {
  it('top mistake tags appear in leaked with their count, never in worked', () => {
    const r = splitWorkedLeaked(
      mk({ mistakeTagCounts: [{ tag: 'Chased entry', count: 5 }, { tag: 'No stop', count: 2 }] }),
    )
    const m = r.leaked.filter((i) => i.kind === 'mistake')
    expect(m.map((i) => i.label)).toEqual(['Chased entry', 'No stop'])
    expect(m[0].count).toBe(5)
    expect(kinds(r.worked)).not.toContain('mistake')
  })
})

describe('splitWorkedLeaked — thin / empty ranges are honest, no crash', () => {
  it('empty input → empty columns', () => {
    const r = splitWorkedLeaked(mk())
    expect(r.worked).toEqual([])
    expect(r.leaked).toEqual([])
  })
  it('a day input (no week-only fields) works from symbols + win/loss + mistakes', () => {
    const r = splitWorkedLeaked(
      mk({
        symbolBreakdown: [{ symbol: 'ONE', tradeCount: 1, netPnl: 120 }],
        biggestWin: { symbol: 'ONE', pnl: 120 },
        mistakeTagCounts: [{ tag: 'FOMO', count: 1 }],
      }),
    )
    expect(labels(r.worked)).toContain('ONE')
    expect(r.leaked.some((i) => i.kind === 'mistake' && i.label === 'FOMO')).toBe(true)
  })
})
