// Shared test fixture — full SettingsValues / SettingsPayload builders, mirroring
// the trade.ts fixture pattern. Defaults match electron/settings/repo.ts DEFAULTS
// so a rendered Settings page loads a realistic editor. Override any field.

import type { SettingsValues, SettingsPayload } from '@shared/settings-types'

export function makeSettingsValues(overrides: Partial<SettingsValues> = {}): SettingsValues {
  return {
    max_daily_loss: 500,
    daily_profit_target: 0,
    account_size: 25000,
    journal_rules: [],
    mistake_list: [],
    day_tag_list: [],
    daily_rule_break_list: [],
    polygon_api_key: '',
    fmp_api_key: '',
    last_country_backfill: null,
    show_macd_pane: false,
    show_ema9: false,
    show_ema20: false,
    show_vwap: false,
    activation_key: '',
    activation_payload: '',
    activation_grace_started_at: null,
    dna_price_min: 2,
    dna_price_max: 20,
    dna_change_min: 10,
    dna_rvol_min: 5,
    dna_float_min: 0,
    dna_float_max: 20_000_000,
    dna_require_catalyst: true,
    ...overrides,
  }
}

export function makeSettingsPayload(overrides: Partial<SettingsValues> = {}): SettingsPayload {
  return {
    values: makeSettingsValues(overrides),
    db_path: 'C:/test/fugaedge.db',
    stored_keys: [],
  }
}
