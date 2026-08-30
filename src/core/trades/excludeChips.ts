import type { TradeListRow } from '@shared/trades-types'
import type { MistakeAxis } from '@shared/mistakes-types'
import type { TradesFilterState } from './tradesFilter'

// v0.2.7 — WHICH EXCLUSION IS ACTIVE.
//
// The seven exclude arrays have been filterable since they landed and readable
// by nobody: no component referenced one, so with the Edge bubble closed the
// only signals were a count that had shrunk and a dot that said "something".
// The bubble's own chips could not help — they are a useMemo over the DRAFT
// TEXT, and closing the bubble clears that text, so they describe what is being
// typed rather than what is in force.
//
// THIS READS COMMITTED STATE. That is the whole difference, and it is why this
// module takes a TradesFilterState and never a string.
//
// NULLS ARE A BUCKET, NOT AN ABSENCE. Every one of the seven can carry null,
// meaning "the untagged ones", and the app already has names for those buckets.
// They are reused verbatim rather than re-invented, because a second vocabulary
// for the same bucket is how two of them drift:
//   'Unknown'      TradesFilters.tsx:501  (region / country / sector / industry)
//   'No catalyst'  TradesFilters.tsx:969
//   'No playbook'  tradesFilter.ts:46, the type's own definition of the bucket
//
// REMOVAL KEYS ON IDENTITY PER FIELD. Six arrays hold primitives and compare by
// value; excludeMistakeKeys holds OBJECTS and cannot. The house idiom is
// `selected.filter((x) => x !== value)` — inline twice, at TradesFilters.tsx:457
// and :910, both on positive arrays — and copying it here would SILENTLY no-op
// on mistake keys, leaving a chip whose X does nothing. Hence one comparator per
// field rather than one for all eight. The count said SEVEN while the code
// carried EIGHT, macdStates being the member the sentence forgot.

/** The bucket names, quoted from their existing render sites. One vocabulary. */
export const UNKNOWN_BUCKET = 'Unknown'
export const NO_CATALYST_BUCKET = 'No catalyst'
export const NO_PLAYBOOK_BUCKET = 'No playbook'

export type ExcludeField =
  | 'excludePlaybookIds'
  | 'excludeMistakeKeys'
  | 'excludeCatalystTypes'
  | 'excludeRegions'
  | 'excludeCountries'
  | 'excludeSectors'
  | 'excludeIndustries'
  | 'excludeMacdStates'

/** Every exclude field, in the order the panel should read. Exported so a guard
 *  can assert this list against the state's own keys rather than a copy. */
export const EXCLUDE_FIELDS: ExcludeField[] = [
  'excludePlaybookIds',
  'excludeMistakeKeys',
  'excludeCatalystTypes',
  'excludeRegions',
  'excludeCountries',
  'excludeSectors',
  'excludeIndustries',
  // v0.2.7 -- the eighth. PLAIN kind: string values with a null bucket,
  // so neither special case above applies -- no id to look up and no
  // object to unwrap. Its null reads as the house UNKNOWN bucket, the
  // same word region, sector and industry already use.
  'excludeMacdStates',
]

export interface ExcludeChip {
  field: ExcludeField
  /** The EXACT element from the array, handed back to removal unchanged so the
   *  caller never has to reconstruct it. */
  value: unknown
  /** What the user reads. Never an id, never blank, never "null". */
  label: string
  /** Stable across renders; field + index, because two chips in one field can
   *  legitimately share a label (the same mistake name on both axes). */
  key: string
}

type MistakeKey = { axis: MistakeAxis; name: string }

const isMistakeKey = (v: unknown): v is MistakeKey =>
  typeof v === 'object' && v !== null && 'axis' in v && 'name' in v

/** Playbook id -> name, from the ALREADY-LOADED rows. R78's cheapest source: the
 *  list read joins `p.name AS playbook_name` (electron/trades/list.ts:252) and
 *  the panel is handed the unfiltered book, so an excluded playbook's rows are
 *  still present and nothing needs fetching.
 *
 *  KNOWN HOLE, deliberately not papered over: a playbook with zero trades in the
 *  loaded book resolves to no name. That exclusion filters nothing (no row
 *  carries it), and the chip falls back to the facet word rather than exposing a
 *  bare id. */
function playbookNames(rows: readonly TradeListRow[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const r of rows) {
    if (r.playbook_id != null && r.playbook_name) m.set(r.playbook_id, r.playbook_name)
  }
  return m
}

function labelFor(field: ExcludeField, value: unknown, names: Map<number, string>): string {
  if (field === 'excludeMistakeKeys') {
    // The object's NAME, never the object — a template literal on the raw value
    // renders "[object Object]" and would ship as a chip.
    return isMistakeKey(value) ? value.name : String(value)
  }
  if (field === 'excludePlaybookIds') {
    if (value === null) return NO_PLAYBOOK_BUCKET
    const n = typeof value === 'number' ? names.get(value) : undefined
    return n ?? 'Playbook'
  }
  if (value === null) {
    return field === 'excludeCatalystTypes' ? NO_CATALYST_BUCKET : UNKNOWN_BUCKET
  }
  return String(value)
}

/** Every active exclusion as a labelled, removable chip. Empty in, empty out —
 *  the caller renders nothing at all rather than an empty container. */
export function excludeChips(
  filters: TradesFilterState,
  rows: readonly TradeListRow[] = [],
): ExcludeChip[] {
  const names = playbookNames(rows)
  const out: ExcludeChip[] = []
  for (const field of EXCLUDE_FIELDS) {
    const values = filters[field] as unknown[] | undefined
    if (!Array.isArray(values)) continue
    values.forEach((value, i) => {
      out.push({ field, value, label: labelFor(field, value, names), key: `${field}-${i}` })
    })
  }
  return out
}

/** Drop ONE value from ONE exclude array, leaving the other six untouched.
 *
 *  The comparator is chosen PER FIELD. Mistake keys are compared on (axis,name)
 *  because the chip hands back an element that may not be the same OBJECT the
 *  state holds — after a round trip through storage it never is — and reference
 *  equality would no-op without any visible symptom. */
export function removeExcluded(
  filters: TradesFilterState,
  field: ExcludeField,
  value: unknown,
): TradesFilterState {
  const values = filters[field] as unknown[] | undefined
  if (!Array.isArray(values)) return filters

  const keep =
    field === 'excludeMistakeKeys'
      ? (x: unknown) =>
          !(
            isMistakeKey(x) &&
            isMistakeKey(value) &&
            x.axis === value.axis &&
            x.name === value.name
          )
      : // Strict, so a null chip removes the null rather than every falsy entry.
        (x: unknown) => x !== value

  return { ...filters, [field]: values.filter(keep) } as TradesFilterState
}
