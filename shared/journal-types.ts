export interface JournalEntry {
  premarket_notes: string
  postsession_notes: string
  emotion_rating: number | null
  /** Per-day rule references, as rule ID strings (post-Beat-2; was NAME strings).
   *  Still string[] — but each string is now a JournalRule.id into
   *  settings.journal_rules, so rename/archive no longer orphan the history.
   *  Resolve to a display name via resolveRuleName (src/core/journal/rules). */
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
  // Canonical rule list (id-stable model). Includes archived rules so the UI can
  // resolve a past day's archived-rule refs to names; render the ACTIVE checklist
  // via activeRules (src/core/journal/rules).
  rules: JournalRule[]
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

/**
 * Id-stable journal-rule model — the target shape for a journal rule, replacing the bare
 * `string` model: a rule now carries a STABLE id (minted once at creation,
 * never changes on rename) so rename is id-safe and per-entry history survives,
 * plus an `archived` flag so a retired rule drops off the active checklist
 * without destroying its history.
 *
 * NOT yet wired into SettingsValues.journal_rules (still `string[]` this beat).
 * The settings flip + the per-entry remap (rules_followed/rule_violations: rule
 * NAMES -> rule IDS) + orphan resurrection land in Beats 2-4, behind
 * migrate-journal-rules-to-objects.
 */
export interface JournalRule {
  /** Stable id, minted once at creation (ULID). Never changes on rename. */
  id: string
  /** Display label; editable. Renaming mutates this, not the id. */
  name: string
  /** Hidden from the active checklist; history is preserved. */
  archived: boolean
}
