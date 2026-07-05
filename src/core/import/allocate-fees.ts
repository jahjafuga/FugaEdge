// Pro-rata fee allocation across the trips of a single (date, symbol) bucket.
//
// Pure module — no electron / fs / sqlite imports — so it runs unchanged
// inside a Next.js page or a worker. The DB-coupled wrapper lives in
// electron/import/apply-fees.ts and calls this for the actual math.
//
// SIGN-PRESERVING. Day 3 of v0.2.0 removed the v0.1.6 `< 0 ? 0` clamp on
// each component — ECN can be negative (maker rebate when the trader adds
// liquidity) and that negative value MUST survive allocation to flow
// through to trades.fee_ecn and reduce total_fees / boost net_pnl.

export interface TripShare {
  /** Stable identifier the caller uses to write the allocation back. */
  id: number
  /** shares_bought + shares_sold — allocation basis. */
  total_shares: number
}

export interface DayFees {
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  // Schema 40 (Ocean One fee-merge): the broker's distinct commission and the
  // pooled "other" bucket (ORF/OCC/NSCC/Acc/Clr/Misc). OPTIONAL so the five-
  // category DAS callers compile unchanged; absent ⇒ 0. These are folded into
  // total_fees but NOT written to trades.fee_* — there are no such trade columns
  // (RULED: trade-level itemization is deferred); they exist only to keep the
  // superseded Ocean One trip's total whole on the surviving DAS trade.
  fee_commission?: number
  fee_other?: number
}

export interface AllocatedFees {
  id: number
  fee_ecn: number
  fee_sec: number
  fee_finra: number
  fee_htb: number
  fee_cat: number
  total_fees: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Allocates `fees` across `trips` weighted by total_shares. The last trip
// absorbs the rounding residue so the sum of allocations per component
// equals the source fee exactly (no penny-off drift from naive ratio +
// round).
//
// Returns [] if total_shares across the bucket is zero (defensive — no
// real trip should hit this, but a bucket of all-zero-share trips would
// otherwise divide by zero).
export function allocateFees(
  trips: TripShare[],
  fees: DayFees,
): AllocatedFees[] {
  if (trips.length === 0) return []

  const totalShares = trips.reduce((acc, t) => acc + t.total_shares, 0)
  if (totalShares === 0) return []

  // Ocean One's commission + other are pooled and allocated with the same
  // last-trip residue as the five regulatory categories, then folded into
  // total_fees. Absent (DAS five-category callers) ⇒ 0.
  const srcComm = fees.fee_commission ?? 0
  const srcOther = fees.fee_other ?? 0

  const acc = { ecn: 0, sec: 0, finra: 0, htb: 0, cat: 0, comm: 0, other: 0 }
  const out: AllocatedFees[] = []

  trips.forEach((t, i) => {
    const last = i === trips.length - 1
    const ratio = t.total_shares / totalShares
    const ecn = last ? round2(fees.fee_ecn - acc.ecn) : round2(fees.fee_ecn * ratio)
    const sec = last ? round2(fees.fee_sec - acc.sec) : round2(fees.fee_sec * ratio)
    const finra = last ? round2(fees.fee_finra - acc.finra) : round2(fees.fee_finra * ratio)
    const htb = last ? round2(fees.fee_htb - acc.htb) : round2(fees.fee_htb * ratio)
    const cat = last ? round2(fees.fee_cat - acc.cat) : round2(fees.fee_cat * ratio)
    const comm = last ? round2(srcComm - acc.comm) : round2(srcComm * ratio)
    const other = last ? round2(srcOther - acc.other) : round2(srcOther * ratio)

    acc.ecn += ecn
    acc.sec += sec
    acc.finra += finra
    acc.htb += htb
    acc.cat += cat
    acc.comm += comm
    acc.other += other

    out.push({
      id: t.id,
      fee_ecn: ecn,
      fee_sec: sec,
      fee_finra: finra,
      fee_htb: htb,
      fee_cat: cat,
      // commission + other are folded into the total (they have no trades.fee_*
      // column of their own — deferred), so net_pnl reflects the whole fee.
      total_fees: round2(ecn + sec + finra + htb + cat + comm + other),
    })
  })

  return out
}

// Zero-out allocation for a bucket whose day_fees row is missing. The
// DB wrapper uses this when the user un-imports a fee file or fees were
// never present for the (date, symbol) — every trip in the bucket gets
// fee_* and total_fees set to 0.
export function zeroAllocation(trips: TripShare[]): AllocatedFees[] {
  return trips.map((t) => ({
    id: t.id,
    fee_ecn: 0,
    fee_sec: 0,
    fee_finra: 0,
    fee_htb: 0,
    fee_cat: 0,
    total_fees: 0,
  }))
}
