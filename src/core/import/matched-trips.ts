// v0.2.7 Bug 5 — the import preview's "Trips" count, computed once.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite imports.
//
// THE DEFECT. The count was assembled from two sources and added: a DB query for
// round trips already in the book, plus every trip arriving in the batch. On a
// re-import those are the SAME trips, so a seven-trip day displayed 14.
//
// THE CONTRACT. matchedTrips is the number of LIVE round trips this fee row belongs
// to for (date, symbol, account) once the import lands — the trips already in the
// book, plus only those arriving that will actually be inserted. A trip already
// marked `duplicate` will not be inserted, so counting it was the double-count.
//
// WHY THIS DELIBERATELY DIFFERS FROM THE PRO-RATA DIVISOR — do not "fix" the
// divergence back into a bug. The divisor (apply-fees.ts) additionally excludes
// `fees_reported = 1`, because those trips carry their own broker-itemised fees and
// must never receive a pro-rata share. EVERY Ocean One trip is fees_reported = 1, so
// for that broker the divisor is empty by design. Adopting its clause here would
// print "0 trips" on a day the user has seven trades on — technically true of the
// allocation, and useless to a human reading the preview. This count answers "how
// many trades does this fee row belong to", not "how many will the pro-rata touch".

export interface IncomingTrip {
  date: string
  symbol: string
  /** 'new' is the only status commit() inserts (repo.ts). */
  status: string
}

export interface FeeRowLike {
  date: string
  symbol: string
  /** Seeded with the count of LIVE trips already in the book for this key. */
  matchedTrips: number
}

export function withMatchedTrips<T extends FeeRowLike>(
  fees: T[],
  incoming: IncomingTrip[],
): T[] {
  const insertableByKey = new Map<string, number>()
  for (const t of incoming) {
    if (t.status !== 'new') continue // duplicates are not inserted, so they do not count
    const k = `${t.date}|${t.symbol}`
    insertableByKey.set(k, (insertableByKey.get(k) ?? 0) + 1)
  }
  return fees.map((f) => ({
    ...f,
    matchedTrips: f.matchedTrips + (insertableByKey.get(`${f.date}|${f.symbol}`) ?? 0),
  }))
}
