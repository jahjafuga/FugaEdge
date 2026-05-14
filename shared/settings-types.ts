export interface SettingsValues {
  max_daily_loss: number
  account_size: number
  journal_rules: string[]
  mistake_list: string[]
  day_tag_list: string[]
  polygon_api_key: string
  last_country_backfill: string | null   // ISO timestamp; null when never run
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
