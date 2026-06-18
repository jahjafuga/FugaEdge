import { describe, it, expect } from 'vitest'
import { extractTopics } from '../extract'
import { CURATED_TERMS } from '../terms'

// Pure matcher — no jsdom, no model, no network. These tests pin the HONESTY
// guarantees: surface ONLY terms that literally appear, never invent, and never
// false-positive on substrings, articles, or lowercase tokens that merely look
// like a ticker. Under-matching is acceptable; over-matching is not.

const NO_VOCAB = { tickers: [] as string[], setups: [] as string[], terms: [] }

describe('extractTopics — tickers (case-sensitive, $-aware, 1-letter guard)', () => {
  it('matches a plain uppercase ticker', () => {
    const out = extractTopics('AAPL', { ...NO_VOCAB, tickers: ['AAPL'] })
    expect(out).toEqual([{ term: 'AAPL', category: 'ticker' }])
  })

  it('does NOT match a bare single letter (the article "a" vs ticker "A")', () => {
    const out = extractTopics('a', { ...NO_VOCAB, tickers: ['A'] })
    expect(out).toEqual([])
  })

  it('matches a $-prefixed single-letter ticker ($F)', () => {
    const out = extractTopics('$F', { ...NO_VOCAB, tickers: ['F'] })
    expect(out).toEqual([{ term: 'F', category: 'ticker' }])
  })

  it('is case-sensitive: lowercase "in" does NOT match ticker "IN"', () => {
    const out = extractTopics('in the trade', { ...NO_VOCAB, tickers: ['IN'] })
    expect(out).toEqual([])
  })

  it("dedupes a ticker repeated across the day's trades", () => {
    const out = extractTopics('AAPL ran, then AAPL faded', {
      ...NO_VOCAB,
      tickers: ['AAPL', 'AAPL'],
    })
    expect(out).toEqual([{ term: 'AAPL', category: 'ticker' }])
  })
})

describe('extractTopics — curated terms (case-insensitive, word-boundary)', () => {
  it('does NOT match "discipline" inside "undisciplined" (word boundary)', () => {
    const out = extractTopics('undisciplined', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toEqual([])
  })

  it('matches a multi-word term ("revenge trade")', () => {
    const out = extractTopics('a revenge trade', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toContainEqual({ term: 'revenge trade', category: 'term' })
  })

  it('collapses repeats to a single chip (FOMO x3 → one)', () => {
    const out = extractTopics('FOMO FOMO FOMO', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toEqual([{ term: 'FOMO', category: 'term' }])
  })

  it('matches case-insensitively but renders the canonical casing', () => {
    const out = extractTopics('felt some fomo today', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toEqual([{ term: 'FOMO', category: 'term' }])
  })
})

describe('extractTopics — setups (case-insensitive, canonical casing)', () => {
  it('matches a setup name case-insensitively and returns its canonical form', () => {
    const out = extractTopics('clean bull flag on the 5m', {
      ...NO_VOCAB,
      setups: ['Bull Flag'],
    })
    expect(out).toContainEqual({ term: 'Bull Flag', category: 'setup' })
  })
})

describe('extractTopics — honesty + combination', () => {
  it('returns [] when nothing matches (honest empty)', () => {
    const out = extractTopics('nothing notable here', {
      tickers: ['AAPL'],
      setups: ['Bull Flag'],
      terms: CURATED_TERMS,
    })
    expect(out).toEqual([])
  })

  it('returns [] for empty text even with a full vocab', () => {
    const out = extractTopics('   ', {
      tickers: ['AAPL'],
      setups: ['Bull Flag'],
      terms: CURATED_TERMS,
    })
    expect(out).toEqual([])
  })

  it('combines tickers, setups, and terms from one entry', () => {
    const out = extractTopics('Took the $TSLA bull flag with discipline', {
      tickers: ['TSLA'],
      setups: ['Bull Flag'],
      terms: CURATED_TERMS,
    })
    expect(out).toContainEqual({ term: 'TSLA', category: 'ticker' })
    expect(out).toContainEqual({ term: 'Bull Flag', category: 'setup' })
    expect(out).toContainEqual({ term: 'discipline', category: 'term' })
  })
})

describe('extractTopics — multi-word variants (natural phrasing → one canonical chip)', () => {
  it('matches "followed the plan" → "followed plan"', () => {
    const out = extractTopics('I followed the plan today', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toContainEqual({ term: 'followed plan', category: 'term' })
  })

  it('matches "took some profits" → "took profits"', () => {
    const out = extractTopics('took some profits into the spike', {
      ...NO_VOCAB,
      terms: CURATED_TERMS,
    })
    expect(out).toContainEqual({ term: 'took profits', category: 'term' })
  })

  it('matches "cut my losses" → "cut losses"', () => {
    const out = extractTopics('cut my losses fast', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toContainEqual({ term: 'cut losses', category: 'term' })
  })

  it('matches "revenge traded" → "revenge trade"', () => {
    const out = extractTopics('I revenge traded after the loss', {
      ...NO_VOCAB,
      terms: CURATED_TERMS,
    })
    expect(out).toContainEqual({ term: 'revenge trade', category: 'term' })
  })

  it('matches "halt and resume" → "halt resume"', () => {
    const out = extractTopics('played the halt and resume', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toContainEqual({ term: 'halt resume', category: 'term' })
  })

  it('collapses two different variants of one concept into a single chip', () => {
    const out = extractTopics('I followed the plan, then I followed my plan again', {
      ...NO_VOCAB,
      terms: CURATED_TERMS,
    })
    expect(out.filter((t) => t.term === 'followed plan')).toEqual([
      { term: 'followed plan', category: 'term' },
    ])
  })

  it('matches a variant and the canonical together as one chip (dedup by canonical)', () => {
    const out = extractTopics('took profits — well, took some profits', {
      ...NO_VOCAB,
      terms: CURATED_TERMS,
    })
    expect(out.filter((t) => t.term === 'took profits')).toHaveLength(1)
  })

  it('honest under-match: an UN-listed phrasing does NOT match', () => {
    const out = extractTopics('adhered to the plan', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toEqual([])
  })

  it('keeps single-word terms working unchanged (FOMO stays FOMO)', () => {
    const out = extractTopics('felt some FOMO', { ...NO_VOCAB, terms: CURATED_TERMS })
    expect(out).toEqual([{ term: 'FOMO', category: 'term' }])
  })
})

describe('extractTopics — common-word tickers excluded (stop-list)', () => {
  it('a stop-listed ticker ("ANY") does NOT match the lowercase word', () => {
    const out = extractTopics('any setup today', { ...NO_VOCAB, tickers: ['ANY'] })
    expect(out).toEqual([])
  })

  it('a stop-listed ticker does NOT match even when written uppercase ("ANY")', () => {
    const out = extractTopics('ANY', { ...NO_VOCAB, tickers: ['ANY'] })
    expect(out).toEqual([])
  })

  it('does not over-suppress: a normal ticker still matches ("AAPL")', () => {
    const out = extractTopics('AAPL ripped', { ...NO_VOCAB, tickers: ['AAPL'] })
    expect(out).toEqual([{ term: 'AAPL', category: 'ticker' }])
  })

  it('a distinctive ticker still matches ("ELAB")', () => {
    const out = extractTopics('ELAB didnt work', { ...NO_VOCAB, tickers: ['ELAB'] })
    expect(out).toEqual([{ term: 'ELAB', category: 'ticker' }])
  })
})
