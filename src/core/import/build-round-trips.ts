import { createHash } from 'node:crypto'
import type {
  Execution,
  RoundTrip,
  RoundTripExecution,
} from '@shared/import-types'

// Broker-agnostic round-trip constructor. Replaces electron/import/compute-trips
// (which only knew DAS Trades.csv shape). Pure module — no electron/fs/sqlite
// imports — so it runs unchanged inside a Next.js page or worker.
//
// TODO(web-port): swap createHash('sha1') for a Web Crypto wrapper when we
// stand up the web target. Until then, node:crypto is available in both
// Electron main and renderer processes.

const HASH_FIELD_SEPARATOR = '\u0000'

// Fee component fields summed into RoundTrip.total_fees. Sign-preserving:
// negative ECN values (rebates) reduce total_fees. Keep this list in sync
// with shared/import-types.ts's Execution fee fields.
const FEE_KEYS = [
  'commission',
  'ecn_fee',
  'sec_fee',
  'finra_fee',
  'cat_fee',
  'htb_fee',
  'other_fees',
] as const

// Group key for partitioning executions into independent ledgers. Single-
// account users see symbol-only grouping (account_name unset → collapses
// back to v0.1.6 behaviour). Multi-account users — once a Day 4+ parser
// starts populating account_name — get per-(symbol, account) partitions.
function groupKey(e: Execution): string {
  const acct = (e.account_name ?? '').trim()
  return acct ? `${e.symbol}${HASH_FIELD_SEPARATOR}${acct}` : e.symbol
}

// account_name participates in the hash ONLY when non-empty, so v0.1.6
// round trips (which never carried account_name) keep their hash identity
// on upgrade — every existing trade still dedups against itself.
export function hashFills(execs: Execution[]): string {
  const acct = (execs[0]?.account_name ?? '').trim()
  const ids = execs
    .map((e) => `${e.trade_id}:${e.order_id}`)
    .sort()
    .join('|')
  const payload = acct ? `${acct}${HASH_FIELD_SEPARATOR}${ids}` : ids
  return createHash('sha1').update(payload).digest('hex')
}

// Normalize a UTC ISO 8601 timestamp to second-precision with a Z suffix.
// Strips sub-second precision so the content_hash payload is stable across
// equivalent inputs.
//
// Bare ISO without offset (e.g. "2026-05-05T13:30:00") is treated as UTC —
// matches Day 8.5 Commit B's contract that EVERY stored timestamp is UTC;
// the Z suffix is just the explicit marker, not the source of truth. This
// rule guards any legacy / hand-edited blob the v0.2.1 migration backfill
// might encounter where the Z slipped off — without it, JavaScript's
// Date.parse can interpret bare ISO as local time on some runtimes
// (ECMAScript history is ugly here) and the same instant would hash
// differently across machines.
//
// Throws on inputs that don't parse — mirrors the fail-fast policy of
// barLocalToUtcField in migrate-tz-utc.ts.
function normalizeUtcIso(value: string): string {
  const trimmed = value.trim()
  // Append Z if there's no timezone indicator, so Date.parse always reads
  // as UTC. ISO 8601 timezone forms: Z, +HH:MM, -HH:MM, +HHMM, -HHMM.
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)
  const forParse = hasTz ? trimmed : `${trimmed}Z`
  const ms = Date.parse(forParse)
  if (Number.isNaN(ms)) {
    throw new Error(`normalizeUtcIso: unparseable "${value}"`)
  }
  const d = new Date(ms)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`
  )
}

// Content-based hash for cross-format duplicate detection. Companion to
// the ID-based exec_hash above. Together they form the dual-hash dedup
// contract: a trip is duplicate if EITHER hash matches an existing row.
//
// Inputs per fill: (symbol, time_utc, side, qty, price) — all
// broker-agnostic. trade_id / order_id are deliberately excluded because
// they're what exec_hash already covers; content_hash exists precisely to
// catch the case where the SAME logical fill carries DIFFERENT IDs across
// export formats (DAS Trades.csv real TradeID vs Webull Mobile synthetic
// 'wbm-...', etc. — the scenario b1/b2 failure modes the dedup
// investigation surfaced 2026-05-26).
//
// account_name is EXCLUDED because v0.2.0 parser coverage of account_name
// is patchy (some files emit it, some don't), and including it would
// re-create the scenario (b3) failure mode the content_hash exists to
// catch. The false-positive risk (multi-account traders with identical
// fills at the same second) is acceptable for FugaEdge's current
// solo-trader audience. Revisit when multi-account support ships.
//
// TODO(multi-account): when Pro tier multi-account ships, reconsider
// including account_name here — see docs/plans/v0_3_0-or-later-ideas.md
// → Multi-Account Support section.
//
// Sort independence: fills are sorted by their content tuple before
// joining, so the same logical trade hashes identically regardless of the
// order fills appear in executions_json. Stable across re-imports and
// across format-specific fill ordering.
export function hashFillsByContent(execs: Execution[]): string {
  const tuples = execs.map((e) => {
    const symbol = e.symbol.trim().toUpperCase()
    const time = normalizeUtcIso(e.time)
    if (e.side !== 'B' && e.side !== 'S') {
      throw new Error(`hashFillsByContent: unexpected side "${e.side}"`)
    }
    const qty = Math.round(e.qty)
    const price = round4(e.price)
    return `${symbol}|${time}|${e.side}|${qty}|${price.toFixed(4)}`
  })
  tuples.sort()
  return createHash('sha1').update(tuples.join('||')).digest('hex')
}

function execFees(e: Execution): number {
  let sum = 0
  for (const k of FEE_KEYS) {
    const v = e[k]
    if (typeof v === 'number' && Number.isFinite(v)) sum += v
  }
  return sum
}

function hasReportedFee(e: Execution): boolean {
  for (const k of FEE_KEYS) {
    if (typeof e[k] === 'number') return true
  }
  return false
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

export function buildRoundTrips(executions: Execution[]): RoundTrip[] {
  const groups = new Map<string, Execution[]>()
  for (const e of executions) {
    const k = groupKey(e)
    const list = groups.get(k)
    if (list) list.push(e)
    else groups.set(k, [e])
  }

  const trips: RoundTrip[] = []
  for (const list of groups.values()) {
    list.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))

    let position = 0
    let bucket: Execution[] = []
    for (const e of list) {
      bucket.push(e)
      position += e.side === 'B' ? e.qty : -e.qty
      if (position === 0) {
        trips.push(closeTrip(bucket, false))
        bucket = []
      }
    }
    // Day 1 decision E: open positions persist as is_open=1; the repo
    // wipe-and-rewrites them on the next import that touches the same
    // (symbol, date). They are not silently dropped.
    if (bucket.length > 0) trips.push(closeTrip(bucket, true))
  }

  trips.sort((a, b) =>
    a.open_time < b.open_time ? -1 : a.open_time > b.open_time ? 1 : 0,
  )
  return trips
}

function closeTrip(execs: Execution[], isOpen: boolean): RoundTrip {
  let sharesBought = 0
  let sharesSold = 0
  let costBought = 0
  let proceedsSold = 0
  let feeSum = 0
  let anyFeeReported = false

  const fills: RoundTripExecution[] = []
  for (const e of execs) {
    if (e.side === 'B') {
      sharesBought += e.qty
      costBought += e.qty * e.price
    } else {
      sharesSold += e.qty
      proceedsSold += e.qty * e.price
    }
    feeSum += execFees(e)
    if (hasReportedFee(e)) anyFeeReported = true
    fills.push({
      trade_id: e.trade_id,
      order_id: e.order_id,
      side: e.side,
      qty: e.qty,
      price: e.price,
      time: e.time,
      // Optional reference data, persisted via executions_json. Undefined
      // when the source parser didn't populate them (e.g. tradehistory has
      // broker_pnl but no route; DAS Trades.csv has route but rarely P/L).
      route: e.route,
      broker_pnl: e.broker_pnl,
    })
  }

  const first = execs[0]
  const last = execs[execs.length - 1]
  const side: 'long' | 'short' = first.side === 'B' ? 'long' : 'short'
  const grossPnl = round2(proceedsSold - costBought)
  const totalFees = round2(feeSum)
  const avgBuy = sharesBought > 0 ? round4(costBought / sharesBought) : 0
  const avgSell = sharesSold > 0 ? round4(proceedsSold / sharesSold) : 0

  const acct = (first.account_name ?? '').trim()

  return {
    date: first.date,
    symbol: first.symbol,
    side,
    open_time: first.time,
    close_time: isOpen ? null : last.time,
    is_open: isOpen,
    shares_bought: sharesBought,
    avg_buy_price: avgBuy,
    shares_sold: sharesSold,
    avg_sell_price: avgSell,
    gross_pnl: grossPnl,
    total_fees: totalFees,
    net_pnl: round2(grossPnl - totalFees),
    // Beat B2a: pre-round full-precision companions to the 2dp columns above.
    // proceedsSold-costBought and feeSum are the exact values before round2;
    // Beat B3 sums these to avoid round-then-sum drift on the dashboard.
    gross_pnl_precise: proceedsSold - costBought,
    total_fees_precise: feeSum,
    exec_hash: hashFills(execs),
    content_hash: hashFillsByContent(execs),
    executions: fills,
    status: 'new',
    source_broker: first.source_broker,
    source_format: first.source_format,
    source_file: first.source_file,
    account_name: acct || undefined,
    fees_reported: anyFeeReported,
  }
}
