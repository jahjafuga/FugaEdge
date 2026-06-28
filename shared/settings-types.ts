export interface SettingsValues {
  max_daily_loss: number
  /** v0.2.5 — daily net-P&L profit target in dollars; 0 = not set / disabled.
   *  The profit-side mirror of max_daily_loss (a per-day threshold). */
  daily_profit_target: number
  account_size: number
  /** v0.2.6 — STILL string[] this beat (the legacy model). Beat 2 migrates the
   *  stored value to JournalRule[] ({id,name,archived}) via
   *  migrate-journal-rules-to-objects; Beats 3-4 then flip this type + rewire the
   *  consumers (Settings RuleList editor, RuleChecklist, saveJournalDay, journal
   *  read). See shared/journal-types JournalRule. */
  journal_rules: string[]
  mistake_list: string[]
  day_tag_list: string[]
  polygon_api_key: string
  /** v0.2.2 Commit A — FMP (Financial Modeling Prep) API key, paired with
   *  the Polygon/Massive key for real-float enrichment. Empty on fresh
   *  install; user pastes their own in Settings → Market data. Surfacing
   *  wired up in Commit A; enrichment consumption ships in Commit B. */
  fmp_api_key: string
  last_country_backfill: string | null   // ISO timestamp; null when never run
  /** On-chart indicator toggles — global per-user preferences, ALL default-OFF
   *  (B1): the chart opens clean and the trader adds only the overlays they want,
   *  and a turned-off indicator stays off across modal reopen. show_macd_pane was
   *  the original (default-on) persisted toggle; B1 makes EMA9 / EMA20 / VWAP
   *  persist the same way and flips every default to off. */
  show_macd_pane: boolean
  show_ema9: boolean
  show_ema20: boolean
  show_vwap: boolean
  /** v0.2.5 §C — the verified activation key, exactly as pasted (trimmed).
   *  Empty until the user activates; re-verified at every boot so a
   *  tampered value degrades to "no key". */
  activation_key: string
  /** v0.2.5 §C — the verified payload JSON ({name, email, issued_at}),
   *  stored alongside the key for display without re-decoding. */
  activation_payload: string
  /** v0.2.5 §C — ISO timestamp of the first keyless boot on a DB that
   *  already had trades; starts the 14-day grace window. Stamped exactly
   *  once; null when never started. */
  activation_grace_started_at: string | null
  // v0.2.5 Trader DNA — stock-selection pillars. The user's own scan profile;
  // EdgeIQ's Trader DNA card measures how well their trades matched it. Defaults
  // to the Ross Cameron momentum profile ($2–20, ≥10% day change, ≥5× RVOL,
  // ≤20M float, catalyst required) — all user-editable. Float is a RAW share
  // count (the UI displays millions). Self-contained block so the future
  // Settings remodel can lift it whole.
  dna_price_min: number
  dna_price_max: number
  /** Daily % change floor (e.g. 10 = "up ≥10% on the day"). */
  dna_change_min: number
  /** Relative-volume floor (e.g. 5 = "≥5× average volume"). */
  dna_rvol_min: number
  dna_float_min: number
  dna_float_max: number
  dna_require_catalyst: boolean
}

export interface SettingsPayload {
  values: SettingsValues
  db_path: string
  /** L24 — raw settings-row keys present in the DB. `values` is
   *  default-filled, so only row existence can distinguish "never
   *  configured" from "configured to the default" (fresh-install detector). */
  stored_keys: string[]
}

export type SettingsUpdate = Partial<SettingsValues>

export interface ExportResult {
  canceled: boolean
  path?: string
  rowCount?: number
}
