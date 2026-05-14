import type { WebContents } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { getSettings } from '../settings/repo'
import { fetchTickerReference, MassiveError } from '../market/massive'
import { resolveCountryFromPolygon, type ResolvedCountry } from '@/core/country/resolve'
import {
  tradesNeedingCountryFetch,
  applyCountryToSymbol,
  saveTradeCountry,
  type CountrySource,
} from '../trades/country'

const REQUEST_SPACING_MS = 350
const RETRY_BACKOFF_MS = 12_000
const PROGRESS_EVERY = 1

export interface CountryBackfillResult {
  updated: number
  skipped: number
  failed: number
  apiKeyMissing: boolean
  errors: { symbol: string; message: string }[]
  durationMs: number
}

let inFlight: Promise<CountryBackfillResult> | null = null

/** One-shot resolve for a single ticker. Used by the on-demand IPC and
 *  not subject to the singleton in-flight lock. Returns null when the
 *  Polygon API key isn't configured. */
export async function resolveForTicker(symbol: string): Promise<ResolvedCountry | null> {
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) return null
  const ref = await fetchTickerReference(polygon_api_key, symbol)
  return resolveCountryFromPolygon(ref)
}

export function backfillAllCountries(
  opts: { force?: boolean; emitProgress?: (p: { current: number; total: number; symbol: string }) => void } = {},
): Promise<CountryBackfillResult> {
  if (inFlight) return inFlight
  inFlight = run(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(opts: {
  force?: boolean
  emitProgress?: (p: { current: number; total: number; symbol: string }) => void
}): Promise<CountryBackfillResult> {
  const startedAt = Date.now()
  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) {
    return {
      updated: 0, skipped: 0, failed: 0,
      apiKeyMissing: true, errors: [], durationMs: Date.now() - startedAt,
    }
  }

  const groups = tradesNeedingCountryFetch(!!opts.force)
  if (groups.length === 0) {
    return {
      updated: 0, skipped: 0, failed: 0,
      apiKeyMissing: false, errors: [], durationMs: Date.now() - startedAt,
    }
  }

  let lastRequestAt = 0
  const respectSpacing = async () => {
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
    }
    lastRequestAt = Date.now()
  }

  let updated = 0
  let skipped = 0
  let failed = 0
  const errors: { symbol: string; message: string }[] = []

  for (let i = 0; i < groups.length; i++) {
    const { symbol, trade_ids } = groups[i]
    if (opts.emitProgress && (i % PROGRESS_EVERY === 0 || i === groups.length - 1)) {
      opts.emitProgress({ current: i + 1, total: groups.length, symbol })
    }
    try {
      await respectSpacing()
      let ref
      try {
        ref = await fetchTickerReference(polygon_api_key, symbol)
      } catch (e) {
        if (e instanceof MassiveError && e.status === 429) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS))
          ref = await fetchTickerReference(polygon_api_key, symbol)
        } else {
          throw e
        }
      }
      const resolved = resolveCountryFromPolygon(ref)
      const source: CountrySource = resolved.source === 'polygon' ? 'polygon' : 'unknown'
      const changed = applyCountryToSymbol(symbol, {
        country: resolved.country,
        country_name: resolved.country_name,
        region: resolved.region,
        source,
      })
      if (changed > 0) updated += changed
      else skipped += trade_ids.length
    } catch (e) {
      failed += trade_ids.length
      const msg = e instanceof MassiveError
        ? `${e.status === 0 ? 'network' : e.status}: ${e.message}`
        : e instanceof Error ? e.message : String(e)
      errors.push({ symbol, message: msg })
      console.info(`[FE country] ${symbol} failed: ${msg}`)
    }
  }

  return {
    updated, skipped, failed,
    apiKeyMissing: false,
    errors,
    durationMs: Date.now() - startedAt,
  }
}

/** Convenience wrapper used by the import flow — emits no progress and
 *  re-uses the singleton lock so a concurrent manual backfill shares the
 *  same run. */
export async function autoBackfillAfterImport(webContents: WebContents | null = null): Promise<CountryBackfillResult> {
  return backfillAllCountries({
    force: false,
    emitProgress: webContents
      ? (p) => webContents.send(IPC.COUNTRY_BACKFILL_PROGRESS, p)
      : undefined,
  })
}

export { saveTradeCountry }
