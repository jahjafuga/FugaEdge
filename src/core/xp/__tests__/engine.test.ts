import { describe, expect, it } from 'vitest'
import {
  buildGoalCompletedIntent,
  buildWeeklyReviewIntent,
  computeAwardIntents,
} from '../engine'
import type { ExistingEventFact, SessionFact, TradeFact } from '../types'

// v0.2.5 Phase A Session 2 — the pure intent engine (D12/D13, rulings L4-L9
// + adjustments A1/A2). Both the inline hooks and the Session 3 sweep call
// computeAwardIntents; these tests pin the convergence/determinism contract
// that makes that sharing safe.

const NOW = '2026-06-12T20:00:00.000Z' // a Friday; fresh window reaches back to 06-05

function trade(overrides: Partial<TradeFact> = {}): TradeFact {
  const id = overrides.id ?? 1
  return {
    id,
    tradeKey: `h${id}`,
    date: '2026-06-10',
    hasPlaybook: true,
    hasCatalyst: true,
    hasNote: true,
    technicals1m: null, // annotate-only by default; discipline tests opt in
    ...overrides,
  }
}

const DISCIPLINED = { macdPositive: true, vwapDistPct: 0.8, ema9DistPct: 0.4 }

function session(overrides: Partial<SessionFact> = {}): SessionFact {
  return {
    date: '2026-06-10',
    tradeCount: 2,
    sentimentSet: false, // non-journaled by default; streak tests opt in
    allTradesPlaybookTagged: false,
    isNoTradeDay: false,
    importedAt: '2026-06-10 18:00:00',
    ...overrides,
  }
}

function existing(overrides: Partial<ExistingEventFact> = {}): ExistingEventFact {
  return {
    event_type: 'trade_fully_annotated',
    idempotency_key: 'annotate:ghost',
    source_ref: '2026-06-10',
    ...overrides,
  }
}

function compute(input: {
  nowIso?: string
  sessions?: SessionFact[]
  trades?: TradeFact[]
  existing?: ExistingEventFact[]
}) {
  return computeAwardIntents({
    nowIso: input.nowIso ?? NOW,
    sessions: input.sessions ?? [],
    trades: input.trades ?? [],
    existing: input.existing ?? [],
  })
}

describe('session intents (L7/L8)', () => {
  it('fresh import (same day) → session_journaled +40 keyed session:{date}', () => {
    expect(compute({ sessions: [session()] })).toEqual([
      {
        event_type: 'session_journaled',
        xp: 40,
        idempotency_key: 'session:2026-06-10',
        source_ref: '2026-06-10',
      },
    ])
  })

  it('import long after the session date → archive +10 keyed session_archive:{date}', () => {
    expect(
      compute({
        sessions: [session({ date: '2026-01-15', importedAt: '2026-06-10 12:00:00' })],
      }),
    ).toEqual([
      {
        event_type: 'session_journaled_archive',
        xp: 10,
        idempotency_key: 'session_archive:2026-01-15',
        source_ref: '2026-01-15',
      },
    ])
  })

  it('L7 boundary on importedAt − sessionDate: day 7 fresh, day 8 archive', () => {
    const day7 = compute({
      sessions: [session({ date: '2026-06-01', importedAt: '2026-06-08 09:00:00' })],
    })
    expect(day7[0].event_type).toBe('session_journaled')
    const day8 = compute({
      sessions: [session({ date: '2026-06-01', importedAt: '2026-06-09 09:00:00' })],
    })
    expect(day8[0].event_type).toBe('session_journaled_archive')
  })

  it('null importedAt → archive (the sweep history default)', () => {
    const out = compute({ sessions: [session({ importedAt: null })] })
    expect(out).toHaveLength(1)
    expect(out[0].event_type).toBe('session_journaled_archive')
  })

  it('malformed importedAt → treated as null → archive (A1, under-pay direction)', () => {
    const out = compute({ sessions: [session({ importedAt: 'corrupted-timestamp' })] })
    expect(out).toHaveLength(1)
    expect(out[0].event_type).toBe('session_journaled_archive')
  })

  it('both-keys exclusion: an existing session:{date} blocks the archive intent', () => {
    expect(
      compute({
        sessions: [session({ importedAt: null })], // would emit archive
        existing: [
          existing({
            event_type: 'session_journaled',
            idempotency_key: 'session:2026-06-10',
          }),
        ],
      }),
    ).toEqual([])
  })

  it('both-keys exclusion: an existing session_archive:{date} blocks the fresh intent', () => {
    expect(
      compute({
        sessions: [session()], // would emit fresh
        existing: [
          existing({
            event_type: 'session_journaled_archive',
            idempotency_key: 'session_archive:2026-06-10',
          }),
        ],
      }),
    ).toEqual([])
  })

  it('zero-trade date → no session intent (L8: it rewards the import act)', () => {
    expect(compute({ sessions: [session({ tradeCount: 0 })] })).toEqual([])
  })
})

describe('streak intents (L8 / D9)', () => {
  it('a no-trade journaled day earns the streak bonus ONLY', () => {
    expect(
      compute({
        sessions: [
          session({ tradeCount: 0, isNoTradeDay: true, importedAt: null }),
        ],
      }),
    ).toEqual([
      {
        event_type: 'daily_streak_bonus',
        xp: 25,
        idempotency_key: 'streak:2026-06-10',
        source_ref: '2026-06-10',
      },
    ])
  })

  it('a fully journaled trading day earns session + streak (streak sorts first)', () => {
    expect(
      compute({
        sessions: [session({ sentimentSet: true, allTradesPlaybookTagged: true })],
      }),
    ).toEqual([
      {
        event_type: 'daily_streak_bonus',
        xp: 25,
        idempotency_key: 'streak:2026-06-10',
        source_ref: '2026-06-10',
      },
      {
        event_type: 'session_journaled',
        xp: 40,
        idempotency_key: 'session:2026-06-10',
        source_ref: '2026-06-10',
      },
    ])
  })

  it('an existing streak:{date} key blocks re-award', () => {
    expect(
      compute({
        sessions: [session({ tradeCount: 0, isNoTradeDay: true, importedAt: null })],
        existing: [
          existing({
            event_type: 'daily_streak_bonus',
            idempotency_key: 'streak:2026-06-10',
          }),
        ],
      }),
    ).toEqual([])
  })

  it('a neutral day (zero trades, no no-trade mark) earns nothing', () => {
    expect(
      compute({ sessions: [session({ tradeCount: 0, importedAt: null })] }),
    ).toEqual([])
  })
})

describe('per-trade intents — annotate cap mechanics (L5)', () => {
  it('8 eligible fresh trades → exactly 6 intents, id-ascending selection', () => {
    const ids = [7, 3, 8, 1, 5, 2, 6, 4] // shuffled input order
    const out = compute({ trades: ids.map((id) => trade({ id })) })
    expect(out.map((i) => i.idempotency_key)).toEqual([
      'annotate:h1',
      'annotate:h2',
      'annotate:h3',
      'annotate:h4',
      'annotate:h5',
      'annotate:h6',
    ])
    expect(out.every((i) => i.event_type === 'trade_fully_annotated')).toBe(true)
    expect(out.every((i) => i.xp === 12)).toBe(true)
    expect(out.every((i) => i.source_ref === '2026-06-10')).toBe(true) // L4
  })

  it('top-up: 4 existing events for the date + 5 candidates → 2 intents, lowest-id unpaid', () => {
    const existing4 = [1, 2, 3, 4].map((n) =>
      existing({ idempotency_key: `annotate:x${n}` }),
    )
    const out = compute({
      trades: [10, 20, 30, 40, 50].map((id) => trade({ id })),
      existing: existing4,
    })
    expect(out.map((i) => i.idempotency_key)).toEqual([
      'annotate:h10',
      'annotate:h20',
    ])
  })

  it('convergence: 6 existing covering a DIFFERENT six than id-order → 0 new intents', () => {
    const existing6 = [3, 4, 5, 6, 7, 8].map((n) =>
      existing({ idempotency_key: `annotate:h${n}` }),
    )
    const out = compute({
      trades: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => trade({ id })),
      existing: existing6,
    })
    expect(out).toEqual([])
  })

  it('an existing event whose trade was hard-deleted still consumes its slot via source_ref', () => {
    const out = compute({
      trades: [1, 2, 3, 4, 5, 6, 7].map((id) => trade({ id })),
      existing: [existing({ idempotency_key: 'annotate:gone-trade' })],
    })
    expect(out.map((i) => i.idempotency_key)).toEqual([
      'annotate:h1',
      'annotate:h2',
      'annotate:h3',
      'annotate:h4',
      'annotate:h5',
    ])
  })

  it('an existing event with a null/legacy source_ref consumes NO slot (defensive)', () => {
    const out = compute({
      trades: [1, 2, 3, 4, 5, 6, 7].map((id) => trade({ id })),
      existing: [existing({ idempotency_key: 'annotate:legacy', source_ref: null })],
    })
    expect(out).toHaveLength(6)
  })

  it('ineligible trades are not candidates and consume nothing', () => {
    const out = compute({
      trades: [
        trade({ id: 1, hasNote: false }), // not fully annotated (D8)
        trade({ id: 2 }),
      ],
    })
    expect(out.map((i) => i.idempotency_key)).toEqual(['annotate:h2'])
  })
})

describe('per-trade intents — discipline cap analog (L5 / D7)', () => {
  it('6 disciplined trades → exactly 4 intents, id-ascending, +15 each', () => {
    const out = compute({
      trades: [1, 2, 3, 4, 5, 6].map((id) =>
        trade({ id, hasCatalyst: false, technicals1m: { ...DISCIPLINED } }),
      ),
    })
    expect(out.map((i) => i.idempotency_key)).toEqual([
      'discipline:h1',
      'discipline:h2',
      'discipline:h3',
      'discipline:h4',
    ])
    expect(out.every((i) => i.event_type === 'disciplined_entry')).toBe(true)
    expect(out.every((i) => i.xp === 15)).toBe(true)
  })

  it('annotate and discipline caps are tracked independently on one date', () => {
    const out = compute({
      trades: [1, 2].map((id) => trade({ id, technicals1m: { ...DISCIPLINED } })),
      existing: [
        existing({ idempotency_key: 'annotate:other', source_ref: '2026-06-10' }),
      ],
    })
    // annotate: cap 6, 1 used → both land. discipline: cap 4, 0 used → both land.
    expect(out.map((i) => i.idempotency_key)).toEqual([
      'discipline:h1',
      'discipline:h2',
      'annotate:h1',
      'annotate:h2',
    ])
  })
})

describe('fresh window (L6) — per-trade XP only inside 7 days', () => {
  it('a stale trade (day 8) earns no per-trade intents even if eligible', () => {
    const out = compute({
      trades: [trade({ id: 1, date: '2026-06-04', technicals1m: { ...DISCIPLINED } })],
    })
    expect(out).toEqual([])
  })

  it('day-7 inclusive / day-8 exclusive, immune to the time of day (A1)', () => {
    const t = [trade({ id: 1, date: '2026-06-05' })]
    // 23:59:59 on day 7 — a local-time parse would tip this to day 8 in
    // some zones; the date-prefix rule keeps it day 7.
    expect(
      compute({ nowIso: '2026-06-12 23:59:59', trades: t }),
    ).toHaveLength(1)
    expect(
      compute({ nowIso: '2026-06-13 00:00:01', trades: t }),
    ).toEqual([])
  })

  it('staleness does not affect the SESSION award (D4: archive exists for that)', () => {
    const out = compute({
      sessions: [session({ date: '2026-06-04', importedAt: '2026-06-04 20:00:00' })],
      trades: [trade({ id: 1, date: '2026-06-04' })],
    })
    expect(out).toEqual([
      {
        event_type: 'session_journaled',
        xp: 40,
        idempotency_key: 'session:2026-06-04',
        source_ref: '2026-06-04',
      },
    ])
  })
})

describe('engine properties (L9)', () => {
  // Two dates, every intent family represented, plus an existing event.
  function richInput() {
    return {
      nowIso: NOW,
      sessions: [
        session({
          date: '2026-06-09',
          tradeCount: 1,
          sentimentSet: true,
          allTradesPlaybookTagged: true,
          importedAt: '2026-06-09 20:00:00',
        }),
        session({ date: '2026-06-10', tradeCount: 2, importedAt: null }),
      ],
      trades: [
        trade({ id: 5, date: '2026-06-09', technicals1m: { ...DISCIPLINED } }),
        trade({ id: 7, date: '2026-06-10' }),
        trade({ id: 2, date: '2026-06-10' }),
      ],
      existing: [
        existing({
          event_type: 'disciplined_entry',
          idempotency_key: 'discipline:hX',
          source_ref: '2026-06-08',
        }),
      ],
    }
  }

  const RICH_EXPECTED_KEYS = [
    // 2026-06-09, event_type lexicographic, then trade id:
    'streak:2026-06-09',
    'discipline:h5',
    'session:2026-06-09',
    'annotate:h5',
    // 2026-06-10:
    'session_archive:2026-06-10',
    'annotate:h2',
    'annotate:h7',
  ]

  it('global order pinned: date asc, then event_type, then trade id (L9)', () => {
    expect(compute(richInput()).map((i) => i.idempotency_key)).toEqual(
      RICH_EXPECTED_KEYS,
    )
  })

  it('determinism: identical input → deep-equal output, including order', () => {
    expect(compute(richInput())).toEqual(compute(richInput()))
  })

  it('determinism: input array order is irrelevant', () => {
    const a = richInput()
    const b = richInput()
    b.sessions.reverse()
    b.trades.reverse()
    b.existing.reverse()
    expect(compute(b)).toEqual(compute(a))
  })

  it('subset-safety: the engine over one date equals that date’s slice of the full output', () => {
    const full = compute(richInput())
    const d2Only = compute({
      sessions: richInput().sessions.filter((s) => s.date === '2026-06-10'),
      trades: richInput().trades.filter((t) => t.date === '2026-06-10'),
      existing: [],
    })
    expect(d2Only).toEqual(full.filter((i) => i.source_ref === '2026-06-10'))
  })

  it('empty input → []', () => {
    expect(compute({})).toEqual([])
  })
})

describe('buildWeeklyReviewIntent (A2 — Sunday guard)', () => {
  it('a valid Sunday mints the D13 key at +175', () => {
    expect(buildWeeklyReviewIntent('2026-06-07')).toEqual({
      event_type: 'weekly_review_completed',
      xp: 175,
      idempotency_key: 'weekly_review:2026-06-07',
      source_ref: '2026-06-07',
    })
  })

  it('a Monday throws — a wrong-anchor key would be a double-award idempotency cannot catch', () => {
    expect(() => buildWeeklyReviewIntent('2026-06-08')).toThrow()
  })

  it.each([
    ['unpadded', '2026-6-7'],
    ['full timestamp', '2026-06-07T00:00:00Z'],
    ['semantic rollover', '2026-02-31'],
    ['empty', ''],
  ] as const)('malformed input (%s) throws', (_label, bad) => {
    expect(() => buildWeeklyReviewIntent(bad)).toThrow()
  })
})

describe('buildGoalCompletedIntent', () => {
  it('mints the D13 goal key at +1,000 with the ULID as source_ref', () => {
    expect(buildGoalCompletedIntent('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toEqual({
      event_type: 'goal_completed',
      xp: 1000,
      idempotency_key: 'goal:01ARZ3NDEKTSV4RRFFQ69G5FAV:completed',
      source_ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    })
  })
})
