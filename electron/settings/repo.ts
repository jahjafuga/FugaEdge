import { getDbPath, openDatabase } from '../db/database'
import type {
  SettingsPayload,
  SettingsUpdate,
  SettingsValues,
} from '@shared/settings-types'

const KEYS = {
  maxDailyLoss: 'max_daily_loss',
  accountSize: 'account_size',
  journalRules: 'journal_rules',
  mistakeList: 'mistake_list',
  dayTagList: 'day_tag_list',
  polygonApiKey: 'polygon_api_key',
} as const

const DEFAULTS: SettingsValues = {
  max_daily_loss: 500,
  account_size: 25000,
  journal_rules: [],
  mistake_list: [],
  day_tag_list: [],
  polygon_api_key: '',
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
    account_size: parseNumber(map[KEYS.accountSize], DEFAULTS.account_size),
    journal_rules: parseStringArray(map[KEYS.journalRules]),
    mistake_list: parseStringArray(map[KEYS.mistakeList]),
    day_tag_list: parseStringArray(map[KEYS.dayTagList]),
    polygon_api_key: (map[KEYS.polygonApiKey] ?? '').trim(),
  }
  return {
    values,
    db_path: getDbPath(),
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
    if (input.account_size != null) {
      const v = Number(input.account_size)
      if (Number.isFinite(v) && v >= 0) {
        upsert.run(KEYS.accountSize, String(v))
      }
    }
    if (input.journal_rules != null) {
      const clean = input.journal_rules
        .map((r) => String(r).trim())
        .filter(Boolean)
      upsert.run(KEYS.journalRules, JSON.stringify(clean))
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
    if (input.polygon_api_key != null) {
      upsert.run(KEYS.polygonApiKey, String(input.polygon_api_key).trim())
    }
  })
  tx()

  return getSettings()
}
