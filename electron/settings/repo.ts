import { getDbPath, openDatabase } from '../db/database'
import { parseJournalRules, cleanJournalRules } from '@/core/journal/rules'
import type {
  SettingsPayload,
  SettingsUpdate,
  SettingsValues,
} from '@shared/settings-types'

const KEYS = {
  maxDailyLoss: 'max_daily_loss',
  dailyProfitTarget: 'daily_profit_target',
  accountSize: 'account_size',
  journalRules: 'journal_rules',
  mistakeList: 'mistake_list',
  dayTagList: 'day_tag_list',
  dailyRuleBreakList: 'daily_rule_break_list',
  polygonApiKey: 'polygon_api_key',
  fmpApiKey: 'fmp_api_key',
  lastCountryBackfill: 'last_country_backfill',
  showMacdPane: 'show_macd_pane',
  showEma9: 'show_ema9',
  showEma20: 'show_ema20',
  showVwap: 'show_vwap',
  activationKey: 'activation_key',
  activationPayload: 'activation_payload',
  activationGraceStartedAt: 'activation_grace_started_at',
  // v0.2.5 Trader DNA — stock-selection pillars (liftable block).
  dnaPriceMin: 'dna_price_min',
  dnaPriceMax: 'dna_price_max',
  dnaChangeMin: 'dna_change_min',
  dnaRvolMin: 'dna_rvol_min',
  dnaFloatMin: 'dna_float_min',
  dnaFloatMax: 'dna_float_max',
  dnaRequireCatalyst: 'dna_require_catalyst',
} as const

const DEFAULTS: SettingsValues = {
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
  // Ross Cameron momentum scan profile — sensible config, all user-editable.
  // Float as a raw share count (20M). dna_float_min 0 = no lower floor.
  dna_price_min: 2,
  dna_price_max: 20,
  dna_change_min: 10,
  dna_rvol_min: 5,
  dna_float_min: 0,
  dna_float_max: 20_000_000,
  dna_require_catalyst: true,
}

function parseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed)
      if (Array.isArray(arr)) return arr.map((s) => String(s)).filter(Boolean)
    } catch {
      // fall through
    }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
}

function parseNumber(raw: string | null | undefined, fallback: number): number {
  if (raw == null) return fallback
  const n = Number.parseFloat(String(raw))
  return Number.isFinite(n) ? n : fallback
}

// KV values persist as TEXT; booleans encode as '1' / '0'. Anything else (a
// missing key, or a legacy / corrupt value) falls back to the provided default.
function parseBoolean(
  raw: string | null | undefined,
  fallback: boolean,
): boolean {
  if (raw == null) return fallback
  const t = raw.trim().toLowerCase()
  if (t === '1' || t === 'true') return true
  if (t === '0' || t === 'false') return false
  return fallback
}

function readMap(): Record<string, string> {
  const db = openDatabase()
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string
    value: string
  }[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return map
}

export function getSettings(): SettingsPayload {
  const map = readMap()
  const values: SettingsValues = {
    max_daily_loss: parseNumber(map[KEYS.maxDailyLoss], DEFAULTS.max_daily_loss),
    daily_profit_target: parseNumber(map[KEYS.dailyProfitTarget], DEFAULTS.daily_profit_target),
    account_size: parseNumber(map[KEYS.accountSize], DEFAULTS.account_size),
    journal_rules: parseJournalRules(map[KEYS.journalRules]),
    mistake_list: parseStringArray(map[KEYS.mistakeList]),
    day_tag_list: parseStringArray(map[KEYS.dayTagList]),
    daily_rule_break_list: parseStringArray(map[KEYS.dailyRuleBreakList]),
    polygon_api_key: (map[KEYS.polygonApiKey] ?? '').trim(),
    fmp_api_key: (map[KEYS.fmpApiKey] ?? '').trim(),
    last_country_backfill: (map[KEYS.lastCountryBackfill] ?? '').trim() || null,
    show_macd_pane: parseBoolean(map[KEYS.showMacdPane], DEFAULTS.show_macd_pane),
    show_ema9: parseBoolean(map[KEYS.showEma9], DEFAULTS.show_ema9),
    show_ema20: parseBoolean(map[KEYS.showEma20], DEFAULTS.show_ema20),
    show_vwap: parseBoolean(map[KEYS.showVwap], DEFAULTS.show_vwap),
    // v0.2.5 §C — activation trio. Key/payload mirror the api-key precedent
    // (trimmed strings, '' = unset); the grace stamp mirrors
    // last_country_backfill (ISO string or null).
    activation_key: (map[KEYS.activationKey] ?? '').trim(),
    activation_payload: (map[KEYS.activationPayload] ?? '').trim(),
    activation_grace_started_at:
      (map[KEYS.activationGraceStartedAt] ?? '').trim() || null,
    // Trader DNA pillars — numbers via parseNumber, the toggle via parseBoolean,
    // each falling back to its RC-profile default.
    dna_price_min: parseNumber(map[KEYS.dnaPriceMin], DEFAULTS.dna_price_min),
    dna_price_max: parseNumber(map[KEYS.dnaPriceMax], DEFAULTS.dna_price_max),
    dna_change_min: parseNumber(map[KEYS.dnaChangeMin], DEFAULTS.dna_change_min),
    dna_rvol_min: parseNumber(map[KEYS.dnaRvolMin], DEFAULTS.dna_rvol_min),
    dna_float_min: parseNumber(map[KEYS.dnaFloatMin], DEFAULTS.dna_float_min),
    dna_float_max: parseNumber(map[KEYS.dnaFloatMax], DEFAULTS.dna_float_max),
    dna_require_catalyst: parseBoolean(
      map[KEYS.dnaRequireCatalyst],
      DEFAULTS.dna_require_catalyst,
    ),
  }
  return {
    values,
    db_path: getDbPath(),
    // L24 (Session 5) — the RAW stored keys. The values above are
    // default-filled, so callers can never distinguish "never configured"
    // from "configured to the default"; row existence can.
    stored_keys: Object.keys(map),
  }
}

export function saveSettings(input: SettingsUpdate): SettingsPayload {
  const db = openDatabase()
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)

  const tx = db.transaction(() => {
    if (input.max_daily_loss != null) {
      const v = Number(input.max_daily_loss)
      if (Number.isFinite(v) && v >= 0) {
        upsert.run(KEYS.maxDailyLoss, String(v))
      }
    }
    if (input.daily_profit_target != null) {
      const v = Number(input.daily_profit_target)
      if (Number.isFinite(v) && v >= 0) {
        upsert.run(KEYS.dailyProfitTarget, String(v))
      }
    }
    if (input.account_size != null) {
      const v = Number(input.account_size)
      if (Number.isFinite(v) && v >= 0) {
        upsert.run(KEYS.accountSize, String(v))
      }
    }
    if (input.journal_rules != null) {
      // Validate (trim names, drop malformed) but KEEP archived rules — dropping
      // an archived rule would re-orphan its history (the original bug).
      upsert.run(
        KEYS.journalRules,
        JSON.stringify(cleanJournalRules(input.journal_rules)),
      )
    }
    if (input.mistake_list != null) {
      const clean = input.mistake_list
        .map((m) => String(m).trim())
        .filter(Boolean)
      upsert.run(KEYS.mistakeList, JSON.stringify(clean))
    }
    if (input.day_tag_list != null) {
      const clean = input.day_tag_list
        .map((t) => String(t).trim())
        .filter(Boolean)
      upsert.run(KEYS.dayTagList, JSON.stringify(clean))
    }
    if (input.daily_rule_break_list != null) {
      const clean = input.daily_rule_break_list
        .map((t) => String(t).trim())
        .filter(Boolean)
      upsert.run(KEYS.dailyRuleBreakList, JSON.stringify(clean))
    }
    if (input.polygon_api_key != null) {
      upsert.run(KEYS.polygonApiKey, String(input.polygon_api_key).trim())
    }
    if (input.fmp_api_key != null) {
      upsert.run(KEYS.fmpApiKey, String(input.fmp_api_key).trim())
    }
    if (input.last_country_backfill !== undefined) {
      upsert.run(KEYS.lastCountryBackfill, input.last_country_backfill ?? '')
    }
    if (input.show_macd_pane != null) {
      upsert.run(KEYS.showMacdPane, input.show_macd_pane ? '1' : '0')
    }
    if (input.show_ema9 != null) {
      upsert.run(KEYS.showEma9, input.show_ema9 ? '1' : '0')
    }
    if (input.show_ema20 != null) {
      upsert.run(KEYS.showEma20, input.show_ema20 ? '1' : '0')
    }
    if (input.show_vwap != null) {
      upsert.run(KEYS.showVwap, input.show_vwap ? '1' : '0')
    }
    if (input.activation_key != null) {
      upsert.run(KEYS.activationKey, String(input.activation_key).trim())
    }
    if (input.activation_payload != null) {
      upsert.run(KEYS.activationPayload, String(input.activation_payload).trim())
    }
    if (input.activation_grace_started_at !== undefined) {
      upsert.run(
        KEYS.activationGraceStartedAt,
        input.activation_grace_started_at ?? '',
      )
    }
    // Trader DNA pillars — the 6 numbers reuse the max_daily_loss guard
    // (finite & ≥ 0), the catalyst toggle the show_macd_pane '1'/'0' encoding.
    const dnaNums: [number | undefined, string][] = [
      [input.dna_price_min, KEYS.dnaPriceMin],
      [input.dna_price_max, KEYS.dnaPriceMax],
      [input.dna_change_min, KEYS.dnaChangeMin],
      [input.dna_rvol_min, KEYS.dnaRvolMin],
      [input.dna_float_min, KEYS.dnaFloatMin],
      [input.dna_float_max, KEYS.dnaFloatMax],
    ]
    for (const [raw, key] of dnaNums) {
      if (raw != null) {
        const v = Number(raw)
        if (Number.isFinite(v) && v >= 0) upsert.run(key, String(v))
      }
    }
    if (input.dna_require_catalyst != null) {
      upsert.run(KEYS.dnaRequireCatalyst, input.dna_require_catalyst ? '1' : '0')
    }
  })
  tx()

  return getSettings()
}
