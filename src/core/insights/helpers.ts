// Shared pure helpers for the Insights rules. Operate on TradeListRow data
// — no DOM, no IO, no electron. Safe to import from any environment.

import type { TradeListRow } from '@shared/trades-types'

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

/** Format a dollar amount with sign and no cents — used in body sentences. */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  return n >= 0 ? `+${USD.format(n)}` : `−${USD.format(Math.abs(n))}`
}

/** Same but always positive — used for losses where the caller adds the sign. */
export function fmtMoneyAbs(n: number): string {
  return USD.format(Math.abs(n))
}

export function fmtPct(p: number, digits = 0): string {
  return `${(p * 100).toFixed(digits)}%`
}

// ── Filters ────────────────────────────────────────────────────────────────

/** Return trades whose date falls within the last `days` days from `now`.
 *  Both bounds inclusive. Operates on the trade's `date` field (YYYY-MM-DD,
 *  market-local) so the cutoff is naturally calendar-aligned. */
export function filterLastNDays(
  trades: TradeListRow[],
  days: number,
  now: Date = new Date(),
): TradeListRow[] {
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const cutoffStr = isoDate(cutoff)
  return trades.filter((t) => t.date >= cutoffStr)
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${m < 10 ? '0' : ''}${m}-${day < 10 ? '0' : ''}${day}`
}

// ── Group + stat utilities ────────────────────────────────────────────────

/** Group trades by a derived key. Empty keys (null / undefined / "") drop. */
export function groupBy<K extends string>(
  trades: TradeListRow[],
  keyOf: (t: TradeListRow) => K | null | undefined,
): Map<K, TradeListRow[]> {
  const out = new Map<K, TradeListRow[]>()
  for (const t of trades) {
    const k = keyOf(t)
    if (k == null || k === '') continue
    const arr = out.get(k)
    if (arr) arr.push(t)
    else out.set(k, [t])
  }
  return out
}

export interface TradeAggregate {
  trade_count: number
  net_pnl: number
  winners: number
  losers: number
  /** Wins / (wins + losses). Null when no decided trades. */
  win_rate: number | null
  /** Sum / count over winning trades; null when none. */
  avg_winner: number | null
  avg_loser: number | null
}

export function aggregate(trades: TradeListRow[]): TradeAggregate {
  let net = 0
  let winners = 0
  let losers = 0
  let winnerSum = 0
  let loserSum = 0
  for (const t of trades) {
    net += t.net_pnl
    if (t.net_pnl > 0) {
      winners += 1
      winnerSum += t.net_pnl
    } else if (t.net_pnl < 0) {
      losers += 1
      loserSum += t.net_pnl
    }
  }
  const decided = winners + losers
  return {
    trade_count: trades.length,
    net_pnl: net,
    winners,
    losers,
    win_rate: decided > 0 ? winners / decided : null,
    avg_winner: winners > 0 ? winnerSum / winners : null,
    avg_loser:  losers > 0 ? loserSum / losers : null,
  }
}

// ── Bucketers ─────────────────────────────────────────────────────────────

export type FloatBucket = 'nano' | 'micro' | 'small' | 'mid' | 'unset'

/** Mirrors the bucket boundaries used by Analytics. Keep in sync if those
 *  ever change — duplicated here because Analytics' bucket lives in
 *  electron/* which the renderer-side core can't import. */
export function floatBucket(f: number | null): FloatBucket {
  if (f == null || !Number.isFinite(f) || f <= 0) return 'unset'
  if (f < 1_000_000) return 'nano'
  if (f < 5_000_000) return 'micro'
  if (f < 20_000_000) return 'small'
  return 'mid'
}

export const FLOAT_BUCKET_LABEL: Record<FloatBucket, string> = {
  nano:  'Nano (<1M)',
  micro: 'Micro (1M-5M)',
  small: 'Small (5M-20M)',
  mid:   'Mid (20M+)',
  unset: 'Unset',
}

/** Return the local-time hour (0..23) at which the trade was entered.
 *  Open_time is ISO without timezone (market-local). Returns null on
 *  unparseable input. */
export function entryHour(t: TradeListRow): number | null {
  if (!t.open_time) return null
  const parts = t.open_time.split('T')
  if (parts.length !== 2) return null
  const hh = Number.parseInt(parts[1].slice(0, 2), 10)
  return Number.isFinite(hh) ? hh : null
}

// ── Pretty labels ─────────────────────────────────────────────────────────

/** 2-digit hour string ("09", "13") → "09:00". */
export function hourLabel(h: number): string {
  return `${h < 10 ? '0' : ''}${h}:00`
}
