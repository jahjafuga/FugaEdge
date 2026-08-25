import { NUMERIC_COLUMN_IDS } from '@/lib/prefs/columns'
import { isRangeActive, type NumericRange } from '@/core/trades/numericRange'

// WHICH range inputs are on screen, and WHO put them there. Not what is typed
// into them — that is filters.ranges, and it is per-account. This is layout, and
// it is GLOBAL, one key, exactly like column visibility.
//
// PROVENANCE IS THE POINT of this module's second version. The first gave Edge
// the right to switch a range on, so a query could never filter invisibly, and
// never said what switches one off. The result was a strip that only ever grew:
// "float under ten million", then Clear, and an empty FLOAT pair sits there for
// good. A tick and an auto-install looked identical once stored, so the code
// could not tell a choice the user made from one a sentence made for them.
//
// ABSENT MEANS UNCHOSEN here. That is the opposite of the column registry, where
// absent means visible — and it is why RangesMenu derives a complete boolean map
// for ToggleMenu at the wrapper instead of handing this one straight through.

/** 'user' — ticked in the menu, permanent until unticked.
 *  'auto' — installed by Edge, the migration, or a scope load; lives exactly as
 *  long as its value does. */
export type RangeProvenance = 'user' | 'auto'

/** Absent means UNCHOSEN. There is no `false`. */
export type RangeChoices = Record<string, RangeProvenance>

export const RANGE_CHOICE_PREFS_KEY = 'fuga.trades.rangeChoices'

/** RESET's target, chosen on COVERAGE: every one of these is present on 521 of
 *  the 528 rows of the real book or better, so switching them on cannot silently
 *  drop rows. The reset target, NOT the initial state — a fresh profile chooses
 *  nothing. Reset is something the user did, so these land as 'user'. */
export const RESET_RANGE_IDS = [
  'float',
  'net_pnl',
  'pnl_gain_pct',
  'shares',
  'hold_time',
  'first_entry',
] as const

/** A fresh profile: nothing chosen at all. */
export function noRangesChosen(): RangeChoices {
  return {}
}

export function resetRangeChoices(): RangeChoices {
  return Object.fromEntries(RESET_RANGE_IDS.map((id) => [id, 'user' as const]))
}

/** The chosen ids in the registry's order, so the strip's left-to-right matches
 *  the chooser's top-to-bottom. */
export function chosenRangeIds(choices: RangeChoices): string[] {
  return (NUMERIC_COLUMN_IDS as readonly string[]).filter((id) => choices[id] != null)
}

// ── the menu seam ────────────────────────────────────────────────────────────
// ToggleMenu speaks booleans and is NOT modified for this. Both directions of
// the conversion live here, next to each other, rather than in the component.

/** What ToggleMenu renders: every id, explicitly on or off. */
export function menuBooleans(choices: RangeChoices): Record<string, boolean> {
  return Object.fromEntries(
    (NUMERIC_COLUMN_IDS as readonly string[]).map((id) => [id, choices[id] != null]),
  )
}

/** What the menu hands back. A newly ticked id is the user's doing; one already
 *  on keeps the provenance it had, so ticking something else can never launder
 *  an 'auto' into a 'user'. */
export function choicesFromMenu(
  prev: RangeChoices,
  booleans: Record<string, boolean>,
): RangeChoices {
  const next: RangeChoices = {}
  for (const id of NUMERIC_COLUMN_IDS as readonly string[]) {
    if (booleans[id] === false) continue
    next[id] = prev[id] ?? 'user'
  }
  return next
}

// ── the one reconcile ────────────────────────────────────────────────────────

export interface Reconciled {
  ranges: Record<string, NumericRange>
  choices: RangeChoices
  rangesChanged: boolean
  choicesChanged: boolean
}

/** THE relationship between the two maps, both directions, in ONE place.
 *
 *  Rules, in this order:
 *    0. An id the caller just UNTICKED is left alone. `held` is what the page
 *       was holding before this change, so an id present there and absent from
 *       `choices` was deliberately switched off — and rule one must not hand it
 *       straight back. Without this the two directions fight: unticking a range
 *       that still holds a value deleted the range and then immediately
 *       re-chose it as 'auto', so the tick did nothing. Every non-menu caller
 *       passes the same map for both, so `unticked` is empty and this rule
 *       costs them nothing.
 *    1. An ACTIVE range with no choice becomes 'auto'. A range arriving from
 *       outside the menu — Edge, the migration, another account's stored
 *       filters — is already filtering, so it must have a control on screen. An
 *       existing choice is never overwritten, which is how a 'user' tick
 *       survives Edge setting the same range.
 *    2. An 'auto' choice whose range is not active EXPIRES. Dormant and absent
 *       are the same state: { min: null, max: null } is not active, so emptying
 *       the boxes retires the row Edge installed. A 'user' choice is untouched
 *       — permanent until unticked.
 *    3. A range whose id has no choice left is DELETED. That is the direction
 *       the chooser beat already owned, and it is the mirror of rule two, which
 *       is exactly why they share a function: apart, they drift, and a range
 *       ends up filtering from a control that is not on screen.
 */
export function reconcileRangeChoices(
  ranges: Readonly<Record<string, NumericRange>> | undefined,
  choices: RangeChoices,
  held: RangeChoices = choices,
): Reconciled {
  const inRanges = ranges ?? {}
  const nextChoices: RangeChoices = { ...choices }
  const unticked = new Set(Object.keys(held).filter((id) => choices[id] == null))

  for (const [id, range] of Object.entries(inRanges)) {
    if (unticked.has(id)) continue
    if (isRangeActive(range) && nextChoices[id] == null) nextChoices[id] = 'auto'
  }
  for (const id of Object.keys(nextChoices)) {
    if (nextChoices[id] === 'auto' && !isRangeActive(inRanges[id])) delete nextChoices[id]
  }
  const nextRanges: Record<string, NumericRange> = {}
  for (const [id, range] of Object.entries(inRanges)) {
    if (nextChoices[id] != null) nextRanges[id] = range
  }

  const choicesChanged =
    Object.keys(nextChoices).length !== Object.keys(choices).length ||
    Object.keys(nextChoices).some((id) => nextChoices[id] !== choices[id])
  const rangesChanged = Object.keys(nextRanges).length !== Object.keys(inRanges).length

  return { ranges: nextRanges, choices: nextChoices, rangesChanged, choicesChanged }
}

/** Do two choice maps say the same thing? Used to decide whether a write is
 *  worth doing — every keystroke in a range box runs the funnel. */
export function choicesEqual(a: RangeChoices, b: RangeChoices): boolean {
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  return ak.every((id) => a[id] === b[id])
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return noRangesChosen()
    const out: RangeChoices = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      // The first version of this key stored booleans. A stored `true` reads as
      // 'user', deliberately: it may have been a tick, and calling it 'auto'
      // would silently retire it on the owner's next Clear. Preserving too much
      // is recoverable by unticking; discarding is not.
      if (v === true) out[id] = 'user'
      else if (v === 'user' || v === 'auto') out[id] = v
    }
    return out
  } catch {
    // A corrupt blob falls back to the default rather than throwing on mount.
    return noRangesChosen()
  }
}

export function writeRangeChoices(choices: RangeChoices): void {
  const s = storage()
  if (!s) return
  s.setItem(RANGE_CHOICE_PREFS_KEY, JSON.stringify(choices))
}
