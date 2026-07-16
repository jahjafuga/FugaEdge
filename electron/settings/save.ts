// The settings write path, extracted from repo.ts (behavior-preserving) so the
// in-memory harness can drive the REAL per-key branches against better-sqlite3
// — repo.ts value-imports openDatabase (electron app paths), which no harness
// can load. repo.saveSettings delegates here; the public surface is unchanged.
//
// Dave #9 (schema 48): the daily_profit_target / max_daily_loss branches gained
// the append-on-change history hook. The savebar is a blind bulk overwrite
// renderer-side, so the diff happens HERE, per key, inside the same transaction
// — KV upsert + history append commit atomically. A row is appended ONLY on
// actual value change, measured against the baseline the history knows:
//   profit target — absent row means 0 (the epoch seed's own rule), so a
//     first save of 0 appends nothing and a first save of 500 appends;
//   max loss — absent row means honestly-unset (no seeded baseline), so the
//     first-ever set IS a change and appends.
// No new cache invalidation: SETTINGS_SAVE already bumps the analytics data
// version on every save (ipc.ts — Dave ticket #6's fix).

import type Database from 'better-sqlite3'
import { cleanJournalRules } from '@/core/journal/rules'
import type { SettingsUpdate } from '@shared/settings-types'

export const KEYS = {
  maxDailyLoss: 'max_daily_loss',
  dailyProfitTarget: 'daily_profit_target',
  accountSize: 'account_size',
  journalRules: 'journal_rules',
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
  // Multi-account Beat 4 — the switcher's persisted scope ('all' | ULID).
  accountScope: 'account_scope',
} as const

/** Append a history row iff the new value actually differs from the stored
 *  baseline. `absentBaseline` is what a MISSING settings row means for the key:
 *  0 for the profit target (no goal — mirrors the epoch seed), null for max
 *  loss (honestly-unset → any first set is a change). An unparseable stored
 *  value reads as the absent baseline too. */
function appendHistoryOnChange(
  db: Database.Database,
  table: 'profit_target_history' | 'max_loss_history',
  oldRaw: string | undefined,
  newValue: number,
  nowIso: string,
  absentBaseline: number | null,
): void {
  const parsed = oldRaw == null ? NaN : Number.parseFloat(oldRaw)
  const baseline = Number.isFinite(parsed) ? parsed : absentBaseline
  if (baseline !== null && baseline === newValue) return
  db.prepare(`INSERT INTO ${table} (effective_from, value) VALUES (?, ?)`).run(nowIso, newValue)
}

export function saveSettingsOn(
  db: Database.Database,
  input: SettingsUpdate,
  nowIso: string = new Date().toISOString(),
): void {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `)
  const readOld = db.prepare('SELECT value FROM settings WHERE key = ?')

  const tx = db.transaction(() => {
    if (input.max_daily_loss != null) {
      const v = Number(input.max_daily_loss)
      if (Number.isFinite(v) && v >= 0) {
        const old = readOld.get(KEYS.maxDailyLoss) as { value: string } | undefined
        upsert.run(KEYS.maxDailyLoss, String(v))
        appendHistoryOnChange(db, 'max_loss_history', old?.value, v, nowIso, null)
      }
    }
    if (input.daily_profit_target != null) {
      const v = Number(input.daily_profit_target)
      if (Number.isFinite(v) && v >= 0) {
        const old = readOld.get(KEYS.dailyProfitTarget) as { value: string } | undefined
        upsert.run(KEYS.dailyProfitTarget, String(v))
        appendHistoryOnChange(db, 'profit_target_history', old?.value, v, nowIso, 0)
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
    if (input.account_scope != null) {
      // 'all' or an account ULID — trimmed non-empty guard (the api-key
      // string style); blank writes are dropped rather than stored.
      const v = String(input.account_scope).trim()
      if (v) upsert.run(KEYS.accountScope, v)
    }
  })
  tx()
}
