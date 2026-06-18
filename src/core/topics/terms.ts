import type { CuratedTerm } from './extract'

// Curated vocabulary for honest, local topic extraction in the Journal.
//
// This list is BALANCED BY DESIGN: it pairs process/discipline strengths with
// the psychology pitfalls, so the journal reflects what a trader did WELL as
// readily as what went wrong — reflect-and-support, never a shame scoreboard.
// The contents, the accepted phrasings, AND the group each term belongs to are a
// VALUES decision (founder-authored), not a technical one.
//
// Matching is pure and local (see ./extract): no AI model, no API, no network.
// Terms are matched case-insensitively at word boundaries; the canonical casing
// here (e.g. FOMO, VWAP) is exactly what renders in the UI. Multi-word concepts
// carry an EXPLICIT list of accepted phrasings (the object form) that all map to
// ONE canonical chip — an honest enumeration, never fuzzy matching. The variant
// lists are tuned to how momentum day traders actually write (Warrior / DTSM
// phrasing + the standard mistake-tag taxonomy).
//
// The three groups below drive the WEEKLY pattern view's balanced split
// (Phase 5): PROCESS = strengths, PITFALL = struggles, STRUCTURE = neutral
// context (market mechanics + behaviours that cut both ways, surfaced without a
// good/bad label). The asymmetry is deliberate: getting "stopped out" is the
// system WORKING (neutral), while "moved my stop" / "oversized" are the actual
// mistakes (pitfall). The flat CURATED_TERMS the per-entry matcher consumes is
// assembled from these groups and is unchanged in shape.

/** Which side of the balanced weekly view a curated term belongs to. */
export type TermGroup = 'process' | 'pitfall' | 'structure'

// PROCESS — constructive strengths: what good execution looks like.
const PROCESS: CuratedTerm[] = [
  { canonical: 'discipline', variants: ['discipline', 'disciplined'] },
  { canonical: 'patience', variants: ['patience', 'patient', 'stayed patient'] },
  {
    canonical: 'followed plan',
    variants: [
      'followed plan',
      'followed the plan',
      'followed my plan',
      'stuck to plan',
      'stuck to the plan',
      'stuck to my plan',
      'followed my rules',
    ],
  },
  {
    canonical: 'cut losses',
    variants: [
      'cut losses',
      'cut my losses',
      'cut the loss',
      'cut losses quickly',
      'cut it',
      'cut quickly',
    ],
  },
  {
    canonical: 'scaled out',
    variants: [
      'scaled out',
      'scaled out of it',
      'scaled out partial',
      'scaled',
      'scaling out',
      'sold into strength',
    ],
  },
  {
    canonical: 'sized correctly',
    variants: ['sized correctly', 'sized right', 'proper size', 'correct size'],
  },
  {
    canonical: 'took profits',
    variants: [
      'took profits',
      'took some profits',
      'took profit',
      'booked profits',
      'took the profit',
      'booked it',
      'locked in profit',
    ],
  },
  {
    canonical: 'honored the stop',
    variants: ['honored the stop', 'respected the stop', 'took the stop', 'honored my stop'],
  },
]

// PITFALL — psychology struggles: named plainly so they can be seen, not to shame.
const PITFALL: CuratedTerm[] = [
  { canonical: 'FOMO', variants: ['FOMO', "fomo'd", 'fear of missing out'] },
  {
    canonical: 'overtrading',
    variants: ['overtrading', 'overtraded', 'over-traded', 'over traded'],
  },
  {
    canonical: 'revenge trade',
    variants: ['revenge trade', 'revenge traded', 'revenge trading'],
  },
  { canonical: 'chased', variants: ['chased', 'chasing', 'chase', 'chasing the move'] },
  'tilt',
  'forced',
  { canonical: 'impulsive', variants: ['impulsive', 'impulse', 'impulsively'] },
  {
    canonical: 'moved my stop',
    variants: ['moved my stop', 'moved the stop', 'moved stop', 'widened my stop', 'widened the stop'],
  },
  {
    canonical: 'oversized',
    variants: ['oversized', 'sized too big', 'too much size', 'oversize'],
  },
  {
    canonical: 'wrong hours',
    variants: [
      'wrong hours',
      'traded too late',
      'lunchtime trade',
      'traded outside my window',
      'traded the chop',
    ],
  },
]

// STRUCTURE — neutral market mechanics, plus behaviours that cut both ways
// (e.g. "hesitation", "stopped out"): surfaced as context, without a good/bad
// label. "stopped out" is the system WORKING, NOT a mistake — it must stay here.
const STRUCTURE: CuratedTerm[] = [
  'VWAP',
  'gap',
  'breakout',
  {
    canonical: 'halt resume',
    variants: ['halt resume', 'halt resumption', 'halt and resume'],
  },
  { canonical: 'hesitation', variants: ['hesitation', 'hesitated', 'hesitant', 'froze'] },
  {
    canonical: 'stopped out',
    variants: ['stopped out', 'got stopped', 'got stopped out', 'stopped out of it'],
  },
  { canonical: 'stop loss', variants: ['stop loss', 'stop-loss'] },
  {
    canonical: 'added',
    variants: ['added', 'added to the position', 'added size', 'added more'],
  },
  {
    canonical: 'circuit breaker',
    variants: ['circuit breaker', 'halted', 'halt'],
  },
  {
    canonical: 'high of day',
    variants: ['high of day', 'HOD', 'new highs', 'new high of day'],
  },
  { canonical: 'scratched', variants: ['scratched', 'scratch', 'scratched it'] },
  { canonical: 'sized up', variants: ['sized up', 'size up'] },
]

// Phase-4 contract: the flat list the per-entry matcher consumes. Assembled from
// the three groups; IDENTICAL in shape to before. ("waited" was intentionally
// dropped in Phase 5 — too ambiguous to carry a label.)
export const CURATED_TERMS: CuratedTerm[] = [...PROCESS, ...PITFALL, ...STRUCTURE]

// canonical → group, DERIVED from the sub-arrays at module load so the map can
// never drift from the lists. Consumed by the Phase-5 weekly aggregation; the
// per-entry Phase-4 chips don't use it.
function canonicalOf(t: CuratedTerm): string {
  return typeof t === 'string' ? t : t.canonical
}
export const TERM_GROUP: Record<string, TermGroup> = Object.fromEntries([
  ...PROCESS.map((t) => [canonicalOf(t), 'process'] as const),
  ...PITFALL.map((t) => [canonicalOf(t), 'pitfall'] as const),
  ...STRUCTURE.map((t) => [canonicalOf(t), 'structure'] as const),
])

// Tickers that are also common English words. Momentum journals here never use a
// $-prefix, so a bare "ANY" / "ALL" / "ON" in prose is far more often the WORD
// than the symbol — chipping it as a ticker erodes trust more than missing the
// rare legit mention. These are EXCLUDED from ticker matching entirely (see the
// filter in ./extract). Founder-editable values surface, like CURATED_TERMS.
export const COMMON_WORD_TICKERS: string[] = [
  'ANY', 'ALL', 'ON', 'IT', 'FOR', 'ARE', 'BIG', 'CAR', 'GO', 'KEY', 'NOW',
  'OUT', 'SO', 'WELL', 'AM', 'PM', 'BY', 'OR', 'AT', 'AN', 'RE', 'US',
]
