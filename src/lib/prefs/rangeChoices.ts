import { NUMERIC_COLUMN_IDS } from '@/lib/prefs/columns'
import { isRangeActive, type NumericRange } from '@/core/trades/numericRange'

// WHICH range inputs are on screen. Not what is typed into them — that is
// filters.ranges, and it is per-account. This is layout, and it is GLOBAL, one
// key, exactly like column visibility.
//
// ABSENT MEANS CHOSEN-OFF HERE, which is the opposite of the column registry
// and the reason this module returns a COMPLETE map rather than a sparse one.
// ToggleMenu reads an absent id as ON (its `value[id] !== false` rule), so an
// empty object handed to the chooser would render all twenty-four ticked —
// the exact inverse of the default. Every id carries an explicit boolean.

export type RangeChoices = Record<string, boolean>

export const RANGE_CHOICE_PREFS_KEY = 'fuga.trades.rangeChoices'

/** RESET's target, chosen on COVERAGE: every one of these is present on 521 of
 *  the 528 rows of the real book or better, so switching them on cannot
 *  silently drop rows the way a sparse column would. This is the reset target,
 *  NOT the initial state — a fresh profile chooses nothing. */
export const RESET_RANGE_IDS = [
  'float',
  'net_pnl',
  'pnl_gain_pct',
  'shares',
  'hold_time',
  'first_entry',
] as const

function mapOf(chosen: readonly string[]): RangeChoices {
  const set = new Set(chosen)
  return Object.fromEntries(NUMERIC_COLUMN_IDS.map((id) => [id, set.has(id)]))
}

/** A fresh profile: every id present, every one false. */
export function noRangesChosen(): RangeChoices {
  return mapOf([])
}

/** RESET's map. PURE — the caller persists, the same way the caller owns the key. */
export function resetRangeChoices(): RangeChoices {
  return mapOf(RESET_RANGE_IDS)
}

/** The chosen ids, in the registry's order rather than insertion or alphabetical
 *  order, so the strip's left-to-right matches the chooser's top-to-bottom. */
export function chosenRangeIds(choices: RangeChoices): string[] {
  return (NUMERIC_COLUMN_IDS as readonly string[]).filter((id) => choices[id] === true)
}

// A filter state can arrive carrying ranges the chooser never switched on: a
// blob stored before this build existed (the migration), another account's
// filters loading on a scope change, or Edge committing one in words. In every
// one of those the range is ALREADY FILTERING, so leaving it unchosen would put
// a live filter on screen with no control to clear it — the precise trap R1
// exists to prevent, arriving by a different door.
//
// This does not fight the unchoose. Unchoosing DELETES the key from
// filters.ranges, so on the next load there is nothing left here to re-choose;
// the one-time-ness of the fold falls out of the deletion rather than needing a
// flag to remember it happened.
export function chooseActiveRanges(
  choices: RangeChoices,
  ranges: Readonly<Record<string, NumericRange>> | undefined,
): RangeChoices {
  if (!ranges) return choices
  const live = Object.entries(ranges).filter(([, r]) => isRangeActive(r))
  if (live.length === 0) return choices
  const missing = live.filter(([id]) => choices[id] !== true)
  if (missing.length === 0) return choices
  const next = { ...choices }
  for (const [id] of missing) next[id] = true
  return next
}

/** Drop every range whose id is no longer chosen. The ONE place a range dies of
 *  being unchosen — hiding it instead would leave it filtering unseen. */
export function pruneUnchosenRanges(
  ranges: Readonly<Record<string, NumericRange>> | undefined,
  choices: RangeChoices,
): Record<string, NumericRange> | null {
  if (!ranges) return null
  const doomed = Object.keys(ranges).filter((id) => choices[id] !== true)
  if (doomed.length === 0) return null
  const next = { ...ranges }
  for (const id of doomed) delete next[id]
  return next
}

// columns.ts' helper, same shape: a module that reads storage in a non-browser
// context must degrade rather than throw.
function storage(): Storage | null {
  if (typeof window !== 'undefined') return window.localStorage
  const g = globalThis as { localStorage?: Storage }
  return g.localStorage ?? null
}

export function readRangeChoices(): RangeChoices {
  const s = storage()
  if (!s) return noRangesChosen()
  const raw = s.getItem(RANGE_CHOICE_PREFS_KEY)
  if (!raw) return noRangesChosen()
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      // Merged onto a complete map so an id added to the registry later reads
      // as unchosen rather than undefined, which ToggleMenu would show ticked.
      return { ...noRangesChosen(), ...parsed }
    }
  } catch {
    // A corrupt blob falls back to the default rather than throwing on mount.
  }
  return noRangesChosen()
}

export function writeRangeChoices(choices: RangeChoices): void {
  const s = storage()
  if (!s) return
  s.setItem(RANGE_CHOICE_PREFS_KEY, JSON.stringify(choices))
}
