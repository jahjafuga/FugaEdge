import { describe, it, expect } from 'vitest'
import { aggregateWeekTopics } from '../aggregate'
import { CURATED_TERMS } from '../terms'

// Pure weekly aggregation — entry-recurrence counts (how many ENTRIES mentioned
// a term, reusing extractTopics's per-entry dedup), grouped into strengths
// (process) / struggles (pitfall) / neutral context (structure). No model, no
// network. Honest: only real matches, [] for a sparse week — never fabricated.

const TERMS_ONLY = { tickers: [] as string[], setups: [] as string[], terms: CURATED_TERMS }
const e = (premarket: string, postsession = '') => ({ premarket, postsession })

describe('aggregateWeekTopics — entry-recurrence counting', () => {
  it('counts ENTRIES that mention a term, not total mentions', () => {
    const entries = [
      e('FOMO got me'),
      e('clean day'),
      e('a bit of FOMO again'),
      e('FOMO third time'),
      e('calm'),
    ]
    const out = aggregateWeekTopics(entries, TERMS_ONLY)
    expect(out.find((c) => c.term === 'FOMO')?.count).toBe(3) // 3 of 5 entries
  })

  it('a term repeated within ONE entry counts once (per-entry dedup)', () => {
    const out = aggregateWeekTopics([e('FOMO FOMO FOMO all day')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'FOMO')?.count).toBe(1)
  })

  it('matches variants and counts the canonical once per entry', () => {
    const entries = [e('I followed the plan'), e('stuck to my plan today')]
    const fp = aggregateWeekTopics(entries, TERMS_ONLY).find((c) => c.term === 'followed plan')
    expect(fp?.count).toBe(2)
    expect(fp?.group).toBe('process')
  })
})

describe('aggregateWeekTopics — grouping (strengths / struggles / structure)', () => {
  it('process term → group process', () => {
    const out = aggregateWeekTopics([e('stayed with discipline')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'discipline')?.group).toBe('process')
  })

  it('pitfall term → group pitfall', () => {
    const out = aggregateWeekTopics([e('was overtrading')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'overtrading')?.group).toBe('pitfall')
  })

  it('hesitation is neutral structure (cuts both ways — no good/bad label)', () => {
    const out = aggregateWeekTopics([e('some hesitation on entries')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'hesitation')?.group).toBe('structure')
  })

  it('structure term → group structure', () => {
    const out = aggregateWeekTopics([e('held the VWAP')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'VWAP')?.group).toBe('structure')
  })
})

describe('aggregateWeekTopics — tickers + setups (neutral context)', () => {
  it('tickers and setups land in structure, counted per entry', () => {
    const vocab = { tickers: ['TSLA'], setups: ['Bull Flag'], terms: CURATED_TERMS }
    const entries = [e('traded $TSLA on a bull flag'), e('$TSLA again')]
    const out = aggregateWeekTopics(entries, vocab)
    expect(out.find((c) => c.term === 'TSLA')).toMatchObject({
      category: 'ticker',
      group: 'structure',
      count: 2,
    })
    expect(out.find((c) => c.term === 'Bull Flag')).toMatchObject({
      category: 'setup',
      group: 'structure',
      count: 1,
    })
  })
})

describe('aggregateWeekTopics — honest empty', () => {
  it('no entries → []', () => {
    expect(aggregateWeekTopics([], TERMS_ONLY)).toEqual([])
  })

  it('entries with no matches → [] (never fabricate)', () => {
    expect(aggregateWeekTopics([e('quiet'), e('nothing notable')], TERMS_ONLY)).toEqual([])
  })

  it('the dropped term "waited" produces no count', () => {
    const out = aggregateWeekTopics([e('I waited for the setup')], TERMS_ONLY)
    expect(out.find((c) => c.term === 'waited')).toBeUndefined()
    expect(out).toEqual([]) // nothing else in that text matches either
  })
})

describe('aggregateWeekTopics — multi-term, multi-entry', () => {
  it('aggregates several terms with the right groups + counts', () => {
    const entries = [
      e('had FOMO but kept discipline'),
      e('discipline again, took some profits'),
      e('chased a move'),
    ]
    const out = aggregateWeekTopics(entries, TERMS_ONLY)
    expect(out.find((c) => c.term === 'discipline')).toMatchObject({ group: 'process', count: 2 })
    expect(out.find((c) => c.term === 'FOMO')).toMatchObject({ group: 'pitfall', count: 1 })
    expect(out.find((c) => c.term === 'took profits')).toMatchObject({ group: 'process', count: 1 })
    expect(out.find((c) => c.term === 'chased')).toMatchObject({ group: 'pitfall', count: 1 })
  })
})
