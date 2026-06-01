// v0.2.3 P2b — pins the [FJ commit] log format, especially the new
// resurrected_trips field. Tests the pure formatCommitLog helper directly so
// the format is locked without standing up the (untestable) IMPORT_COMMIT
// handler. type-only CommitOutcome import keeps repo.ts out of the module graph.

import { describe, expect, it } from 'vitest'
import { formatCommitLog } from '../format-commit-log'
import type { CommitOutcome } from '../repo'

const out: CommitOutcome = {
  insertedTrips: 3,
  skippedTrips: 1,
  resurrectedTrips: 2,
  insertedFees: 4,
  replacedFees: 0,
  affectedDates: ['2026-01-05', '2026-01-06'],
  affectedPairs: 5,
}

const extras = {
  tripsIn: 6,
  toInsert: 4,
  feesIn: 4,
  droppedNoDate: 0,
  countriesResolved: 1,
  countriesUnknown: 2,
}

describe('formatCommitLog', () => {
  it('surfaces resurrected_trips with its count', () => {
    expect(formatCommitLog(out, extras)).toContain('resurrected_trips=2')
  })

  it('preserves every pre-existing field of the log line', () => {
    const s = formatCommitLog(out, extras)
    expect(s).toContain('[FJ commit]')
    expect(s).toContain('trips_in=6(insert=4)')
    expect(s).toContain('fees_in=4 (dropped_no_date=0)')
    expect(s).toContain('inserted_trips=3')
    expect(s).toContain('skipped_trips=1')
    expect(s).toContain('inserted_fees=4')
    expect(s).toContain('replaced_fees=0')
    expect(s).toContain('pairs=5')
    expect(s).toContain('dates=[2026-01-05,2026-01-06]')
    expect(s).toContain('country_resolved=1')
    expect(s).toContain('country_unknown=2')
  })

  it('orders resurrected_trips immediately after skipped_trips', () => {
    const s = formatCommitLog(out, extras)
    expect(s).toMatch(/skipped_trips=1 resurrected_trips=2/)
  })
})
