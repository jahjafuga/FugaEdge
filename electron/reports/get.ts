import { openDatabase } from '../db/database'
import { getAllMarketRows, type MarketRow } from '../market/repo'
import { buildEquityCurve, computeDrawdown } from '@/core/performance/equity'
import { computeFullStats } from '@/core/performance/fullStats'
import { utcToEasternParts } from '@/lib/format'
import type {
  BucketStats,
  DayBreakdown,
  DrawdownInfo,
  ReportsData,
  VolumeAnalysis,
} from '@shared/reports-types'
import { isWin, isLoss } from '@/core/classify/outcome'

// computeFullStats + its pure helpers moved to src/core/performance/fullStats so
// the renderer-side Compare can run them per-period. Re-exported here so existing
// importers of '../get' (the characterization test) stay unchanged; getReports
// uses the imported binding above.
export { computeFullStats }

interface TradeForReport {
  date: string
  symbol: string
  side: 'long' | 'short'
  open_time: string
  close_time: string | null
  avg_buy_price: number
  avg_sell_price: number
  shares_bought: number
  shares_sold: number
  net_pnl: number
  gross_pnl: number
  total_fees: number
  mae: number | null
  mfe: number | null
  country: string | null
  region: string | null
  // v0.2.3 Stage B — sourced from market_data by symbol (NOT trades columns);
  // enriched in getReports after the SELECT. Optional: absent until enriched.
  sector?: string | null
  industry?: string | null
}

function computeStats(trades: TradeForReport[], key: string, order: number): BucketStats {
  let net = 0
  let fees = 0
  let winnersSum = 0
  let winnersCount = 0
  let losersSum = 0
  let losersCount = 0
  let largestWinner: number | null = null
  let largestLoser: number | null = null

  for (const t of trades) {
    net += t.net_pnl
    fees += t.total_fees
    if (isWin(t.net_pnl)) {
      winnersSum += t.net_pnl
      winnersCount++
      if (largestWinner == null || t.net_pnl > largestWinner) largestWinner = t.net_pnl
    } else if (isLoss(t.net_pnl)) {
      losersSum += t.net_pnl
      losersCount++
      if (largestLoser == null || t.net_pnl < largestLoser) largestLoser = t.net_pnl
    }
  }

  const decided = winnersCount + losersCount
  return {
    key,
    order,
    trade_count: trades.length,
    net_pnl: net,
    total_fees: fees,
    winners: winnersCount,
    losers: losersCount,
    win_rate: decided > 0 ? winnersCount / decided : null,
    avg_winner: winnersCount > 0 ? winnersSum / winnersCount : null,
    avg_loser: losersCount > 0 ? losersSum / losersCount : null,
    largest_winner: largestWinner,
    largest_loser: largestLoser,
    profit_factor:
      losersCount > 0 ? winnersSum / Math.abs(losersSum) : null,
  }
}

// Entry price for a round trip — what the trader paid per share to put the
// position on. For longs that's the buy avg, for shorts the sell avg. Falls
// back to whichever side has data.
function entryPrice(t: TradeForReport): number {
  if (t.side === 'short') {
    return t.avg_sell_price || t.avg_buy_price
  }
  return t.avg_buy_price || t.avg_sell_price
}

const PRICE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< $2',   min: 0,  max: 2 },
  { key: '$2–5',   min: 2,  max: 5 },
  { key: '$5–10',  min: 5,  max: 10 },
  { key: '$10–15', min: 10, max: 15 },
  { key: '$15–20', min: 15, max: 20 },
  { key: '> $20',  min: 20, max: Number.POSITIVE_INFINITY },
]

function priceBucketKey(price: number): { key: string; order: number } | null {
  for (let i = 0; i < PRICE_BUCKETS.length; i++) {
    const b = PRICE_BUCKETS[i]
    if (price >= b.min && price < b.max) return { key: b.key, order: i }
  }
  return null
}

const SHARE_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '0–50',      min: 0,    max: 50 },
  { key: '50–100',    min: 50,   max: 100 },
  { key: '100–250',   min: 100,  max: 250 },
  { key: '250–500',   min: 250,  max: 500 },
  { key: '500–1000',  min: 500,  max: 1000 },
  { key: '1000–2500', min: 1000, max: 2500 },
  { key: '2500+',     min: 2500, max: Number.POSITIVE_INFINITY },
]

function shareBucketKey(shares: number): { key: string; order: number } {
  for (let i = 0; i < SHARE_BUCKETS.length; i++) {
    const b = SHARE_BUCKETS[i]
    if (shares >= b.min && shares < b.max) return { key: b.key, order: i }
  }
  return { key: SHARE_BUCKETS[SHARE_BUCKETS.length - 1].key, order: SHARE_BUCKETS.length - 1 }
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// JS getDay(): Sun=0 Mon=1 ... Sat=6. We display Mon→Fri first (trading
// week), then Sat, then Sun for the rare weekend timestamp.
const DOW_DISPLAY_ORDER: Record<number, number> = {
  1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6,
}

function dowFromDate(iso: string): number {
  // Parse as local — fine for our purposes since 'date' is the open day.
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function hourFromTime(iso: string): number {
  // `iso` is true UTC (Day 8.5 Commit B) — bucket byHour by the Eastern hour
  // so the report still groups trades by US-market wall-clock.
  return utcToEasternParts(iso)?.hour ?? 0
}

function groupBy<T, K>(items: T[], keyOf: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const t of items) {
    const k = keyOf(t)
    const list = out.get(k)
    if (list) list.push(t)
    else out.set(k, [t])
  }
  return out
}

function sortByOrder(buckets: BucketStats[]): BucketStats[] {
  return [...buckets].sort((a, b) => a.order - b.order)
}

const SYMBOL_LIMIT = 25

function computeWinLossDays(trades: TradeForReport[]): DayBreakdown[] {
  const byDate = new Map<string, DayBreakdown>()
  for (const t of trades) {
    let d = byDate.get(t.date)
    if (!d) {
      d = {
        date: t.date,
        trade_count: 0,
        winners: 0,
        losers: 0,
        scratches: 0,
        gross_pnl: 0,
        total_fees: 0,
        net_pnl: 0,
      }
      byDate.set(t.date, d)
    }
    d.trade_count += 1
    d.gross_pnl += t.gross_pnl
    d.total_fees += t.total_fees
    d.net_pnl += t.net_pnl
    if (isWin(t.net_pnl)) d.winners += 1
    else if (isLoss(t.net_pnl)) d.losers += 1
    else d.scratches += 1
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  )
}

function computeDrawdownInfo(trades: TradeForReport[]): DrawdownInfo | null {
  const equity = buildEquityCurve(trades)
  const dd = computeDrawdown(equity)
  if (!dd) return null
  return {
    amount: dd.amount,
    percent: dd.percent,
    peak_date: dd.peak_date,
    peak_value: dd.peak_value,
    trough_date: dd.trough_date,
    trough_value: dd.trough_value,
    recovered: dd.recovered,
    recovery_date: dd.recovery_date,
    longest_period_days: dd.longest_period_days,
    current_drawdown: dd.current_drawdown,
    equity: dd.equity.map((p) => ({
      date: p.date,
      cumulative: p.cumulative,
      in_drawdown: p.in_drawdown,
    })),
  }
}

const FLOAT_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '< 1M',    min: 0,          max: 1_000_000 },
  { key: '1–2.5M',  min: 1_000_000,  max: 2_500_000 },
  { key: '2.5–5M',  min: 2_500_000,  max: 5_000_000 },
  { key: '5–10M',   min: 5_000_000,  max: 10_000_000 },
  { key: '10–20M',  min: 10_000_000, max: 20_000_000 },
  { key: '20–50M',  min: 20_000_000, max: 50_000_000 },
  { key: '> 50M',   min: 50_000_000, max: Number.POSITIVE_INFINITY },
]

function floatBucket(shares: number): { key: string; order: number } | null {
  if (!Number.isFinite(shares) || shares < 0) return null
  for (let i = 0; i < FLOAT_BUCKETS.length; i++) {
    const b = FLOAT_BUCKETS[i]
    if (shares >= b.min && shares < b.max) return { key: b.key, order: i }
  }
  return null
}

const RVOL_BUCKETS: { key: string; min: number; max: number }[] = [
  { key: '0–2×',   min: 0,  max: 2 },
  { key: '2–5×',   min: 2,  max: 5 },
  { key: '5–10×',  min: 5,  max: 10 },
  { key: '10×+',   min: 10, max: Number.POSITIVE_INFINITY },
]

function rvolBucket(rvol: number): { key: string; order: number } | null {
  if (!Number.isFinite(rvol) || rvol < 0) return null
  for (let i = 0; i < RVOL_BUCKETS.length; i++) {
    const b = RVOL_BUCKETS[i]
    if (rvol >= b.min && rvol < b.max) return { key: b.key, order: i }
  }
  return null
}

function computeVolumeAnalysis(trades: TradeForReport[]): VolumeAnalysis {
  const marketBySymbol = new Map<string, MarketRow>()
  for (const row of getAllMarketRows()) marketBySymbol.set(row.symbol, row)

  // If we have no market_data at all, surface the "unavailable" state with a
  // useful next-action message. This avoids showing an empty section.
  if (marketBySymbol.size === 0) {
    return {
      status: 'unavailable',
      reason:
        'No market data cached yet. Set your Massive API key in Settings ' +
        'and click "Refresh market data".',
      byFloat: [],
      byRvol: [],
      trades_analyzed: trades.length,
      trades_missing_data: trades.length,
    }
  }

  const byFloatMap = new Map<number, TradeForReport[]>()
  const byRvolMap = new Map<number, TradeForReport[]>()

  let analyzed = 0
  let missing = 0

  for (const t of trades) {
    const md = marketBySymbol.get(t.symbol)
    if (!md || md.error) {
      missing++
      continue
    }
    analyzed++

    if (md.float != null) {
      const fb = floatBucket(md.float)
      if (fb) {
        const list = byFloatMap.get(fb.order)
        if (list) list.push(t)
        else byFloatMap.set(fb.order, [t])
      }
    }

    if (md.avg_volume != null && md.avg_volume > 0) {
      const dayVol = md.daily_volumes[t.date]
      if (typeof dayVol === 'number' && dayVol > 0) {
        const rvol = dayVol / md.avg_volume
        const rb = rvolBucket(rvol)
        if (rb) {
          const list = byRvolMap.get(rb.order)
          if (list) list.push(t)
          else byRvolMap.set(rb.order, [t])
        }
      }
    }
  }

  const byFloat = sortByOrder(
    Array.from(byFloatMap.entries()).map(([order, ts]) =>
      computeStats(ts, FLOAT_BUCKETS[order].key, order),
    ),
  )
  const byRvol = sortByOrder(
    Array.from(byRvolMap.entries()).map(([order, ts]) =>
      computeStats(ts, RVOL_BUCKETS[order].key, order),
    ),
  )

  return {
    status: 'ready',
    byFloat,
    byRvol,
    trades_analyzed: analyzed,
    trades_missing_data: missing,
  }
}

function buildByRegion(trades: TradeForReport[]): BucketStats[] {
  const groups = groupBy(trades, (t) => t.region ?? 'Unknown')
  const out: BucketStats[] = []
  let i = 0
  for (const [key, group] of groups) {
    out.push(computeStats(group, key, i++))
  }
  // Sort by trade count desc; Unknown last regardless of count.
  out.sort((a, b) => {
    if (a.key === 'Unknown' && b.key !== 'Unknown') return 1
    if (b.key === 'Unknown' && a.key !== 'Unknown') return -1
    return b.trade_count - a.trade_count
  })
  return out
}

// v0.2.3 Stage B — sector/industry breakdowns. Both mirror buildByRegion
// exactly (group, 'Unknown' bucketed and sorted last, count-desc otherwise),
// because sector/industry are a coarse closed-ish set like region — every
// group is shown, none dropped, no min-trades collapse. Exported for direct
// unit testing — as is buildByCountry (for its not_shown test); region stays internal.
export function buildBySector(trades: TradeForReport[]): BucketStats[] {
  const groups = groupBy(trades, (t) => t.sector ?? 'Unknown')
  const out: BucketStats[] = []
  let i = 0
  for (const [key, group] of groups) {
    out.push(computeStats(group, key, i++))
  }
  out.sort((a, b) => {
    if (a.key === 'Unknown' && b.key !== 'Unknown') return 1
    if (b.key === 'Unknown' && a.key !== 'Unknown') return -1
    return b.trade_count - a.trade_count
  })
  return out
}

export function buildByIndustry(trades: TradeForReport[]): BucketStats[] {
  const groups = groupBy(trades, (t) => t.industry ?? 'Unknown')
  const out: BucketStats[] = []
  let i = 0
  for (const [key, group] of groups) {
    out.push(computeStats(group, key, i++))
  }
  out.sort((a, b) => {
    if (a.key === 'Unknown' && b.key !== 'Unknown') return 1
    if (b.key === 'Unknown' && a.key !== 'Unknown') return -1
    return b.trade_count - a.trade_count
  })
  return out
}

const COUNTRY_MIN_TRADES = 3

// Unlike region/sector/industry (which show every group), By Country DROPS two
// kinds of trades: those with no country logged (the `!key` group) and those in
// a country below COUNTRY_MIN_TRADES (the long-tail collapse that keeps the card
// from filling with one-off foreign listings). That silently turned e.g. "98
// trades" into "95 shown". We keep the collapse but also return a `notShown`
// count so the Symbols-tab card can disclose it — total minus the kept buckets'
// trades, which is robust to both drop reasons.
export function buildByCountry(trades: TradeForReport[]): {
  buckets: BucketStats[]
  notShown: number
} {
  const groups = groupBy(trades, (t) => t.country ?? '')
  const out: BucketStats[] = []
  let i = 0
  for (const [key, group] of groups) {
    if (!key) continue                               // skip unknowns
    if (group.length < COUNTRY_MIN_TRADES) continue  // long-tail collapse
    out.push(computeStats(group, key, i++))
  }
  out.sort((a, b) => b.trade_count - a.trade_count)
  const shown = out.reduce((s, b) => s + b.trade_count, 0)
  return { buckets: out, notShown: trades.length - shown }
}

export function getReports(): ReportsData {
  const db = openDatabase()
  const trades = db
    .prepare(`
      SELECT
        date, symbol, side, open_time, close_time,
        avg_buy_price, avg_sell_price,
        shares_bought, shares_sold,
        net_pnl, gross_pnl, total_fees,
        mae, mfe,
        country, region
      FROM trades
      WHERE deleted_at IS NULL
    `)
    .all() as TradeForReport[]

  // v0.2.3 Stage B — enrich each trade with sector/industry from market_data
  // (keyed by symbol; these columns live in market_data, not on `trades`, so
  // the SELECT above can't carry them). One map build, reused for both
  // dimensions. No network — getAllMarketRows reads cached rows.
  // (computeVolumeAnalysis builds its own market map separately; left as-is.)
  const marketBySymbol = new Map<string, MarketRow>()
  for (const row of getAllMarketRows()) marketBySymbol.set(row.symbol, row)
  for (const t of trades) {
    const md = marketBySymbol.get(t.symbol)
    t.sector = md?.sector ?? null
    t.industry = md?.industry ?? null
  }

  // Price range
  const byPriceMap = new Map<number, TradeForReport[]>()
  for (const t of trades) {
    const bucket = priceBucketKey(entryPrice(t))
    if (!bucket) continue
    const list = byPriceMap.get(bucket.order)
    if (list) list.push(t)
    else byPriceMap.set(bucket.order, [t])
  }
  const byPriceRange = sortByOrder(
    Array.from(byPriceMap.entries()).map(([order, ts]) =>
      computeStats(ts, PRICE_BUCKETS[order].key, order),
    ),
  )

  // Day of week
  const byDowMap = groupBy(trades, (t) => dowFromDate(t.date))
  const byDayOfWeek = sortByOrder(
    Array.from(byDowMap.entries()).map(([dow, ts]) =>
      computeStats(ts, DOW_LABELS[dow], DOW_DISPLAY_ORDER[dow] ?? 99),
    ),
  )

  // Hour
  const byHourMap = groupBy(trades, (t) => hourFromTime(t.open_time))
  const byHour = sortByOrder(
    Array.from(byHourMap.entries()).map(([hour, ts]) =>
      computeStats(ts, `${hour < 10 ? '0' + hour : hour}:00`, hour),
    ),
  )

  // Symbol (top SYMBOL_LIMIT by trade count)
  const bySymbolMap = groupBy(trades, (t) => t.symbol)
  const bySymbolAll = Array.from(bySymbolMap.entries()).map(([sym, ts], i) =>
    computeStats(ts, sym, i),
  )
  bySymbolAll.sort((a, b) => b.trade_count - a.trade_count)
  const bySymbol = bySymbolAll.slice(0, SYMBOL_LIMIT).map((b, i) => ({ ...b, order: i }))

  // Share size (peak position size)
  const byShareMap = new Map<number, TradeForReport[]>()
  for (const t of trades) {
    const peak = Math.max(t.shares_bought, t.shares_sold)
    const bucket = shareBucketKey(peak)
    const list = byShareMap.get(bucket.order)
    if (list) list.push(t)
    else byShareMap.set(bucket.order, [t])
  }
  const byShareSize = sortByOrder(
    Array.from(byShareMap.entries()).map(([order, ts]) =>
      computeStats(ts, SHARE_BUCKETS[order].key, order),
    ),
  )

  const byCountry = buildByCountry(trades)

  return {
    byPriceRange,
    byDayOfWeek,
    byHour,
    bySymbol,
    byShareSize,
    byRegion: buildByRegion(trades),
    byCountry: byCountry.buckets,
    byCountryNotShown: byCountry.notShown,
    bySector: buildBySector(trades),
    byIndustry: buildByIndustry(trades),
    fullStats: computeFullStats(trades),
    volumeAnalysis: computeVolumeAnalysis(trades),
    winLossDays: computeWinLossDays(trades),
    drawdown: computeDrawdownInfo(trades),
    trade_count: trades.length,
  }
}
