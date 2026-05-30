import { openDatabase } from '../db/database'
import { getSettings } from '../settings/repo'
import { ema } from '../lib/ema'
import {
  fetchIntradayMinutes,
  MassiveError,
  type IntradayBar,
} from './massive'
import { withRateLimitRetry } from './rate-limit'
import type { MarketRefreshProgress } from '@shared/market-types'
import {
  getIntradayRow,
  intradayPairsNeedingFetch,
  setTradeEma9Distance,
  setTradeMaeMfe,
  upsertIntradayRow,
} from './repo'

const REQUEST_SPACING_MS = 350
const MAX_CONCURRENT = 2

export interface IntradayRefreshResult {
  attempted: number
  fetched: number
  failed: number
  apiKeyMissing: boolean
  errors: { symbol: string; date: string; message: string }[]
  emaBackfilled: number
  maeMfeBackfilled: number
  durationMs: number
  cancelled: boolean
}

interface RefreshOptions {
  force?: boolean
  /** Pushed once per (symbol, date) pair as it completes, so the renderer can
   *  show a live loading bar. Plain callback — the electron `wc.send` wrapping
   *  lives in the IPC handler, keeping this module web-portable. */
  emitProgress?: (p: MarketRefreshProgress) => void
}

let inFlight: Promise<IntradayRefreshResult> | null = null

// Coarse cancel signal: a module-level flag flipped by cancelIntradayRefresh().
// The worker loop checks it between pairs, so already-in-flight pairs finish
// naturally (≤15s per fetch, ≤42s under sustained 429) and the refresh promise
// still RESOLVES cleanly with cancelled:true. The settle chain (main finally →
// store finally → spinner clears) is preserved by construction.
let cancelRequested = false

export function refreshIntraday(opts: RefreshOptions = {}): Promise<IntradayRefreshResult> {
  if (inFlight) return inFlight
  inFlight = runRefresh(opts).finally(() => {
    inFlight = null
  })
  return inFlight
}

/** Signal the in-flight intraday refresh to stop starting new pairs. The
 *  refresh promise still resolves (with cancelled:true) once the ≤2 in-flight
 *  pairs finish. No-op when nothing is running. */
export function cancelIntradayRefresh(): void {
  if (inFlight) cancelRequested = true
}

async function runRefresh(opts: RefreshOptions): Promise<IntradayRefreshResult> {
  const startedAt = Date.now()
  // Reset the cancel flag for this run — a stale flag from a previous run must
  // not pre-cancel a fresh one.
  cancelRequested = false
  const { polygon_api_key } = getSettings().values

  if (!polygon_api_key) {
    return {
      attempted: 0,
      fetched: 0,
      failed: 0,
      apiKeyMissing: true,
      errors: [],
      emaBackfilled: 0,
      maeMfeBackfilled: 0,
      durationMs: Date.now() - startedAt,
      cancelled: false,
    }
  }

  const pairs = intradayPairsNeedingFetch(!!opts.force)
  const attempted = pairs.length

  if (attempted === 0) {
    // Nothing new to fetch — but still backfill EMA9 distance + MAE/MFE for
    // any trades missing them (in case bars are already cached from a
    // previous run).
    const backfilled = backfillAllEma9Distances()
    const maeMfeBackfilled = backfillAllMaeMfe()
    return {
      attempted: 0,
      fetched: 0,
      failed: 0,
      apiKeyMissing: false,
      errors: [],
      emaBackfilled: backfilled,
      maeMfeBackfilled,
      durationMs: Date.now() - startedAt,
      cancelled: false,
    }
  }

  console.info(
    `[FE intraday] refresh start: ${attempted} (symbol, date) pair${attempted === 1 ? '' : 's'}` +
      `${opts.force ? ' (force)' : ''}`,
  )

  let fetched = 0
  let failed = 0
  const errors: IntradayRefreshResult['errors'] = []

  let lastRequestAt = 0
  const respectSpacing = async () => {
    const since = Date.now() - lastRequestAt
    if (since < REQUEST_SPACING_MS) {
      await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS - since))
    }
    lastRequestAt = Date.now()
  }

  const fetchOne = async (symbol: string, date: string): Promise<void> => {
    try {
      await respectSpacing()
      const bars = await withRateLimitRetry(() =>
        fetchIntradayMinutes(polygon_api_key, symbol, date),
      )
      upsertIntradayRow({
        symbol,
        date,
        bars,
        fetched_at: new Date().toISOString(),
        error: null,
      })
      fetched++
    } catch (e) {
      const message =
        e instanceof MassiveError
          ? `${e.status === 0 ? 'network' : e.status}: ${e.message}`
          : e instanceof Error
            ? e.message
            : String(e)
      errors.push({ symbol, date, message })
      failed++
      upsertIntradayRow({
        symbol,
        date,
        bars: [],
        fetched_at: new Date().toISOString(),
        error: message,
      })
      console.info(`[FE intraday]   ${symbol} ${date} failed: ${message}`)
    }
  }

  const queue = [...pairs]
  let completed = 0
  const workers: Promise<void>[] = []
  for (let i = 0; i < Math.min(MAX_CONCURRENT, queue.length); i++) {
    workers.push(
      (async () => {
        while (queue.length) {
          // Coarse cancel check: stop starting NEW pairs. The current in-flight
          // pair (if any in another worker) finishes naturally on the next
          // iteration's check.
          if (cancelRequested) return
          const p = queue.shift()
          if (!p) return
          await fetchOne(p.symbol, p.date)
          completed += 1
          opts.emitProgress?.({ current: completed, total: attempted, symbol: p.symbol, date: p.date })
        }
      })(),
    )
  }
  await Promise.all(workers)

  const cancelled = cancelRequested
  // Skip the post-loop backfills when cancelled so the run returns fast — the
  // user explicitly asked for it to stop. Backfills are idempotent and will
  // run on the next normal refresh.
  const emaBackfilled = cancelled ? 0 : backfillAllEma9Distances()
  const maeMfeBackfilled = cancelled ? 0 : backfillAllMaeMfe()

  const durationMs = Date.now() - startedAt
  console.info(
    `[FE intraday] refresh ${cancelled ? 'cancelled' : 'done'}: fetched=${fetched} failed=${failed} ema_backfilled=${emaBackfilled} mae_mfe_backfilled=${maeMfeBackfilled} in ${durationMs}ms`,
  )

  return {
    attempted,
    fetched,
    failed,
    apiKeyMissing: false,
    errors,
    emaBackfilled,
    maeMfeBackfilled,
    durationMs,
    cancelled,
  }
}

// Recompute EMA9 distance for every trade where bars are available. Cheap:
// a few k trades × ~390 bars/day. Runs synchronously after a refresh.
export function backfillAllEma9Distances(): number {
  const db = openDatabase()
  // Pull trades that need recomputing — anyone without a value OR all of them
  // (we always overwrite since the formula is deterministic). We avoid
  // redundant writes by checking equality below.
  const trades = db
    .prepare(`
      SELECT id, symbol, date, side, avg_buy_price, avg_sell_price, open_time, entry_ema9_distance_pct
      FROM trades
    `)
    .all() as {
      id: number
      symbol: string
      date: string
      side: 'long' | 'short'
      avg_buy_price: number
      avg_sell_price: number
      open_time: string
      entry_ema9_distance_pct: number | null
    }[]

  let written = 0
  // Cache parsed bar arrays so we only deserialize each row once per refresh.
  const barsCache = new Map<string, IntradayBar[] | null>()

  for (const t of trades) {
    const key = `${t.symbol}|${t.date}`
    let bars = barsCache.get(key)
    if (bars === undefined) {
      const row = getIntradayRow(t.symbol, t.date)
      bars = row?.bars ?? null
      barsCache.set(key, bars)
    }
    const pct = computeEma9Distance(t, bars)
    // Only write when the value actually changes — keeps the WAL slim.
    if (pct !== t.entry_ema9_distance_pct) {
      setTradeEma9Distance(t.id, pct)
      written++
    }
  }
  return written
}

interface TradeForEma {
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  open_time: string
}

function entryPriceOf(t: TradeForEma): number {
  return t.side === 'short'
    ? t.avg_sell_price || t.avg_buy_price
    : t.avg_buy_price || t.avg_sell_price
}

// ── MAE / MFE ────────────────────────────────────────────────────────────
//
// Maximum Adverse Excursion (MAE) and Maximum Favorable Excursion (MFE) are
// $/share figures: how far the trade went against, and in favor of, the
// trader's direction between entry and exit. Both >= 0.
//
//   long:  MAE = entry - min(low_in_window);  MFE = max(high_in_window) - entry
//   short: MAE = max(high_in_window) - entry; MFE = entry - min(low_in_window)
//
// The window is [entry bar … exit bar], inclusive. If close_time is missing
// (still-open trade), we walk to the end of the bars array.

interface TradeForMaeMfe {
  side: 'long' | 'short'
  avg_buy_price: number
  avg_sell_price: number
  open_time: string
  close_time: string | null
}

export interface MaeMfeResult {
  mae: number | null
  mfe: number | null
}

export function computeMaeMfe(
  trade: TradeForMaeMfe,
  bars: IntradayBar[] | null,
): MaeMfeResult {
  if (!bars || bars.length === 0) return { mae: null, mfe: null }

  // open_time / close_time are true UTC (Day 8.5 Commit B) — Date.parse reads
  // the Z suffix as UTC, matching the UTC-epoch bar timestamps from Massive.
  const entryMs = Date.parse(trade.open_time)
  if (!Number.isFinite(entryMs)) return { mae: null, mfe: null }

  const exitMs = trade.close_time
    ? Date.parse(trade.close_time)
    : Number.POSITIVE_INFINITY

  const entry = entryPriceOf(trade)
  if (!Number.isFinite(entry) || entry <= 0) return { mae: null, mfe: null }

  let lowMin = Number.POSITIVE_INFINITY
  let highMax = Number.NEGATIVE_INFINITY
  let count = 0
  for (const b of bars) {
    if (b.t < entryMs) continue
    if (b.t > exitMs) break
    if (typeof b.l === 'number' && Number.isFinite(b.l) && b.l < lowMin) lowMin = b.l
    if (typeof b.h === 'number' && Number.isFinite(b.h) && b.h > highMax) highMax = b.h
    count++
  }
  if (count === 0) return { mae: null, mfe: null }

  let mae: number
  let mfe: number
  if (trade.side === 'short') {
    mae = Math.max(0, highMax - entry)
    mfe = Math.max(0, entry - lowMin)
  } else {
    mae = Math.max(0, entry - lowMin)
    mfe = Math.max(0, highMax - entry)
  }
  return { mae, mfe }
}

export function backfillAllMaeMfe(): number {
  const db = openDatabase()
  const trades = db
    .prepare(`
      SELECT id, symbol, date, side, avg_buy_price, avg_sell_price,
             open_time, close_time, mae, mfe
      FROM trades
    `)
    .all() as {
      id: number
      symbol: string
      date: string
      side: 'long' | 'short'
      avg_buy_price: number
      avg_sell_price: number
      open_time: string
      close_time: string | null
      mae: number | null
      mfe: number | null
    }[]

  let written = 0
  const barsCache = new Map<string, IntradayBar[] | null>()
  for (const t of trades) {
    const key = `${t.symbol}|${t.date}`
    let bars = barsCache.get(key)
    if (bars === undefined) {
      const row = getIntradayRow(t.symbol, t.date)
      bars = row?.bars ?? null
      barsCache.set(key, bars)
    }
    const { mae, mfe } = computeMaeMfe(t, bars)
    if (mae !== t.mae || mfe !== t.mfe) {
      setTradeMaeMfe(t.id, mae, mfe)
      written++
    }
  }
  return written
}

export function computeEma9Distance(
  trade: TradeForEma,
  bars: IntradayBar[] | null,
): number | null {
  if (!bars || bars.length === 0) return null
  // open_time is true UTC (Day 8.5 Commit B) — Date.parse reads the Z suffix
  // as UTC, matching the UTC-epoch bar timestamps from Massive.
  const entryMs = Date.parse(trade.open_time)
  if (!Number.isFinite(entryMs)) return null

  // Find the bar containing the entry (its start ≤ entry < start + 60s).
  // Bars are sorted ascending by Massive.
  let cutoffIdx = -1
  for (let i = 0; i < bars.length; i++) {
    if (bars[i].t > entryMs) break
    cutoffIdx = i
  }
  if (cutoffIdx < 8) return null  // need 9 bars to seed the EMA9

  const closes = bars.slice(0, cutoffIdx + 1).map((b) => b.c)
  const series = ema(closes, 9)
  const last = series[series.length - 1]
  if (last == null || last <= 0) return null

  const entry = entryPriceOf(trade)
  if (!Number.isFinite(entry) || entry <= 0) return null

  return ((entry - last) / last) * 100
}
