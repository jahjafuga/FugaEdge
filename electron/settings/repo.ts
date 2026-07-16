import { getDbPath, openDatabase } from '../db/database'
import { parseJournalRules } from '@/core/journal/rules'
import { KEYS, saveSettingsOn } from './save'
import type {
  SettingsPayload,
  SettingsUpdate,
  SettingsValues,
} from '@shared/settings-types'

const DEFAULTS: SettingsValues = {
  max_daily_loss: 500,
  daily_profit_target: 0,
  account_size: 25000,
  journal_rules: [],
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
  account_scope: 'all',
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
    // 'all' | account ULID; a stale/deleted id is resolved renderer-side
    // (fallback to 'all') so the stored value stays an honest history.
    account_scope: (map[KEYS.accountScope] ?? '').trim() || DEFAULTS.account_scope,
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
  // The per-key transaction body lives in ./save (saveSettingsOn) so the
  // in-memory harness can drive the real branches — including the Dave #9
  // append-on-change goal-history hook — without this module's openDatabase
  // import chain. Behavior-preserving extraction; the surface here is unchanged.
  saveSettingsOn(openDatabase(), input)
  return getSettings()
}
