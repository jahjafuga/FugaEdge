// v0.2.7 — THE QUERY RESOLVER. Text in, TradesFilterState out.
//
// The filter arc built the surface piece by piece: geography, sector and
// industry, the market-data ranges, the five-pillar ask, presets that store
// intent. This module is the mouth: a plain-language phrase resolves against
// the user's OWN vocabulary and composes into one filter state. No model, no
// network, no key — and the seam where a model would sit later is a NAMED
// OUTPUT, not an error path.
//
// THE LAWS (founder-ruled; the battery pins each red-first):
//
//   G1  BOOK-DERIVED ONLY. A token applies only against vocabulary the caller
//       passed in — the loaded book and the def tables. Nothing is invented:
//       "a+" is a playbook-name lookup, and with no playbook by that name it
//       lands in unresolved rather than flipping a flag it merely resembles.
//   G2  UNRESOLVED IS A NAMED RESULT. Gibberish leaves the state untouched
//       and comes back verbatim in `unresolved`. "last 10" — a thing the
//       filter cannot yet express — comes back the same way.
//   G3  AMBIGUITY IS RETURNED, NEVER GUESSED. A prefix that hits two symbols
//       names both candidates. The UI offers; the core never picks. The one
//       stated exception to "never pick" is KIND PRECEDENCE (symbol before
//       region before country before sector...), which is a documented rule
//       applied uniformly, not a per-query coin flip: "china" means the
//       region, everywhere, always.
//   G4  SIGN SEMANTICS. "losers over 100" is magnitude-of-loss: net BELOW
//       minus one hundred. "winners over 100" is net above. A bare money
//       comparison with NO outcome in the query is ambiguous and lands in
//       unresolved — the resolver does not guess a sign.
//   G5  COMPOSITION per the established idiom: array fields ADD (deduped),
//       scalar fields REPLACE and the applied line says what was replaced,
//       and a date preset goes through withDatePreset so beat 35's
//       preset-vs-explicit exclusivity holds here too.
//   G6  UNITS: k / m / b multipliers, the dollar sign optional, and a bare
//       "5x" belongs to RVOL — the only column whose label owns the suffix.
//   G7  Matching is exact, then prefix, then substring — case-insensitive,
//       longest phrase first. The house disavows fuzzy matching, and this
//       module keeps that: no edit distance, no scores that invent hits, no
//       new dependency.
//
// PURE per ARCHITECTURE #1: no electron / fs / sqlite / React / DB imports.
// The vocabulary arrives as data; the clock arrives as an argument. This file
// would run inside a Next.js page unmodified.

import type { MistakeAxis } from '@shared/mistakes-types'
import { emptyFilters, type TradesFilterState } from './tradesFilter'
import { withDatePreset, type DatePreset } from './datePreset'

/** Everything a token may resolve against. All of it book- or def-table-
 *  derived by the CALLER — the resolver holds no vocabulary of its own. */
export interface ResolverVocabulary {
  symbols: string[]
  regions: string[]
  countries: { iso: string; name: string }[]
  sectors: string[]
  industries: string[]
  playbooks: { id: number; name: string; tier: string | null }[]
  catalystTypes: string[]
  mistakes: { axis: MistakeAxis; name: string }[]
}

export interface AmbiguousToken {
  text: string
  candidates: string[]
}

export interface ResolveResult {
  state: TradesFilterState
  /** One human-readable line per consumed token — what it did, and what it
   *  replaced when it replaced something. */
  applied: string[]
  /** The SOURCE text behind each applied line, index-parallel to `applied`.
   *  The bubble's chips remove by source: strip the words, re-resolve. */
  appliedSources: string[]
  /** Contiguous runs of text that matched nothing. THE MODEL SEAM. */
  unresolved: string[]
  /** Tokens that matched more than one candidate in the same kind. */
  ambiguous: AmbiguousToken[]
}

// ── the built-in language ────────────────────────────────────────────────────
// These are not vocabulary: they are the filter state's own enumerations
// (outcome, side, preset, dna bucket, mistakesOnly), spelled the way a trader
// types them. G1 governs vocabulary; the state's own words are always legal.

const OUTCOME_WORDS: Record<string, 'winners' | 'losers'> = {
  winners: 'winners', winner: 'winners', wins: 'winners', won: 'winners', winning: 'winners', green: 'winners',
  losers: 'losers', loser: 'losers', losses: 'losers', lost: 'losers', losing: 'losers', red: 'losers',
}
const SIDE_WORDS: Record<string, 'long' | 'short'> = {
  long: 'long', longs: 'long', short: 'short', shorts: 'short',
}
const PRESET_WORDS: Record<string, DatePreset> = {
  today: 'today', week: 'week', weekly: 'week', month: 'month', monthly: 'month',
}
const DNA_WORDS: Record<string, 'complete' | 'incomplete'> = {
  complete: 'complete', incomplete: 'incomplete',
}
const MISTAKE_FLAG_WORDS = new Set(['mistake', 'mistakes'])

/** Filler that carries no filter meaning. Deliberately small: an unknown word
 *  should land in `unresolved`, not vanish into a stopword list. */
export const STOPWORDS = new Set([
  'show', 'me', 'the', 'a', 'an', 'my', 'i', 'have', 'had', 'has', 'that',
  'with', 'of', 'in', 'on', 'all', 'and', 'for', 'to', 'from', 'by',
  'trade', 'trades', 'company', 'companies', 'stock', 'stocks',
])

/** Words that REFUSE the term beside them. A NEW named set, deliberately not
 *  added to STOPWORDS: filler is discarded silently, and a negator must be
 *  REPORTED. The difference is the whole point — "not china" that quietly
 *  drops both words is the same lie as "not china" that applies China, just
 *  harder to notice.
 *
 *  What a negator does today is REFUSE, not exclude. The ask has no shape for
 *  "everything except China", so the honest answer is to apply nothing and say
 *  which words were not acted on. Real exclusion needs the ask to grow. */
export const NEGATORS = new Set(['not', 'no', 'without', 'excluding', 'except'])

/** The substring tier's floor. FOUR, raised from three: at three "are" reached
 *  sector Healthcare and "but" offered a choice between two industries, both
 *  from ordinary English in the middle of a sentence. Four keeps "pullback"
 *  reaching a multi-word playbook, which is what the tier is for. The PREFIX
 *  floor stays at two and the exact tier has no floor at all. */
const SUBSTRING_FLOOR = 4

/** Demonym → the name it means. A NORMALISATION step, not vocabulary: the
 *  result must still hit the caller's vocab or the token stays unresolved —
 *  "brazilian" maps to "brazil" and dies there on a book with no Brazil. */
const DEMONYMS: Record<string, string> = {
  chinese: 'china', american: 'usa', israeli: 'israel', japanese: 'japan',
  korean: 'korea', taiwanese: 'taiwan', canadian: 'canada',
  australian: 'australia', british: 'uk', german: 'germany', indian: 'india',
  brazilian: 'brazil',
}

/** Column phrases → numeric column ids. Derived from the column labels plus a
 *  handful of spoken aliases; every id here exists in NUMERIC_COLUMN_IDS and
 *  rangeValueOf. Two-word phrases are matched before one-word ones. */
const COLUMN_PHRASES: [string, string][] = [
  ['market cap', 'market_cap'], ['mkt cap', 'market_cap'],
  ['relative volume', 'rvol'], ['hold time', 'hold_time'],
  ['day change', 'daily_change_pct'], ['r multiple', 'r_multiple'],
  ['float', 'float'], ['rvol', 'rvol'], ['cap', 'market_cap'],
  ['net', 'net_pnl'], ['pnl', 'net_pnl'], ['profit', 'net_pnl'],
  ['fees', 'fees'], ['shares', 'shares'], ['mae', 'mae'], ['mfe', 'mfe'],
  ['confidence', 'confidence'], ['risk', 'total_risk'], ['gain', 'pnl_gain_pct'],
  ['fills', 'exec_count'], ['stop', 'stop_price'], ['vwap', 'vwap_dist_pct'],
  ['hold', 'hold_time'],
]

const MIN_OPS = new Set(['over', 'above', '>', '>=', 'least'])
const MAX_OPS = new Set(['under', 'below', '<', '<=', 'most'])

/** "$1.5m" → 1_500_000; "5x" → {n: 5, unit: 'x'}. Null when it is not a
 *  number at all. */
function parseValue(raw: string): { n: number; unit: string | null } | null {
  const m = /^\$?(\d+(?:\.\d+)?)(k|m|b|x|%)?$/i.exec(raw)
  if (!m) return null
  let n = Number(m[1])
  const unit = m[2]?.toLowerCase() ?? null
  if (unit === 'k') n *= 1_000
  else if (unit === 'm') n *= 1_000_000
  else if (unit === 'b') n *= 1_000_000_000
  return { n, unit }
}

interface Comparison {
  colId: string | null // null = bare money, sign decided by the outcome (G4)
  bound: 'min' | 'max'
  value: number
  text: string
}

type TokenState = 'free' | 'consumed' | 'stop'

/** One vocabulary candidate. `key` is the lowercased match text. */
interface PoolEntry {
  kind: number // index into KIND ORDER — lower wins precedence
  key: string
  display: string
  apply: (s: TradesFilterState, log: (line: string) => void) => void
}

const pushUnique = <T>(arr: T[], v: T) => {
  if (!arr.includes(v)) arr.push(v)
}

export function resolveQuery(
  text: string,
  vocab: ResolverVocabulary,
  now: Date,
  base?: TradesFilterState,
): ResolveResult {
  let state: TradesFilterState = {
    ...(base ?? emptyFilters()),
    // arrays and ranges are copied so composition never mutates the caller's
    playbookIds: [...(base?.playbookIds ?? [])],
    mistakeKeys: [...(base?.mistakeKeys ?? [])],
    catalystTypes: [...(base?.catalystTypes ?? [])],
    regions: [...(base?.regions ?? [])],
    countries: [...(base?.countries ?? [])],
    sectors: [...(base?.sectors ?? [])],
    industries: [...(base?.industries ?? [])],
    dna: { ...(base?.dna ?? emptyFilters().dna) },
    ranges: Object.fromEntries(
      Object.entries(base?.ranges ?? {}).map(([k, v]) => [k, { ...v }]),
    ),
  }
  const applied: string[] = []
  const appliedSources: string[] = []
  const unresolved: string[] = []
  const log = (line: string, source: string) => {
    applied.push(line)
    appliedSources.push(source)
  }
  const ambiguous: AmbiguousToken[] = []

  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\w$]+|[.,;:!?]+$/g, ''))
    .filter((t) => t.length > 0)
  const marks: TokenState[] = tokens.map(() => 'free')

  // ── the negation mask ─────────────────────────────────────────────────────
  // ONE place for the scope rule; every pass below simply respects it.
  //
  // THE SCOPE RULE, chosen by MEASUREMENT: across every phrasing on record the
  // negator is separated from the term it governs by ZERO stopwords ("not
  // china", "no china", "without mistakes", "excluding losers") or by exactly
  // ONE ("not FROM hong kong", three phrasings). So a negator governs the next
  // token span that is not a stopword, skipping stopwords on the way.
  //
  // What that produces is REFUSAL, not exclusion: the negator and the span it
  // governs are left FREE and unclaimed, so they fall into `unresolved` and
  // come back named. The ask has no shape for "everything except China", and
  // inventing one silently would be the same lie in a quieter place.
  const vocabKeys: string[] = [
    ...vocab.symbols,
    ...vocab.regions,
    ...vocab.countries.flatMap((c) => [c.iso, c.name]),
    ...vocab.sectors,
    ...vocab.industries,
    ...vocab.playbooks.map((p) => p.name),
    ...vocab.catalystTypes,
    ...vocab.mistakes.map((m) => m.name),
  ].map((k) => k.toLowerCase())
  /** Is there a TERM here at all? Answers only THAT — never which one;
   *  resolution still goes through the passes below. Shares SUBSTRING_FLOOR
   *  with candidatesFor so the two cannot disagree about how short is too
   *  short.
   *
   *  Covers the state's OWN words as well as vocabulary: "without mistakes"
   *  and "excluding losers" govern an enumeration, not a book term, and a
   *  negator that refused only book terms would still invert those two. */
  const isStateWord = (w: string): boolean =>
    w in OUTCOME_WORDS ||
    w in SIDE_WORDS ||
    w in PRESET_WORDS ||
    w in DNA_WORDS ||
    MISTAKE_FLAG_WORDS.has(w)
  const anyTermAt = (phrase: string): boolean =>
    isStateWord(phrase) ||
    vocabKeys.some(
      (k) =>
        k === phrase ||
        (phrase.length >= 2 && k.startsWith(phrase)) ||
        (phrase.length >= SUBSTRING_FLOOR && k.includes(phrase)),
    )
  const negated: boolean[] = tokens.map(() => false)
  for (let i = 0; i < tokens.length; i++) {
    if (!NEGATORS.has(tokens[i])) continue
    // EXACT WINS, the same law that lets a real ticker beat the filler list:
    // "no setup" is a playbook NAME, not a refusal of "setup". A whole span
    // equal to a whole vocabulary key is not a negation.
    let isName = false
    for (const span of [3, 2]) {
      if (i + span > tokens.length) continue
      if (vocabKeys.includes(tokens.slice(i, i + span).join(' '))) {
        isName = true
        break
      }
    }
    if (isName) continue
    negated[i] = true
    let j = i + 1
    while (j < tokens.length && STOPWORDS.has(tokens[j])) {
      negated[j] = true
      j++
    }
    // The governed span, LONGEST first so "hong kong" is refused as one term
    // rather than leaving "kong" free to resolve on its own.
    for (const span of [3, 2, 1]) {
      if (j + span > tokens.length) continue
      if (!anyTermAt(tokens.slice(j, j + span).join(' '))) continue
      for (let k = j; k < j + span; k++) negated[k] = true
      break
    }
  }

  // ── pass 1: comparisons ────────────────────────────────────────────────────
  // (column?)(op)(value). Found first so "over" cannot fall into a stopword
  // and "10m" cannot be mistaken for vocabulary.
  const comparisons: Comparison[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (negated[i]) continue
    let op = tokens[i]
    let opLen = 1
    if (op === 'at' && i + 1 < tokens.length && (tokens[i + 1] === 'least' || tokens[i + 1] === 'most')) {
      op = tokens[i + 1]
      opLen = 2
    }
    if (!MIN_OPS.has(op) && !MAX_OPS.has(op)) continue
    const valueIdx = i + opLen
    const value = valueIdx < tokens.length ? parseValue(tokens[valueIdx]) : null
    if (!value) continue

    // the column phrase sits just before the operator: two words, then one
    let colId: string | null = null
    let colStart = i
    for (const span of [2, 1]) {
      if (i - span < 0) continue
      const phrase = tokens.slice(i - span, i).join(' ')
      const hit = COLUMN_PHRASES.find(([p]) => p === phrase)
      if (hit) {
        colId = hit[1]
        colStart = i - span
        break
      }
    }
    // a bare "5x" is RVOL's — the only label that owns the suffix (G6)
    if (!colId && value.unit === 'x') colId = 'rvol'

    const bound: 'min' | 'max' = MIN_OPS.has(op) ? 'min' : 'max'
    comparisons.push({
      colId,
      bound,
      value: value.n,
      text: tokens.slice(colStart, valueIdx + 1).join(' '),
    })
    for (let k = colStart; k <= valueIdx; k++) marks[k] = 'consumed'
  }

  // ── pass 2: the state's own words ─────────────────────────────────────────
  const replaceNote = (label: string, next: string, prev: string | null, source: string) =>
    log(prev && prev !== next ? `${label} ${next} (replaced ${prev})` : `${label} ${next}`, source)

  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] !== 'free' || negated[i]) continue
    const t = tokens[i]
    if (OUTCOME_WORDS[t]) {
      replaceNote('outcome', OUTCOME_WORDS[t], state.outcome !== 'all' ? state.outcome : null, t)
      state = { ...state, outcome: OUTCOME_WORDS[t] }
      marks[i] = 'consumed'
    } else if (SIDE_WORDS[t]) {
      replaceNote('side', SIDE_WORDS[t], state.side !== 'all' ? state.side : null, t)
      state = { ...state, side: SIDE_WORDS[t] }
      marks[i] = 'consumed'
    } else if (PRESET_WORDS[t]) {
      // beat 35's exclusivity: the preset derives the window and retires any
      // explicit dates — through the same function the chips use.
      replaceNote('date', PRESET_WORDS[t], state.datePreset, t)
      state = withDatePreset(state, PRESET_WORDS[t], now)
      marks[i] = 'consumed'
    } else if (DNA_WORDS[t]) {
      replaceNote('dna', DNA_WORDS[t], state.dna.bucket !== 'any' ? state.dna.bucket : null, t)
      state = { ...state, dna: { ...state.dna, bucket: DNA_WORDS[t] } }
      marks[i] = 'consumed'
    } else if (MISTAKE_FLAG_WORDS.has(t)) {
      log('mistakes only', t)
      state = { ...state, mistakesOnly: true }
      marks[i] = 'consumed'
    }
  }

  // ── pass 3: vocabulary, longest phrase first (G1, G3, G7) ─────────────────
  // KIND ORDER is the stated precedence of G3's exception: a text that means
  // two DIFFERENT kinds of thing resolves to the earlier kind, uniformly.
  const pool: PoolEntry[] = []
  const addArrayEntry = (
    kind: number,
    key: string,
    display: string,
    field: 'regions' | 'countries' | 'sectors' | 'industries' | 'catalystTypes',
    value: string,
    label: string,
  ) =>
    pool.push({
      kind, key, display,
      apply: (s, log) => {
        pushUnique(s[field], value)
        log(`${label} ${display}`)
      },
    })

  for (const sym of vocab.symbols)
    pool.push({
      kind: 0, key: sym.toLowerCase(), display: sym,
      apply: (s, log) => {
        replaceNoteInto(log, 'symbol', sym, s.symbol || null)
        s.symbol = sym
      },
    })
  for (const rg of vocab.regions) addArrayEntry(1, rg.toLowerCase(), rg, 'regions', rg, 'region')
  for (const c of vocab.countries) {
    addArrayEntry(2, c.name.toLowerCase(), c.name, 'countries', c.iso, 'country')
    // the bare ISO is exact-only in practice: two letters never wins a prefix
    addArrayEntry(2, c.iso.toLowerCase(), c.name, 'countries', c.iso, 'country')
  }
  for (const sc of vocab.sectors) addArrayEntry(3, sc.toLowerCase(), sc, 'sectors', sc, 'sector')
  for (const ind of vocab.industries) addArrayEntry(4, ind.toLowerCase(), ind, 'industries', ind, 'industry')
  for (const pb of vocab.playbooks)
    pool.push({
      kind: 5, key: pb.name.toLowerCase(), display: pb.name,
      apply: (s, log) => {
        if (!s.playbookIds.includes(pb.id)) s.playbookIds.push(pb.id)
        log(`playbook ${pb.name}`)
      },
    })
  for (const ct of vocab.catalystTypes) addArrayEntry(6, ct.toLowerCase(), ct, 'catalystTypes', ct, 'catalyst')
  for (const mk of vocab.mistakes)
    pool.push({
      kind: 7, key: mk.name.toLowerCase(), display: mk.name,
      apply: (s, log) => {
        if (!s.mistakeKeys.some((k) => k.axis === mk.axis && k.name === mk.name))
          s.mistakeKeys.push({ axis: mk.axis, name: mk.name })
        log(`mistake ${mk.name}`)
      },
    })

  function replaceNoteInto(log: (line: string) => void, label: string, next: string, prev: string | null) {
    log(prev && prev !== next ? `${label} ${next} (replaced ${prev})` : `${label} ${next}`)
  }

  /** Winning candidates for one normalized phrase: exact, then prefix, then
   *  substring; within a tier the earliest KIND with any hit takes it.
   *
   *  FILLER IS NOT VOCABULARY. A phrase made entirely of stopwords may match
   *  on the EXACT tier and nowhere else. The list used to be consulted after
   *  this function had already run, and only when it found nothing — so "of",
   *  which is on the list, never reached its own declaration and applied
   *  CATALYST OFFERING / DILUTION by two-character prefix. Four of the
   *  twenty-seven declared stopwords behaved that way; three more went
   *  ambiguous.
   *
   *  EXACT still wins, deliberately: ALL is Allstate and ON is a real ticker.
   *  A whole token equal to a whole vocabulary key is not a resemblance, and
   *  refusing it would be a second bug wearing the first one's clothes. Only
   *  the fuzzy tiers are closed, and their floors are untouched. */
  function candidatesFor(phrase: string): PoolEntry[] {
    const isFiller = phrase.split(' ').every((w) => STOPWORDS.has(w))
    const tiers: ((e: PoolEntry) => boolean)[] = [
      (e) => e.key === phrase,
      (e) => !isFiller && phrase.length >= 2 && e.key.startsWith(phrase),
      (e) => !isFiller && phrase.length >= SUBSTRING_FLOOR && e.key.includes(phrase),
    ]
    for (const match of tiers) {
      const hits = pool.filter(match)
      if (hits.length === 0) continue
      const kind = Math.min(...hits.map((h) => h.kind))
      const inKind = hits.filter((h) => h.kind === kind)
      // one entry can appear under two keys (a country's name and its iso) —
      // collapse to distinct displays before calling anything ambiguous
      const seen = new Set<string>()
      const distinct = inKind.filter((h) => (seen.has(h.display) ? false : (seen.add(h.display), true)))
      return distinct
    }
    return []
  }

  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] !== 'free' || negated[i]) continue
    let matched = false
    for (const span of [3, 2, 1]) {
      // a span that overruns the text just means TRY THE SHORTER ONE — a
      // one-word query must still reach span 1.
      if (i + span > tokens.length) continue
      const slice = tokens.slice(i, i + span)
      if (slice.some((_, k) => marks[i + k] !== 'free' || negated[i + k])) continue
      const raw = slice.join(' ')
      const phrase = DEMONYMS[raw] ?? raw
      const hits = candidatesFor(phrase)
      if (hits.length === 1) {
        hits[0].apply(state, (line) => log(line, raw))
        for (let k = 0; k < span; k++) marks[i + k] = 'consumed'
        matched = true
        break
      }
      if (hits.length > 1) {
        ambiguous.push({ text: raw, candidates: hits.map((h) => h.display) })
        for (let k = 0; k < span; k++) marks[i + k] = 'consumed'
        matched = true
        break
      }
    }
    if (matched) continue
    if (STOPWORDS.has(tokens[i])) marks[i] = 'stop'
  }

  // ── pass 4: apply the comparisons (the outcome is known now — G4) ─────────
  for (const c of comparisons) {
    let colId = c.colId
    let bound = c.bound
    let value = c.value
    if (colId === null) {
      // bare money: meaningful only under an outcome. "losers over 100" is
      // magnitude-of-loss — net below minus the number.
      if (state.outcome === 'losers') {
        colId = 'net_pnl'
        bound = bound === 'min' ? 'max' : 'min'
        value = -value
      } else if (state.outcome === 'winners') {
        colId = 'net_pnl'
      } else {
        unresolved.push(c.text) // no outcome, no sign — never guessed
        continue
      }
    }
    const prev = state.ranges[colId] ?? { min: null, max: null }
    state = {
      ...state,
      ranges: { ...state.ranges, [colId]: { ...prev, [bound]: value } },
    }
    log(`${colId} ${bound} ${value}`, c.text)
  }

  // ── unresolved runs: contiguous free tokens, stopwords dropped ────────────
  let run: string[] = []
  const flush = () => {
    if (run.length > 0) unresolved.push(run.join(' '))
    run = []
  }
  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] === 'free') run.push(tokens[i])
    else flush()
  }
  flush()

  return { state, applied, appliedSources, unresolved, ambiguous }
}
