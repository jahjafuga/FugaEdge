import type { CuratedTerm } from './extract'

// Curated vocabulary for honest, local topic extraction in the Journal.
//
// This list is BALANCED BY DESIGN: it pairs process/discipline and structural
// terms with the psychology pitfalls, so the journal reflects what a trader did
// WELL as readily as what went wrong — reflect-and-support, never a shame
// scoreboard. The exact contents (and the accepted phrasings below) are a VALUES
// decision (founder-authored), not a technical one: changing them changes what
// the journal chooses to notice about a session.
//
// Matching is pure and local (see ./extract): no AI model, no API, no network.
// Terms are matched case-insensitively at word boundaries, so the canonical
// casing here (e.g. FOMO, VWAP) is exactly what renders in the UI.
//
// Multi-word concepts carry an EXPLICIT list of accepted phrasings (the object
// form) that all map to ONE canonical chip. This exists because the constructive
// terms are disproportionately phrases ("followed the plan") while the mistake
// terms are single words ("FOMO") — strict adjacent-phrase matching would
// lopsidedly catch mistakes and miss good behaviour, defeating the balance. The
// variants are an explicit enumeration, never fuzzy matching: a phrasing not
// listed simply doesn't match (an honest under-match, never a surprise).

export const CURATED_TERMS: CuratedTerm[] = [
  // Process / discipline — the constructive half: what good execution looks like.
  'discipline',
  'patience',
  'waited',
  {
    canonical: 'followed plan',
    variants: [
      'followed plan',
      'followed the plan',
      'followed my plan',
      'stuck to plan',
      'stuck to the plan',
      'stuck to my plan',
    ],
  },
  {
    canonical: 'cut losses',
    variants: ['cut losses', 'cut my losses', 'cut the loss', 'cut losses quickly'],
  },
  {
    canonical: 'scaled out',
    variants: ['scaled out', 'scaled out of it', 'scaled out partial'],
  },
  {
    canonical: 'sized correctly',
    variants: ['sized correctly', 'sized right', 'proper size', 'correct size'],
  },
  {
    canonical: 'took profits',
    variants: ['took profits', 'took some profits', 'took profit', 'booked profits'],
  },
  // Psychology — the pitfalls, named plainly so they can be seen, not to shame.
  'FOMO',
  'overtrading',
  {
    canonical: 'revenge trade',
    variants: ['revenge trade', 'revenge traded', 'revenge trading'],
  },
  'hesitation',
  'chased',
  'tilt',
  'forced',
  'impulsive',
  // Structure — neutral market mechanics.
  'VWAP',
  'gap',
  {
    canonical: 'halt resume',
    variants: ['halt resume', 'halt resumption', 'halt and resume'],
  },
  'breakout',
]
