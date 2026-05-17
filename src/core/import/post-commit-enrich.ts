// Pure post-commit enrichment composer.
//
// Sequences the three import-time orchestrators that run AFTER trips have
// been committed to the trades table:
//   1. country resolution   — writes the market_data row (sets country +
//                              fetched_at), updates the trades' country cols
//   2. float enrichment     — updates the SAME market_data row with float +
//                              market_cap + sector; SQL backfill copies
//                              float onto trades
//   3. aggregates           — updates the SAME row with daily_volumes +
//                              avg_volume (RVOL inputs)
//
// Order matters: each phase upserts the same market_data row, so running
// them in parallel would race the writer. The orchestrators rely on
// COALESCE + read-existing-then-write to avoid clobbering each other's
// fields; that contract only holds if phases run strictly sequentially.
//
// Failure isolation: each phase is wrapped in try/catch so one phase's
// outage cannot block later phases (or earlier ones' results). Per-symbol
// errors are already collected by each orchestrator and surfaced in the
// result; only an unexpected throw from the runner itself lands in the
// catch.
//
// Web-portable: takes pre-bound runner callbacks. The Electron wire-up
// (electron/import/ipc.ts) builds the runners with platform-specific
// Polygon + DB callbacks; a future web importer would build different
// runners and call this composer unchanged. No electron/fs/sqlite/http
// imports here.
//
// Return shape preserves the country counters the renderer's import-
// complete toast reads from CommitResult, plus the float/aggregates
// counters for logging.

import type { ImportResolveResult } from '@/core/country/import-orchestrator'
import type { EnrichFloatResult } from '@/core/float/orchestrator'
import type { EnrichAggregatesResult } from '@/core/aggregates/orchestrator'

export type ImportEnrichProgress =
  | { phase: 'country'; current: number; total: number; symbol: string }
  | { phase: 'float'; current: number; total: number; symbol: string }
  | { phase: 'aggregates'; current: number; total: number; symbol: string }

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

export interface AggregatesRunner {
  (
    symbols: string[],
    onProgress?: (p: { current: number; total: number; symbol: string }) => void,
  ): Promise<EnrichAggregatesResult>
}

export interface EnrichAfterCommitDeps {
  newSymbols: string[]
  country: CountryRunner
  float: FloatRunner
  aggregates: AggregatesRunner
  emitProgress?: (e: ImportEnrichProgress) => void
}

export interface PostCommitEnrichResult {
  country: ImportResolveResult
  float: EnrichFloatResult
  aggregates: EnrichAggregatesResult
}

const EMPTY_COUNTRY: ImportResolveResult = { resolved: 0, unknown: 0, errors: [] }
const EMPTY_FLOAT: EnrichFloatResult = { fetched: 0, missing: 0, errored: 0, errors: [] }
const EMPTY_AGGREGATES: EnrichAggregatesResult = { fetched: 0, empty: 0, errored: 0, errors: [] }

export async function enrichAfterCommit(
  deps: EnrichAfterCommitDeps,
): Promise<PostCommitEnrichResult> {
  if (deps.newSymbols.length === 0) {
    return {
      country: { ...EMPTY_COUNTRY },
      float: { ...EMPTY_FLOAT },
      aggregates: { ...EMPTY_AGGREGATES },
    }
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
      errored: deps.newSymbols.length,
      errors: [{ symbol: '*', message }],
    }
  }

  let aggregates: EnrichAggregatesResult = { ...EMPTY_AGGREGATES }
  try {
    aggregates = await deps.aggregates(deps.newSymbols, (p) =>
      deps.emitProgress?.({ phase: 'aggregates', ...p }),
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    aggregates = {
      fetched: 0,
      empty: 0,
      errored: deps.newSymbols.length,
      errors: [{ symbol: '*', message }],
    }
  }

  return { country, float, aggregates }
}
