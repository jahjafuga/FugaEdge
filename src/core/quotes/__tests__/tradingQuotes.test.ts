import { describe, it, expect } from 'vitest'
import {
  QUOTES,
  pickQuoteForContext,
  categoriesFor,
  type QuoteCategory,
  type TradingQuote,
} from '../tradingQuotes'

const REQUIRED_AUTHORS = [
  'Mark Douglas',
  'Jesse Livermore',
  'Jack Schwager',
  'Paul Tudor Jones',
  'Stanley Druckenmiller',
  'Ray Dalio',
  'Ed Seykota',
  'Bruce Kovner',
  'Linda Raschke',
  'Marty Schwartz',
  'Richard Dennis',
  "William O'Neil",
  'Nicolas Darvas',
  'Larry Williams',
  'Van Tharp',
  'Brett Steenbarger',
]

const VALID_CATEGORIES: QuoteCategory[] = [
  'discipline', 'risk', 'psychology', 'patience',
  'losses', 'process', 'edge', 'general',
]

describe('QUOTES pool', () => {
  it('has at least 60 entries', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(60)
  })

  it('every entry has a non-empty text, author, and a valid category', () => {
    for (const q of QUOTES) {
      expect(q.text.trim().length).toBeGreaterThan(0)
      expect(q.author.trim().length).toBeGreaterThan(0)
      expect(VALID_CATEGORIES).toContain(q.category)
    }
  })

  it('every entry keeps text under 25 words', () => {
    for (const q of QUOTES) {
      const words = q.text.trim().split(/\s+/).length
      expect(words, `quote ${q.id} ("${q.text.slice(0, 40)}…") was ${words} words`).toBeLessThanOrEqual(25)
    }
  })

  it('ids are unique and contiguous from 0', () => {
    const ids = QUOTES.map((q) => q.id).sort((a, b) => a - b)
    expect(ids).toEqual(Array.from({ length: QUOTES.length }, (_, i) => i))
  })

  it('includes every required author from the v0.1.6 spec', () => {
    const present = new Set(QUOTES.map((q) => q.author))
    for (const name of REQUIRED_AUTHORS) {
      expect(present.has(name), `missing author: ${name}`).toBe(true)
    }
  })
})

describe('pickQuoteForContext rotation', () => {
  it('never returns the excluded id when more than one candidate exists', () => {
    for (const ctx of ['no-trade', 'winning', 'losing', 'mixed', 'journal-only'] as const) {
      const cats = new Set(categoriesFor(ctx))
      const pool = QUOTES.filter((q) => cats.has(q.category))
      if (pool.length < 2) continue
      for (const last of pool) {
        for (let n = 0; n < 64; n++) {
          const picked = pickQuoteForContext(ctx, last.id, n)
          expect(picked.id).not.toBe(last.id)
        }
      }
    }
  })

  it('returns the same quote deterministically for a fixed nonce', () => {
    const a = pickQuoteForContext('winning', null, 42)
    const b = pickQuoteForContext('winning', null, 42)
    expect(a.id).toBe(b.id)
  })

  it('still returns a valid quote when the excluded id is the only category candidate', () => {
    const onlyInLosing = QUOTES.filter((q) => categoriesFor('losing').includes(q.category))
    if (onlyInLosing.length === 0) return
    const target: TradingQuote = onlyInLosing[0]
    const picked = pickQuoteForContext('losing', target.id, 1)
    expect(picked.id).not.toBe(target.id)
    expect(picked.text.length).toBeGreaterThan(0)
  })
})
