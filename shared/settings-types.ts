export interface SettingsValues {
  max_daily_loss: number
  account_size: number
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
  /** §H on-chart MACD sub-pane toggle — a global per-user preference, default-on.
   *  The one persisted indicator toggle: EMA9 / EMA20 / VWAP stay ephemeral chart
   *  state, but MACD is v0.2.4's hero indicator, so its pane survives modal reopen. */
  show_macd_pane: boolean
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
}

export interface SettingsPayload {
  values: SettingsValues
  db_path: string
}

export type SettingsUpdate = Partial<SettingsValues>

export interface ExportResult {
  canceled: boolean
  path?: string
  rowCount?: number
}
