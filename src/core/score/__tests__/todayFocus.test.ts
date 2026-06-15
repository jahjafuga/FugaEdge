import { describe, it, expect } from 'vitest'
import { todayFocus } from '../todayFocus'
import type { WorkedLeakedItem } from '@/core/analytics/whatWorkedLeaked'

// v0.2.5 EdgeIQ daily-debrief — the today FOCUS line, derived from today's
// leaked items (the `leaked` column of splitWorkedLeaked, already worst-first).
// No leaks → null (the caller shows a static fallback, never a fabricated
// focus). A dollar figure appears ONLY for a money-bearing leak (netPnl
// present); a mistake leak carries its occurrence count, never a manufactured
// dollar (mirrors heroCards.ts's money gate).

describe('todayFocus', () => {
  it('returns null when there are no leaked items', () => {
    expect(todayFocus([])).toBeNull()
  })

  it('derives a dollar focus from the worst money-bearing leak', () => {
    const leaked: WorkedLeakedItem[] = [
      { kind: 'symbol', label: 'AAPL', netPnl: -340, count: 3 },
      { kind: 'symbol', label: 'TSLA', netPnl: -120, count: 1 },
    ]
    expect(todayFocus(leaked)).toBe('Tighten AAPL — it leaked $340.00 today.')
  })

  it('uses a count — never a fabricated dollar — for a mistake leak', () => {
    const leaked: WorkedLeakedItem[] = [
      { kind: 'mistake', label: 'chased entry', netPnl: null, count: 4 },
    ]
    const out = todayFocus(leaked)
    expect(out).toBe('Watch the "chased entry" mistake — it showed up 4 times today.')
    expect(out).not.toContain('$')
  })

  it('singularizes a mistake that occurred once', () => {
    const leaked: WorkedLeakedItem[] = [
      { kind: 'mistake', label: 'no stop', netPnl: null, count: 1 },
    ]
    expect(todayFocus(leaked)).toBe('Watch the "no stop" mistake — it showed up once today.')
  })
})
