// v0.2.7 — THE TRADES FILTER PREFERENCE. Filters survive the page.
//
// WHAT THIS FIXES. Trades.tsx held its filter state in
// `useState<TradesFilterState>(emptyFilters())`, so every mount threw it away:
// open a trade's detail, come back, and the narrowing you had set up was gone.
// Column visibility on the same page has persisted through columns.ts all
// along. Same page, same concern, two different answers.
//
// THE IDIOM IS columns.ts', deliberately: localStorage, the same `storage()`
// helper that tolerates no-window, the same defensive read that falls back to
// defaults rather than throwing, and a write called by the change handler. Not
// the settings table — for state the user just changed, a DB round-trip would
// inherit the staleness columns.ts already documented, and this is view state,
// not app config.
//
// TWO DEPARTURES FROM columns.ts, both because a filter is not a column toggle:
//
//   KEYED BY ACCOUNT. The same columns make sense in every book; a filter does
//   not. "playbook 7, catalyst FDA" restored into an account that has neither
//   shows an empty table for reasons the user cannot see. The scope is part of
//   the key, and the all-accounts view is its own key.
//
//   VERSIONED. columns.ts stores a bare object and absorbs new fields by
//   spreading over its defaults — which is sound for a flat map of booleans.
//   It is not sound here: absent and empty differ in meaning on two fields,
//   where a `null` inside playbookIds / catalystTypes is the UNTAGGED bucket
//   rather than an unset filter. A version stamp is what lets a future shape
//   change be detected instead of half-read.

import type { AccountScope } from '@shared/accounts-types'
import type { MistakeAxis } from '@shared/mistakes-types'
import { emptyFilters, type TradesFilterState } from '@/core/trades/tradesFilter'
import { isRangeActive, type NumericRange } from '@/core/trades/numericRange'
import { isPreset, refreshDatePreset } from '@/core/trades/datePreset'
import { NUMERIC_COLUMN_IDS } from '@/lib/prefs/columns'

/** Bump when the STORED SHAPE changes in a way an older build would misread.
 *  A stamp higher than this is discarded whole — a half-read filter silently
 *  showing the wrong rows is worse than no filter at all. */
export const TRADES_FILTER_PREFS_VERSION = 1

const KEY_PREFIX = 'fuga.trades.filters'

/** One key per scope. 'all' is its own bucket, not a special case of an id. */
export function filterPrefsKey(scope: AccountScope): string {
  return scope === 'all' ? `${KEY_PREFIX}.all` : `${KEY_PREFIX}.acct:${scope.accountId}`
}

// columns.ts' helper, same shape: a module that reads storage at import time in
// a non-browser context must degrade rather than throw.
function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d)
const bool = (v: unknown): boolean => v === true
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d

/** THE NORMAL FORM FOR "UNSET". NumericRange spells it three ways — the key
 *  absent, the bound null, the bound undefined — and a round trip through JSON
 *  turns undefined into absent anyway. One spelling on write: a range with no
 *  live bound is DROPPED, and a bound that is not a finite number is null. */
function normaliseRanges(input: unknown): Record<string, NumericRange> {
  if (!isObj(input)) return {}
  const known = new Set<string>(NUMERIC_COLUMN_IDS)
  const out: Record<string, NumericRange> = {}
  for (const [id, r] of Object.entries(input)) {
    // A range on a column the table no longer has would narrow the list from a
    // control that cannot be shown, let alone cleared.
    if (!known.has(id)) continue
    if (!isObj(r)) continue
    const min = typeof r.min === 'number' && Number.isFinite(r.min) ? r.min : null
    const max = typeof r.max === 'number' && Number.isFinite(r.max) ? r.max : null
    const range: NumericRange = { min, max }
    if (isRangeActive(range)) out[id] = range
  }
  return out
}

/** Rebuilt FIELD BY FIELD rather than spread, so every absent value lands on a
 *  stated default and nothing unrecognised rides along into the app. */
function coerce(raw: unknown): TradesFilterState {
  const base = emptyFilters()
  if (!isObj(raw)) return base
  const nums = (v: unknown): (number | null)[] =>
    Array.isArray(v) ? v.filter((x) => x === null || typeof x === 'number') : []
  const strs = (v: unknown): (string | null)[] =>
    Array.isArray(v) ? v.filter((x) => x === null || typeof x === 'string') : []
  const keys = (v: unknown): { axis: MistakeAxis; name: string }[] =>
    Array.isArray(v)
      ? v.flatMap((x) =>
          isObj(x) && typeof x.name === 'string' && (x.axis === 'technical' || x.axis === 'psychological')
            ? [{ axis: x.axis, name: x.name }]
            : [],
        )
      : []
  return {
    symbol: str(raw.symbol),
    side: oneOf(raw.side, ['all', 'long', 'short'] as const, 'all'),
    duration: oneOf(
      raw.duration,
      ['all', 'under1m', '1to5m', '5to30m', 'over30m'] as const,
      'all',
    ),
    dateFrom: str(raw.dateFrom),
    dateTo: str(raw.dateTo),
    datePreset: isPreset(raw.datePreset) ? raw.datePreset : null,
    outcome: oneOf(raw.outcome, ['all', 'winners', 'losers'] as const, 'all'),
    aPlus: bool(raw.aPlus),
    mistakesOnly: bool(raw.mistakesOnly),
    playbookIds: nums(raw.playbookIds),
    mistakeKeys: keys(raw.mistakeKeys),
    catalystTypes: strs(raw.catalystTypes),
    // v0.2.7 region/country — ADDITIVE, same version stamp, same reasoning as
    // datePreset: an older blob simply lacks the keys and lands on [] here,
    // keeping its dates and symbol. A version bump would discard it whole.
    regions: strs(raw.regions),
    countries: strs(raw.countries),
    sectors: strs(raw.sectors),
    industries: strs(raw.industries),
    // v0.2.7 five-pillar ask — additive at the same stamp, like the fields
    // above. Only the ASK is stored (minScore 0..5 integer, bucket) — never a
    // threshold; those live in settings and the ask re-resolves against them.
    dna: (() => {
      const d = isObj(raw.dna) ? raw.dna : {}
      const m = d.minScore
      return {
        minScore:
          typeof m === 'number' && Number.isInteger(m) && m >= 0 && m <= 5 ? m : null,
        bucket: oneOf(d.bucket, ['any', 'complete', 'incomplete'] as const, 'any'),
      }
    })(),
    ranges: normaliseRanges(raw.ranges),
  }
}

/** The stored filters for a scope, or the empty filter. NEVER undefined, never
 *  a throw: a bad blob shows an unfiltered table, which is a state the user can
 *  read and act on, rather than an error screen for a preference. */
export function readTradesFilters(
  scope: AccountScope,
  /** Injected so the re-derivation below is a test rather than a wait. */
  now: Date = new Date(),
): TradesFilterState {
  const s = storage()
  if (!s) return emptyFilters()
  let raw: string | null = null
  try {
    raw = s.getItem(filterPrefsKey(scope))
  } catch {
    return emptyFilters()
  }
  if (!raw) return emptyFilters()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isObj(parsed)) return emptyFilters()
    if (parsed.v !== TRADES_FILTER_PREFS_VERSION) return emptyFilters()
    // A stored PRESET is re-derived against today's clock; a hand-picked range
    // has no preset and is returned untouched. Without this the window is as
    // old as the day it was saved.
    return refreshDatePreset(coerce(parsed.state), now)
  } catch {
    return emptyFilters()
  }
}

export function writeTradesFilters(scope: AccountScope, state: TradesFilterState): void {
  const s = storage()
  if (!s) return
  try {
    s.setItem(
      filterPrefsKey(scope),
      // Normalised on the way OUT as well as in, so the bytes settle: writing
      // back what was just read must not produce a different string.
      JSON.stringify({ v: TRADES_FILTER_PREFS_VERSION, state: coerce(state) }),
    )
  } catch {
    // A full or blocked store is not worth an error for a preference.
  }
}

/** Forget one scope's filters. */
export function clearTradesFilters(scope: AccountScope): void {
  const s = storage()
  if (!s) return
  try {
    s.removeItem(filterPrefsKey(scope))
  } catch {
    /* ignore */
  }
}
