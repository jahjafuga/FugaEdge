// v0.2.5 EdgeIQ Trader DNA — standalone daily % change backfill over EXISTING
// trades (imported before this feature, so daily_change_pct is NULL).
//
// Mirrors backfill-float.ts: singleton-locked, key-gated, a NULL-only work-list
// (symbolsNeedingDailyChange), per-symbol rate-limited fetch, cancelable. The
// per-trade math is the tested pure helper (dailyChangeForTrade) — no
// re-implemented logic here. The Massive key stays in main (ARCHITECTURE #4/5).
//
// Cost: ONE daily-bar fetch per distinct NULL symbol (the endpoint returns the
// whole range; the fetch starts 30 days early so prevClose is in-range). NULL-
// only → idempotent: a re-run (manual retry) fills only what's still missing.
//
// Two entry points:
//   - backfillAllDailyChange — the manual Settings button + the auto-arm body.
//   - runPendingDailyChangeBackfill — fire-once: consumes the schema-31
//     pending flag at ready-to-show, runs gently in the background, clears it.

import type {
  DailyChangeBackfillProgress,
  DailyChangeBackfillResult,
} from '@shared/market-types'
import { openDatabase } from '../db/database'
import { getSettings } from '../settings/repo'
import { fetchDailyAggregates } from './massive'
import { withRateLimitRetry } from './rate-limit'
import {
  getMarketRow,
  setTradeDailyChange,
  symbolsNeedingDailyChange,
  tradeDateRangePerSymbol,
  tradesNeedingDailyChangeForSymbol,
  upsertMarketRow,
} from './repo'
import { backfillAllRvol } from './rvol-backfill'
import { dailyChangeForTrade } from '@/core/market/dailyChange'

// Literal must match the migration's arm in electron/db/database.ts.
const PENDING_KEY = 'daily_change_backfill_pending'
const REQUEST_SPACING_MS = 350 // ~3/s floor, matches the import aggregates path

let inFlight: Promise<DailyChangeBackfillResult> | null = null
let cancelRequested = false

/** Ask the in-flight backfill to stop after the current symbol. Resolves cleanly
 *  (cancelled: true) with partial counts. No-op when nothing is running. */
export function cancelDailyChangeBackfill(): void {
  if (inFlight) cancelRequested = true
}

/** Backfill daily_change_pct onto every existing trade whose value is NULL.
 *  Singleton-locked (mirrors backfillAllFloat) so a double-click or the auto-arm
 *  racing the button can't run two sweeps at once. */
export function backfillAllDailyChange(
  opts: { emitProgress?: (p: DailyChangeBackfillProgress) => void } = {},
): Promise<DailyChangeBackfillResult> {
  if (inFlight) return inFlight
  inFlight = run(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(opts: {
  emitProgress?: (p: DailyChangeBackfillProgress) => void
}): Promise<DailyChangeBackfillResult> {
  const startedAt = Date.now()
  cancelRequested = false

  const empty = (over: Partial<DailyChangeBackfillResult>): DailyChangeBackfillResult => ({
    symbolsAttempted: 0,
    tradesFilled: 0,
    tradesUncomputable: 0,
    failedSymbols: [],
    apiKeyMissing: false,
    cancelled: false,
    durationMs: Date.now() - startedAt,
    ...over,
  })

  const { polygon_api_key } = getSettings().values
  if (!polygon_api_key) return empty({ apiKeyMissing: true })

  const symbols = symbolsNeedingDailyChange()
  if (symbols.length === 0) return empty({})

  const ranges = tradeDateRangePerSymbol()
  let tradesFilled = 0
  let tradesUncomputable = 0
  const failedSymbols: string[] = []
  let lastRequestAt = 0

  for (let i = 0; i < symbols.length; i++) {
    if (cancelRequested) break
    const symbol = symbols[i]

    // Gentle spacing so a free-tier key isn't stampeded; yields to the event
    // loop so foreground API needs aren't starved.
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
    }
    lastRequestAt = Date.now()

    const range = ranges.get(symbol)
    const to = range?.to ?? todayISO()
    const from = range ? addDays(range.from, -30) : addDays(to, -90)

    try {
      const aggs = await withRateLimitRetry(() =>
        fetchDailyAggregates(polygon_api_key, symbol, from, to),
      )
      const bars = aggs
        .filter((a): a is typeof a & { close: number } => a.close !== null)
        .map((a) => ({ date: a.date, close: a.close }))
      for (const t of tradesNeedingDailyChangeForSymbol(symbol)) {
        const pct = dailyChangeForTrade(t, bars)
        setTradeDailyChange(t.id, pct)
        if (pct === null) tradesUncomputable++
        else tradesFilled++
      }

      // Synergy (zero extra API): the SAME aggs carry per-date volume — capture
      // it into market_data so RVOL can re-derive (it came out thin because the
      // cache lacked volume). MERGE-safe: read the existing row and preserve
      // float/shares/cap (those OVERWRITE on upsert — a naive null would clobber
      // them), set ONLY the volume fields. The enrich-aggregates persistAggregates
      // shape, verbatim.
      const daily_volumes: Record<string, number> = {}
      for (const a of aggs) daily_volumes[a.date] = a.volume
      const avg_volume =
        aggs.length > 0 ? aggs.reduce((s, a) => s + a.volume, 0) / aggs.length : null
      const existing = getMarketRow(symbol)
      upsertMarketRow({
        symbol,
        float: existing?.float ?? null,
        shares_outstanding: existing?.shares_outstanding ?? null,
        market_cap: existing?.market_cap ?? null,
        sector: existing?.sector ?? null,
        industry: existing?.industry ?? null,
        avg_volume,
        daily_volumes,
        country: existing?.country ?? null,
        country_name: existing?.country_name ?? null,
        region: existing?.region ?? null,
        fetched_at: new Date().toISOString(),
        error: null,
      })
    } catch {
      // Per-symbol failure (429 after retries, network) — leave its trades NULL
      // so the manual retry re-attempts them. The sweep keeps going.
      failedSymbols.push(symbol)
    }
    opts.emitProgress?.({ current: i + 1, total: symbols.length, symbol })
  }

  // Synergy: market_data now carries fresh volume for every fetched symbol, so
  // re-derive RVOL from the cache in this same pass (data-producer → consumer,
  // the warmup→technicals ordering). Best-effort: a re-derive hiccup must not
  // fail the daily-% pass (the post-refresh chain's try/catch posture).
  try {
    backfillAllRvol()
  } catch (e) {
    console.error(`[FE daily-change] RVOL re-derive after fill failed (non-fatal): ${e}`)
  }

  return empty({
    symbolsAttempted: symbols.length,
    tradesFilled,
    tradesUncomputable,
    failedSymbols,
    cancelled: cancelRequested,
  })
}

/** Fire-once consumer of the schema-31 arm flag (the runPendingMaeMfeBackfill
 *  precedent). Runs the gentle background sweep, then clears the flag — even on
 *  a partial / key-missing run (the manual button is the retry path). Only an
 *  unexpected throw leaves the flag set so the next launch retries. */
export async function runPendingDailyChangeBackfill(): Promise<void> {
  const conn = openDatabase()
  const pending = conn
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get(PENDING_KEY) as { value: string } | undefined
  if (pending?.value !== 'true') return

  try {
    const r = await backfillAllDailyChange() // background — no UI progress
    conn
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, 'false')
         ON CONFLICT(key) DO UPDATE SET value = 'false'`,
      )
      .run(PENDING_KEY)
    console.info(
      `[FE daily-change] auto-backfill: symbols=${r.symbolsAttempted} filled=${r.tradesFilled} ` +
        `uncomputable=${r.tradesUncomputable} failed=${r.failedSymbols.length} ` +
        `${r.apiKeyMissing ? '(no key) ' : ''}in ${r.durationMs}ms`,
    )
  } catch (e) {
    console.error(`[FE daily-change] auto-backfill threw, flag left set for retry: ${e}`)
  }
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
function todayISO(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}
function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}
