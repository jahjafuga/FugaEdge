import { openDatabase } from '../db/database'
import { getTrade } from './list'
import { getRegionForCountry, getCountryName } from '@/core/country/regions'
import { isCountryReResolvable, normalizeIso, type CountrySource } from '@/core/country/source'
import type { TradeListRow } from '@shared/trades-types'

export type { CountrySource }

interface SaveCountryArgs {
  trade_id: number
  /** ISO alpha-2 or null to clear. */
  country: string | null
  source: CountrySource
}

export function saveTradeCountry(args: SaveCountryArgs): TradeListRow | null {
  const db = openDatabase()
  const valid = normalizeIso(args.country)
  const country_name = valid ? getCountryName(valid) : 'Unknown'
  const region = valid ? getRegionForCountry(valid) : 'Unknown'
  // Manual nulls explicitly mark a trade as "user said unknown" — store
  // 'manual' so a backfill won't overwrite it. Auto-import sets 'polygon'
  // or 'unknown'; the backfill IPC sets 'polygon' on hits and leaves
  // 'manual' rows alone.
  const finalSource: CountrySource = valid
    ? args.source
    : args.source === 'polygon'
      ? 'unknown'
      : 'manual'
  db.prepare(
    `UPDATE trades
       SET country = ?, country_name = ?, region = ?, country_source = ?
     WHERE id = ?`,
  ).run(valid, country_name, region, finalSource, args.trade_id)
  return getTrade(args.trade_id)
}

export interface CountryBackfillCandidate {
  symbol: string
  trade_ids: number[]
}

/** Trades that need a country fetched. Selection rule lives in the pure
 *  isCountryReResolvable (force=false re-resolves null/unknown/inferred;
 *  force=true anything non-manual; 'manual' always protected). We read the
 *  source per row and filter in JS so that rule has one tested home. */
export function tradesNeedingCountryFetch(force: boolean): CountryBackfillCandidate[] {
  const db = openDatabase()
  const rows = db
    .prepare('SELECT id, symbol, country_source FROM trades ORDER BY symbol ASC, id ASC')
    .all() as { id: number; symbol: string; country_source: string | null }[]
  const out = new Map<string, number[]>()
  for (const r of rows) {
    if (!isCountryReResolvable(r.country_source, force)) continue
    const arr = out.get(r.symbol)
    if (arr) arr.push(r.id)
    else out.set(r.symbol, [r.id])
  }
  return Array.from(out, ([symbol, trade_ids]) => ({ symbol, trade_ids }))
}

/** Apply a resolved country to every trade for a symbol (when source !=
 *  'manual'). Returns the number of rows updated. */
export function applyCountryToSymbol(
  symbol: string,
  args: { country: string | null; country_name: string; region: string; source: CountrySource },
): number {
  const db = openDatabase()
  const info = db
    .prepare(
      `UPDATE trades
         SET country = ?, country_name = ?, region = ?, country_source = ?
       WHERE symbol = ? AND (country_source IS NULL OR country_source != 'manual')`,
    )
    .run(args.country, args.country_name, args.region, args.source, symbol)
  return info.changes
}

/** Manual per-SYMBOL override — sets EVERY trade of the symbol to the chosen
 *  country with source 'manual'. Unlike applyCountryToSymbol (auto-resolve,
 *  which skips manual rows), this is an explicit user action for the whole
 *  ticker and overwrites prior 'inferred' AND 'manual' rows. `country` null
 *  clears to Unknown (still source 'manual' — "user said unknown"). Returns
 *  rows updated. */
export function applySymbolCountryManual(symbol: string, country: string | null): number {
  const db = openDatabase()
  const iso = normalizeIso(country)
  const country_name = iso ? getCountryName(iso) : 'Unknown'
  const region = iso ? getRegionForCountry(iso) : 'Unknown'
  const info = db
    .prepare(
      `UPDATE trades
         SET country = ?, country_name = ?, region = ?, country_source = 'manual'
       WHERE symbol = ?`,
    )
    .run(iso, country_name, region, symbol)
  return info.changes
}

export function countTradesByRegion(): Record<string, number> {
  const db = openDatabase()
  const rows = db
    .prepare(`SELECT COALESCE(region, 'Unknown') AS k, COUNT(*) AS n FROM trades GROUP BY region`)
    .all() as { k: string; n: number }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.k] = r.n
  return out
}

export function countTradesByCountry(): Record<string, number> {
  const db = openDatabase()
  const rows = db
    .prepare(
      `SELECT COALESCE(country, '') AS k, COUNT(*) AS n FROM trades GROUP BY country`,
    )
    .all() as { k: string; n: number }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.k] = r.n
  return out
}
