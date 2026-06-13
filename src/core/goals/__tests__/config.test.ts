import { describe, expect, it } from 'vitest'
import {
  GOAL_PRESETS,
  METRIC_EVENT_TYPE,
  PROCESS_METRICS,
  parseGoalConfig,
  validateCreateGoal,
} from '../config'

// v0.2.5 Phase B Session 5 (L25/L29/L33) — pure goal-config parsing and
// validation. The v1 metric catalog is exactly four LEDGER COUNTS; the
// config window field is reserved in shape but not shipped (D25).

describe('catalog (L25)', () => {
  it('exactly four process metrics, each mapped to a ledger event type', () => {
    expect(PROCESS_METRICS).toEqual([
      'journaled_days',
      'weekly_reviews',
      'annotated_trades',
      'disciplined_entries',
    ])
    expect(METRIC_EVENT_TYPE).toEqual({
      journaled_days: 'daily_streak_bonus',
      weekly_reviews: 'weekly_review_completed',
      annotated_trades: 'trade_fully_annotated',
      disciplined_entries: 'disciplined_entry',
    })
  })
})

describe('validateCreateGoal — process', () => {
  it('accepts a valid process goal and serializes config_json', () => {
    const r = validateCreateGoal({
      title: 'Journal 30 Days',
      kind: 'process',
      config: { metric: 'journaled_days', target: 30 },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(JSON.parse(r.config_json)).toEqual({
        metric: 'journaled_days',
        target: 30,
      })
    }
  })

  it('rejects an unknown metric', () => {
    const r = validateCreateGoal({
      title: 'x',
      kind: 'process',
      config: { metric: 'net_pnl_days', target: 5 },
    })
    expect(r.ok).toBe(false)
  })

  it('rejects target < 1 and non-integer targets', () => {
    expect(
      validateCreateGoal({
        title: 'x',
        kind: 'process',
        config: { metric: 'weekly_reviews', target: 0 },
      }).ok,
    ).toBe(false)
    expect(
      validateCreateGoal({
        title: 'x',
        kind: 'process',
        config: { metric: 'weekly_reviews', target: 2.5 },
      }).ok,
    ).toBe(false)
  })
})

describe('validateCreateGoal — equity', () => {
  const valid = {
    title: 'Grow the account',
    kind: 'equity' as const,
    config: { start_date: '2026-06-01', start_amount: 2000, target_amount: 3000 },
  }

  it('accepts a valid equity goal', () => {
    const r = validateCreateGoal(valid)
    expect(r.ok).toBe(true)
  })

  it('rejects missing amounts', () => {
    expect(
      validateCreateGoal({
        ...valid,
        config: { start_date: '2026-06-01', start_amount: 2000 },
      }).ok,
    ).toBe(false)
  })

  it('rejects target_amount <= start_amount (v1)', () => {
    expect(
      validateCreateGoal({
        ...valid,
        config: { start_date: '2026-06-01', start_amount: 3000, target_amount: 3000 },
      }).ok,
    ).toBe(false)
  })

  it('rejects a malformed start_date', () => {
    expect(
      validateCreateGoal({
        ...valid,
        config: { start_date: '06/01/2026', start_amount: 1, target_amount: 2 },
      }).ok,
    ).toBe(false)
  })
})

describe('validateCreateGoal — shared', () => {
  it('rejects an empty title', () => {
    expect(
      validateCreateGoal({
        title: '   ',
        kind: 'process',
        config: { metric: 'journaled_days', target: 3 },
      }).ok,
    ).toBe(false)
  })
})

describe('parseGoalConfig (read side)', () => {
  it('round-trips a valid process config', () => {
    expect(parseGoalConfig('process', '{"metric":"annotated_trades","target":100}')).toEqual({
      kind: 'process',
      config: { metric: 'annotated_trades', target: 100 },
    })
  })

  it('round-trips a valid equity config', () => {
    expect(
      parseGoalConfig(
        'equity',
        '{"start_date":"2026-06-01","start_amount":2000,"target_amount":3000}',
      ),
    ).toEqual({
      kind: 'equity',
      config: { start_date: '2026-06-01', start_amount: 2000, target_amount: 3000 },
    })
  })

  it('returns null on malformed JSON or invalid shapes (defensive read)', () => {
    expect(parseGoalConfig('process', 'not json')).toBeNull()
    expect(parseGoalConfig('process', '{"metric":"bogus","target":1}')).toBeNull()
    expect(parseGoalConfig('equity', '{"start_amount":1}')).toBeNull()
  })
})

describe('GOAL_PRESETS (L33 amended 2026-06-13 — 4 process + 2 equity)', () => {
  it('ships exactly six presets: four process, then two equity', () => {
    expect(GOAL_PRESETS.map((p) => p.id)).toEqual([
      'journal-30',
      'annotation-century',
      'discipline-week',
      'review-ritual',
      'equity-grow-base',
      'equity-million',
    ])
    expect(GOAL_PRESETS.map((p) => p.kind)).toEqual([
      'process',
      'process',
      'process',
      'process',
      'equity',
      'equity',
    ])
  })

  it('every process preset validates as a process goal', () => {
    for (const p of GOAL_PRESETS) {
      if (p.kind !== 'process') continue
      expect(
        validateCreateGoal({
          title: 'preset',
          kind: 'process',
          config: { metric: p.metric, target: p.target },
        }).ok,
      ).toBe(true)
    }
  })

  it('equity presets carry EITHER an absolute target OR a delta (mutually exclusive)', () => {
    const byId = Object.fromEntries(GOAL_PRESETS.map((p) => [p.id, p]))
    const grow = byId['equity-grow-base']
    const million = byId['equity-million']
    expect(grow.kind).toBe('equity')
    expect(million.kind).toBe('equity')
    if (grow.kind === 'equity' && million.kind === 'equity') {
      // "Grow the Base" — +$1,000 from the user's own starting amount.
      expect(grow.targetDelta).toBe(1000)
      expect(grow.targetAmount).toBeUndefined()
      // "Make a Million" — the absolute seven-figure target.
      expect(million.targetAmount).toBe(1_000_000)
      expect(million.targetDelta).toBeUndefined()
    }
  })

  it('equity presets reach the UNCHANGED validator once resolved to concrete amounts', () => {
    // Absolute target: start below 1,000,000.
    expect(
      validateCreateGoal({
        title: 'Make a Million',
        kind: 'equity',
        config: { start_date: '2026-06-13', start_amount: 25_000, target_amount: 1_000_000 },
      }).ok,
    ).toBe(true)
    // Delta resolves to start + 1,000 before it ever reaches the validator.
    expect(
      validateCreateGoal({
        title: 'Grow the Base',
        kind: 'equity',
        config: { start_date: '2026-06-13', start_amount: 5_000, target_amount: 5_000 + 1000 },
      }).ok,
    ).toBe(true)
  })
})
