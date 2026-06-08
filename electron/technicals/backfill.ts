// Session 3 — electron-side trade_technicals bulk backfill wrapper.
//
// Thin glue (ARCHITECTURE rule 1): wires the pure runBackfillCore to the
// electron repos and the dataVersion cache. All orchestration (chunking,
// yielding, compute-vs-placeholder, counting) lives in the pure core; this file
// only supplies the side-effecting dependencies and gates the dataVersion bump.

import { runBackfillCore } from '@/core/technicals/runBackfillCore'
import type { HydratedTrade } from '@/core/technicals/runBackfillCore'
import { TECHNICALS_SCHEMA_VERSION } from '@/core/technicals/computeTradeTechnicals'
import { getStaleTradeIds, upsertTradeTechnicals } from './repo'
import { getTradesByIdsForTechnicals } from '../trades/list'
import { getIntradayRow } from '../market/repo'
import { bumpDataVersion } from '../lib/cache'

/**
 * 4th copy of the executions_json parser (alongside lazy-guard.ts:60's
 * parseExecutions, trades/list.ts:80's parseExecutions, and
 * analytics/get.ts:59's parseExecs — same body, different name). Dedup
 * parked to v0.3.0 per the v0.3.0 ideas doc; matches the existing pattern
 * of one inline copy per consuming module.
 */
function parseExecutions(raw: string | null | undefined) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as { side: 'B' | 'S'; qty: number; price: number; time: string }[]
  } catch {
    return []
  }
}

export interface TechnicalsBackfillProgress {
  chunkNumber: number
  totalChunks: number
}

export interface TechnicalsBackfillResult {
  computed: number
  placeholders: number
  errors: number
  totalAttempted: number
  durationMs: number
}

export async function runTradeTechnicalsBackfill(
  opts: {
    onProgress?: (p: TechnicalsBackfillProgress) => void
  } = {},
): Promise<TechnicalsBackfillResult> {
  const result = await runBackfillCore({
    getStaleIds: () => getStaleTradeIds(TECHNICALS_SCHEMA_VERSION),
    hydrateTradeChunk: (ids): HydratedTrade[] => {
      const rows = getTradesByIdsForTechnicals(ids)
      return rows.map((r) => ({
        id: r.id,
        symbol: r.symbol,
        date: r.date,
        trade: {
          side: r.side,
          executions: parseExecutions(r.executions_json),
        },
      }))
    },
    loadBarsForKey: (symbol, date) => {
      const row = getIntradayRow(symbol, date)
      if (!row) return null
      return { bars: row.bars, warmupBars: row.warmup_bars }
    },
    persistTechnicals: (id, technicals) => upsertTradeTechnicals(id, technicals),
    onChunkComplete: opts.onProgress
      ? (chunkNumber, totalChunks) => opts.onProgress!({ chunkNumber, totalChunks })
      : undefined,
    yieldBetweenChunks: () => new Promise((resolve) => setImmediate(resolve)),
  })

  if (result.computed + result.placeholders > 0) {
    bumpDataVersion()
  }
  return result
}
