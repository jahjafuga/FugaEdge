// Pure Combined Signal Reads aggregation (spec §B Section 5 / §A9) — the
// full-alignment vs any-misalignment comparison, the "are you trading the system
// or not" read. Partitions data-complete trades into two cells by the §A9
// discipline conjunction — the shared isFullyAligned predicate (macd_positive
// AND above_9ema, plus above_vwap for regular-hours entries; pre-market entries
// drop the N/A session VWAP) — and computes a BucketStats for each, with the
// same expectancy / low-sample treatment as the distance bands.
//
// Null-handling matches computeHeaderStrip's disciplineScore EXACTLY (the other
// surface that computes alignment): only the data gate (technicals === null ||
// !data_complete) excludes a trade. A data-complete trade with a null snapshot
// value is NOT excluded — its above_* derivation simply reads false, so it falls
// into 'misaligned'. Keeping the two surfaces identical is the point: the
// Section-1 discipline-score card and this section must never disagree on what
// "fully aligned" means. There is therefore no unclassified tier — every
// data-complete trade lands in exactly one cell.
//
// Pure per ARCHITECTURE rule 1: no electron / fs / db / React imports. The
// identical module runs server-side on the future Next.js + Postgres port.

import type { TradeWithTechnicalsRow } from '@shared/technicals-types'
import type { Timeframe } from './headerStrip'
import type { BucketStats } from './types'
import { isFullyAligned, isPreMarketEntry } from './alignment'

/** The two Combined-Reads cells: fully aligned vs any-misalignment. */
export type AlignmentKey = 'aligned' | 'misaligned'

/**
 * Aggregated stats for the Combined Reads comparison. Two cells over the
 * data-complete set, plus the excluded tier:
 * - excluded: failed the data gate (technicals === null || !data_complete).
 * - aligned / misaligned: per-cell BucketStats.
 *
 * Invariant: excluded + aligned.n + misaligned.n === rows.length. No unclassified
 * tier — a data-complete trade always lands in one cell (a null snapshot value
 * reads as "not above" → misaligned, matching headerStrip's disciplineScore).
 */
export interface CombinedReadsStats {
  excluded: number
  aligned: BucketStats
  misaligned: BucketStats
}

/**
 * Whether a trade was fully aligned on `timeframe`, or null when it fails the
 * data gate (the excluded tier). Delegates to the shared isFullyAligned
 * predicate — now the literal single source of truth across XP + both analytics
 * surfaces (pre-market entries drop the N/A session VWAP). A data-complete trade
 * always returns 'aligned' or 'misaligned'; only the gate returns null.
 * computeCombinedReads and rowsForAlignment both resolve through it.
 */
export function classifyAlignment(
  row: TradeWithTechnicalsRow,
  timeframe: Timeframe,
): AlignmentKey | null {
  const t = row.technicals
  if (t === null || !t.data_complete) return null
  const snap = timeframe === '1m' ? t.tf_1m : t.tf_5m
  const aligned = isFullyAligned(
    snap.macd_positive,
    snap.vwap_dist_pct,
    snap.ema9_dist_pct,
    isPreMarketEntry(row.open_time),
  )
  return aligned ? 'aligned' : 'misaligned'
}

export function computeCombinedReads(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
): CombinedReadsStats {
  let excluded = 0

  interface Acc {
    n: number
    netPnl: number
    winnerCount: number
    winnerSum: number
    loserCount: number
    loserSum: number
  }
  const blank = (): Acc => ({
    n: 0,
    netPnl: 0,
    winnerCount: 0,
    winnerSum: 0,
    loserCount: 0,
    loserSum: 0,
  })

  // Fold one trade's P&L into a cell. Breakeven (net_pnl === 0) counts as a loss
  // per §A7, so a winner is strictly > 0.
  const tally = (a: Acc, net_pnl: number): void => {
    a.n += 1
    a.netPnl += net_pnl
    if (net_pnl > 0) {
      a.winnerCount += 1
      a.winnerSum += net_pnl
    } else {
      a.loserCount += 1
      a.loserSum += net_pnl
    }
  }

  const acc: Record<AlignmentKey, Acc> = { aligned: blank(), misaligned: blank() }

  for (const row of rows) {
    const key = classifyAlignment(row, timeframe)
    if (key === null) {
      excluded += 1
      continue
    }
    tally(acc[key], row.net_pnl)
  }

  // Per-cell BucketStats — identical shape + math to vwapBuckets' toBucket
  // (expectancy = netPnl / n, suppressed to null below n=5 per §C:104).
  const toBucket = (a: Acc): BucketStats => ({
    n: a.n,
    winRate: a.n === 0 ? null : a.winnerCount / a.n,
    netPnl: a.netPnl,
    avgWinner: a.winnerCount === 0 ? null : a.winnerSum / a.winnerCount,
    avgLoser: a.loserCount === 0 ? null : a.loserSum / a.loserCount,
    expectancy: a.n < 5 ? null : a.netPnl / a.n,
  })

  return {
    excluded,
    aligned: toBucket(acc.aligned),
    misaligned: toBucket(acc.misaligned),
  }
}

/**
 * The trades that land in `key` on `timeframe`, in input order — the accordion's
 * row source. Re-uses classifyAlignment so the rows shown under a cell exactly
 * match its counts; excluded trades never appear.
 */
export function rowsForAlignment(
  rows: TradeWithTechnicalsRow[],
  timeframe: Timeframe,
  key: AlignmentKey,
): TradeWithTechnicalsRow[] {
  return rows.filter((row) => classifyAlignment(row, timeframe) === key)
}
