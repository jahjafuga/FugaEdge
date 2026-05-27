// Data-health surface — diagnostic info the renderer surfaces to the user
// about prior migrations / data-integrity events. v0.2.1 ships with one
// signal: the count of historical duplicate trades the content_hash
// migration detected on the first launch after upgrade.

export interface DataHealth {
  /** Count of historical duplicate trades detected during the v0.2.1
   *  content_hash backfill migration. 0 when none were found OR when the
   *  migration hasn't run on this DB. Read once per session and surfaced
   *  via a banner on the Trades page until the user dismisses it. */
  contentHashMigrationCollisions: number
  /** True once the user dismisses the banner. The migration writes this
   *  via DATA_HEALTH_ACKNOWLEDGE_COLLISIONS and the banner uses it to
   *  decide whether to render. */
  contentHashMigrationCollisionsAcknowledged: boolean
}
