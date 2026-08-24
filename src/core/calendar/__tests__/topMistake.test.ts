// v0.2.7 -- THE RANKING CORE, GUARDED AT LAST.
//
// topMistake has shipped since the week-cell reinstatement and had NO unit
// test. It exists specifically because the deleted compute broke ties by Map
// insertion order, so the winner depended on trade ordering; this module was
// written to be deterministic and nobody pinned that it is. The year-view
// month tier now leans on it entirely, so it gets its guards first.
//
// THE RANKING LAW (founder-ruled, and already what this module does):
//   count descending, then mistake_def.sort_position ascending, then name
//   ascending. sort_position is the trader-facing severity order the taxonomy
//   already encodes -- alphabetical alone was an accident of the other surface.

import { describe, expect, it } from 'vitest'
import { topMistake, type MistakeTagRow } from '../topMistake'

const row = (name: string, sort_position: number): MistakeTagRow => ({ name, sort_position })

/** Deterministic shuffle -- no clock, no Math.random (both are forbidden in
 *  this codebase's pure paths and would make the guard itself flaky). */
function shuffled<T>(xs: readonly T[], seed: number): T[] {
  const out = [...xs]
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

describe('G1 count descending wins first', () => {
  it('the most frequent mistake is the top one, whatever its position', () => {
    const rows = [
      row('Averaged down', 13),
      row('Averaged down', 13),
      row('Averaged down', 13),
      row('Oversized', 10),
    ]
    expect(topMistake(rows)).toEqual({ name: 'Averaged down', count: 3 })
  })

  it('and the count reported is the count of that name only', () => {
    const rows = [row('A', 1), row('A', 1), row('B', 2)]
    expect(topMistake(rows)?.count).toBe(2)
  })
})

describe('G1 sort_position breaks a count tie', () => {
  it('the lower sort_position wins -- the taxonomy severity order', () => {
    // The real April tie in the judging book: Oversized (10) vs FOMO entry
    // (11), four each. Severity order, not the alphabet, decides.
    const rows = [
      row('Oversized', 10),
      row('Oversized', 10),
      row('Oversized', 10),
      row('Oversized', 10),
      row('FOMO entry', 11),
      row('FOMO entry', 11),
      row('FOMO entry', 11),
      row('FOMO entry', 11),
    ]
    expect(topMistake(rows)).toEqual({ name: 'Oversized', count: 4 })
  })

  it('alphabetical order is NOT the tiebreak -- it would pick the other one', () => {
    const rows = [row('Zebra mistake', 1), row('Alpha mistake', 9)]
    expect(topMistake(rows)?.name, 'a name-first tiebreak crept back in').toBe('Zebra mistake')
  })
})

describe('G1 name is the FINAL tiebreak', () => {
  it('equal count and equal sort_position fall back to name ascending', () => {
    const rows = [row('Beta', 5), row('Alpha', 5)]
    expect(topMistake(rows)).toEqual({ name: 'Alpha', count: 1 })
  })
})

describe('G1 empty input is null', () => {
  it('no rows means no top mistake -- never a fabricated zero', () => {
    expect(topMistake([])).toBeNull()
  })
})

describe('G1 the result is independent of input order', () => {
  it('the same rows shuffled twelve ways give one identical answer', () => {
    // A three-way tie at count 1 -- June in the judging book -- is the case
    // where insertion order used to decide. Every permutation must agree.
    const rows = [row('Oversized', 10), row('FOMO entry', 11), row('Averaged down', 13)]
    const expected = { name: 'Oversized', count: 1 }
    for (let seed = 1; seed <= 12; seed++) {
      expect(topMistake(shuffled(rows, seed)), `seed ${seed} disagreed`).toEqual(expected)
    }
  })

  it('and a count-tie pair is order-independent too', () => {
    const rows = [row('Oversized', 10), row('Oversized', 10), row('FOMO entry', 11), row('FOMO entry', 11)]
    for (let seed = 1; seed <= 8; seed++) {
      expect(topMistake(shuffled(rows, seed)), `seed ${seed} disagreed`).toEqual({
        name: 'Oversized',
        count: 2,
      })
    }
  })
})
