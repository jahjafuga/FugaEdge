export interface JournalEntry {
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string[]
  rule_violations: string[]
  /** Voice Journal Phase 1 — length of the premarket voice recording in
   *  seconds. Undefined when no recording was made (incl. rows predating the
   *  feature). The transcript itself lands in premarket_notes. */
  premarket_recording_duration?: number
  /** Length of the post-session voice recording in seconds. Undefined when
   *  none; transcript lands in postsession_notes. */
  postsession_recording_duration?: number
}

export interface JournalDaySummary {
  trade_count: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  winners: number
  losers: number
}

export interface JournalDay {
  date: string
  entry: JournalEntry | null
  summary: JournalDaySummary | null  // null when no trades on this date
  rules: string[]                    // canonical rule list to render
  /** Market-sentiment rating (1..5) the trader set for this day, sourced
   *  from session_meta. Updated by SESSION_SENTIMENT_SAVE — the next
   *  journalGet returns the new value. Null when never set. */
  sentiment: number | null
}

export interface SaveJournalInput {
  date: string
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  rules_followed: string[]
  rule_violations: string[]
  /** Voice Journal Phase 1 — premarket recording length in seconds. Omitted /
   *  undefined when no recording was made. */
  premarket_recording_duration?: number
  /** Post-session recording length in seconds. Omitted when none. */
  postsession_recording_duration?: number
}
