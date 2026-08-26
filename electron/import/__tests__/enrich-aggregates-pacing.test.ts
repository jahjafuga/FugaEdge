import { describe, expect, it } from 'vitest'

// v0.2.7 — THE AGGREGATES PACER'S SPACING, DERIVED.
//
// This path fetched at an ad-hoc three-hundred-and-fifty-millisecond floor,
// roughly three calls a second, against a documented budget of five a minute.
// electron/market/fetch.ts:22-28 records the identical constant being removed
// from a sibling as the cause of a one-hundred-and-forty-five-failed storm, and
// names the replacement: a spacing COMPUTED from the rate limit rather than
// chosen. That correction reached one file at a time; this is another.
//
// THE ASSERTION IS THE DERIVATION, NEVER THE NUMBER. A test pinning the value
// the limit happens to produce today would pass today and stop guarding on the
// one occasion it exists for — the moment the limit changes underneath it.
//
// WHY NO SLEEP-COUNT GUARD HERE. This module does not sleep; it hands its
// spacing to the pure orchestrator in src/core/aggregates, which owns the wait.
// Asserting the sleep COUNT would mean making that module's timer injectable —
// two more files, and the orchestrator's own loop is already covered. What was
// unguarded is the VALUE this module hands it, and that is what these pin.

import { REQUEST_SPACING_MS } from '../enrich-aggregates'
import {
  POLYGON_FREE_TIER_CALLS_PER_MIN,
  spacingMsForCallsPerMin,
} from '../../market/rate-limit'

describe('RL1 the aggregates spacing is DERIVED from the rate limit', () => {
  it('it equals the derivation, not an ad-hoc number', () => {
    expect(
      REQUEST_SPACING_MS,
      'the aggregates pacer is not derived from the rate limit — it will empty ' +
        'the budget and absorb the ceiling as retry backoff instead of pacing under it',
    ).toBe(spacingMsForCallsPerMin(POLYGON_FREE_TIER_CALLS_PER_MIN))
  })
})

describe('RL2 the permitted rate never exceeds the limit', () => {
  // One-sided by design: it guards the direction that actually costs calls,
  // independently of whatever arithmetic produced the spacing.
  it('calls per minute at this spacing is within budget', () => {
    expect(60_000 / REQUEST_SPACING_MS).toBeLessThanOrEqual(POLYGON_FREE_TIER_CALLS_PER_MIN)
  })
})
