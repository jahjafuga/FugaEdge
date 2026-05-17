// Pure post-commit enrichment composer.
//
// Sequences the two import-time orchestrators that run AFTER trips have been
// committed to the trades table:
//   1. country resolution   — writes the market_data row (sets country +
//                              fetched_at), updates the trades' country cols
//   2. float enrichment     — updates the SAME market_data row with float,
//                              then a SQL backfill copies float onto trades
//
// Order matters: country writes the row first, float updates it second.
// Running them in parallel would race the upsert and is forbidden here.
//
// Failure isolation: each phase is wrapped in try/catch so a country
// outage cannot block float enrichment (or vice versa). Per-symbol errors
// are already collected by each orchestrator and surfaced in the result;
// only an unexpected throw from the runner itself lands in the catch.
//
// Web-portable: takes pre-bound runner callbacks. The Electron wire-up
// (electron/import/ipc.ts) builds the runners with platform-specific
// Polygon + DB callbacks; a future web importer would build different
// runners and call this composer unchanged. No electron/fs/sqlite/http
// imports here.
//
// Return shape preserves the country counters the renderer's import-
// complete toast still reads from CommitResult.

import type { ImportResolveResult } from '@/core/country/import-orchestrator'
import type { EnrichFloatResult } from '@/core/float/orchestrator'

export type ImportEnrichProgress =
  | { phase: 'country'; current: number; total: number; symbol: string }
  | { phase: 'float'; current: number; total: number; symbol: string }

export interface CountryRunner {
  (
    symbols: string[],
    onProgress?: (p: { current: number; total: number; symbol: string }) => void,
  ): Promise<ImportResolveResult>
}

export interface FloatRunner {
  (
    symbols: string[],
    onProgress?: (p: { current: number; total: number; symbol: string }) => void,
  ): Promise<EnrichFloatResult>
}

export interface EnrichAfterCommitDeps {
  newSymbols: string[]
  country: CountryRunner
  float: FloatRunner
  emitProgress?: (e: ImportEnrichProgress) => void
}

export interface PostCommitEnrichResult {
  country: ImportResolveResult
  float: EnrichFloatResult
}

const EMPTY_COUNTRY: ImportResolveResult = { resolved: 0, unknown: 0, errors: [] }
const EMPTY_FLOAT: EnrichFloatResult = { fetched: 0, missing: 0, errors: [] }

export async function enrichAfterCommit(
  deps: EnrichAfterCommitDeps,
): Promise<PostCommitEnrichResult> {
  if (deps.newSymbols.length === 0) {
    return { country: { ...EMPTY_COUNTRY }, float: { ...EMPTY_FLOAT } }
  }

  let country: ImportResolveResult = { ...EMPTY_COUNTRY }
  try {
    country = await deps.country(deps.newSymbols, (p) =>
      deps.emitProgress?.({ phase: 'country', ...p }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    country = {
      resolved: 0,
      unknown: deps.newSymbols.length,
      errors: [{ symbol: '*', message }],
    }
  }

  let float: EnrichFloatResult = { ...EMPTY_FLOAT }
  try {
    float = await deps.float(deps.newSymbols, (p) =>
      deps.emitProgress?.({ phase: 'float', ...p }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    float = {
      fetched: 0,
      missing: 0,
      errors: [{ symbol: '*', message }],
    }
  }

  return { country, float }
}
