import type { CommitOutcome } from './repo'

// v0.2.3 P2b — the [FJ commit] log string, extracted as a pure function so the
// format is unit-testable without standing up the whole IMPORT_COMMIT handler.
// Type-only import of CommitOutcome (erased at build) keeps this module free of
// repo.ts's runtime deps (better-sqlite3 won't load under vitest).

export interface CommitLogExtras {
  /** trips.length — total round trips handed to commit(). */
  tripsIn: number
  /** toInsertTrips.length — trips that passed preview dedup (status 'new'). */
  toInsert: number
  /** fees.length — day-fee rows handed to commit(). */
  feesIn: number
  /** Fee rows dropped for lacking a parseable date. */
  droppedNoDate: number
  countriesResolved: number
  countriesUnknown: number
}

export function formatCommitLog(out: CommitOutcome, extras: CommitLogExtras): string {
  return (
    `[FJ commit] trips_in=${extras.tripsIn}(insert=${extras.toInsert}) ` +
    `fees_in=${extras.feesIn} (dropped_no_date=${extras.droppedNoDate}) ` +
    `inserted_trips=${out.insertedTrips} skipped_trips=${out.skippedTrips} ` +
    `resurrected_trips=${out.resurrectedTrips} ` +
    `inserted_fees=${out.insertedFees} replaced_fees=${out.replacedFees} ` +
    `pairs=${out.affectedPairs} dates=[${out.affectedDates.join(',')}] ` +
    `country_resolved=${extras.countriesResolved} country_unknown=${extras.countriesUnknown}`
  )
}
