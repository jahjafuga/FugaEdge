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
  // THREE words first -- the longest phrase wins, and the lookup below tries
  // spans in descending order so a shorter phrase can never swallow a longer
  // one. "risk per share" must beat "risk"; "days since catalyst" must beat
  // "catalyst". That theft is the defect class this campaign exists to kill.
  ['risk per share', 'risk_per_share'], ['days since catalyst', 'days_since_catalyst'],
  // TWO words
  ['market cap', 'market_cap'], ['mkt cap', 'market_cap'],
  ['relative volume', 'rvol'], ['hold time', 'hold_time'],
  ['day change', 'daily_change_pct'], ['r multiple', 'r_multiple'],
  ['entry price', 'avg_buy'], ['buy price', 'avg_buy'],
  ['exit price', 'avg_sell'], ['sell price', 'avg_sell'], ['sold at', 'avg_sell'],
  ['price move', 'price_move_pct'], ['price moved', 'price_move_pct'],
  ['first entry', 'first_entry'], ['catalyst age', 'days_since_catalyst'],
  ['ema distance', 'ema9_dist_pct'], ['ema9 distance', 'ema9_dist_pct'],
  // ONE word. A BARE price is the ENTRY price -- the price you paid is the one
  // a trader means when they do not say which. Exit is reachable by naming it.
  ['price', 'avg_buy'], ['prices', 'avg_buy'], ['cost', 'avg_buy'],
  ['paid', 'avg_buy'], ['entry', 'avg_buy'], ['buy', 'avg_buy'],
  ['bought', 'avg_buy'],
  ['exit', 'avg_sell'], ['sell', 'avg_sell'], ['sold', 'avg_sell'],
  ['money', 'net_pnl'],
  ['ema9', 'ema9_dist_pct'],
  ['float', 'float'], ['rvol', 'rvol'], ['cap', 'market_cap'],
  ['net', 'net_pnl'], ['pnl', 'net_pnl'], ['profit', 'net_pnl'],
  ['fees', 'fees'], ['shares', 'shares'], ['mae', 'mae'], ['mfe', 'mfe'],
  ['confidence', 'confidence'], ['risk', 'total_risk'], ['gain', 'pnl_gain_pct'],
  ['fills', 'exec_count'], ['stop', 'stop_price'], ['vwap', 'vwap_dist_pct'],
  ['hold', 'hold_time'],
]

/** Recency words: a limit AND the ordering it implies. "last ten" means by
 *  DATE, descending -- never by whatever the user last clicked, because the
 *  same sentence has to mean the same thing tomorrow. */
const RECENCY_WORDS: Record<string, 'asc' | 'desc'> = {
  last: 'desc', latest: 'desc', newest: 'desc', recent: 'desc',
  earliest: 'asc', oldest: 'asc', first: 'asc',
}

/** Superlatives that name a COUNT but no COLUMN. "top ten" of what? These are
 *  returned as an AMBIGUITY with candidates rather than guessed at, and
 *  NOTHING is applied -- half an ask is not an ask. */
const SUPERLATIVE_WORDS = new Set(['top', 'biggest', 'best', 'worst', 'largest', 'smallest'])
const SUPERLATIVE_CANDIDATES = ['net P&L', 'gain %', 'date']

const MIN_OPS = new Set(['over', 'above', '>', '>=', 'least'])
const MAX_OPS = new Set(['under', 'below', '<', '<=', 'most'])

/** Magnitude words, the spoken form of the glued k / m / b suffixes. Shipped
 *  WITH the window rather than after it: the window makes "float under 1
 *  million" reachable from far more phrasings, and without these that sentence
 *  sets float at most ONE. Widening a lie is worse than leaving it narrow. */
const MAGNITUDE_WORDS: Record<string, number> = {
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
}

/** Spelled numbers, up to the point where a trader would reach for digits.
 *  Composed rather than enumerated: "five hundred thousand" is five, times a
 *  hundred, times a thousand. */
const SPELLED_UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, half: 0.5,
}

/** Words that name the UNIT rather than the amount. They are consumed with the
 *  number so they do not fall through and become unresolved litter, and
 *  "percent" carries the same meaning the glued sign already had. */
const UNIT_WORDS: Record<string, string | null> = {
  dollars: null, dollar: null, bucks: null, buck: null,
  shares: null, share: null,
  percent: '%',
}

/** A thousands-separated integer, and ONLY a correctly grouped one:
 *  1,000,000 yes; 1,5 no; 1,00,000 no. An incorrectly grouped number is
 *  AMBIGUOUS -- a decimal comma in half the world -- and the resolver does not
 *  get to pick. Returning null here sends it to `unresolved`, which is the
 *  honest answer. */
function stripGroupedCommas(raw: string): string | null {
  if (!raw.includes(',')) return raw
  const m = /^(\$?)(\d{1,3}(?:,\d{3})+)$/.exec(raw)
  return m ? m[1] + m[2].replace(/,/g, '') : null
}

/** "$1.5m" → 1_500_000; "5x" → {n: 5, unit: 'x'}. Null when it is not a
 *  number at all. */
function parseValue(raw: string): { n: number; unit: string | null } | null {
  const cleaned = stripGroupedCommas(raw)
  if (cleaned === null) return null
  const m = /^\$?(\d+(?:\.\d+)?)(k|m|b|x|%)?$/i.exec(cleaned)
  if (!m) return null
  let n = Number(m[1])
  const unit = m[2]?.toLowerCase() ?? null
  if (unit === 'k') n *= 1_000
  else if (unit === 'm') n *= 1_000_000
  else if (unit === 'b') n *= 1_000_000_000
  return { n, unit }
}

/** A value beginning at `idx`, in ANY of the forms a trader types, spanning
 *  as many tokens as it needs. ONE parser: the glued suffix, the magnitude
 *  word, the spelled number and the unit word all compose through here, so
 *  "1m", "1 million" and "one million" cannot drift apart.
 *
 *  Reads, in order: a leading amount (digits or spelled words), then any
 *  magnitude multipliers, then an optional unit word. Returns null when there
 *  is no number -- including when there is an AMBIGUOUS one, which is the
 *  point of stripGroupedCommas above. */
function parseValueAt(
  tokens: string[],
  idx: number,
): { n: number; unit: string | null; len: number; magnitude: number | null } | null {
  if (idx >= tokens.length) return null

  let i = idx
  let unit: string | null = null
  let n: number | null = null
  /** The spoken magnitude this value applied, if any. Reported so a SHARED one
   *  can be inherited: "between one and five million" means one million to
   *  five million, not one to five million. */
  let magnitude: number | null = null

  const digits = parseValue(tokens[i])
  if (digits) {
    n = digits.n
    unit = digits.unit
    i++
  } else {
    // The spelled form, composed: units add, "hundred" scales what is held,
    // and a magnitude banks it. "five hundred thousand" is 5 x 100 x 1000.
    let acc = 0
    let cur = 0
    let saw = false
    while (i < tokens.length) {
      const w = tokens[i]
      if (w in SPELLED_UNITS) {
        cur += SPELLED_UNITS[w]
        saw = true
        i++
        continue
      }
      if (w === 'hundred' && saw) {
        cur = (cur === 0 ? 1 : cur) * 100
        i++
        continue
      }
      break
    }
    if (!saw) return null
    n = acc + cur
  }

  // Magnitudes, spoken. A GLUED suffix already carries its own, so "1m
  // million" is not a thing and is refused by the unit check.
  while (i < tokens.length) {
    // "half a million" -- one stopword may sit between the amount and its
    // magnitude, the same one-stopword tolerance the comparator window uses.
    let j = i
    if (STOPWORDS.has(tokens[j]) && j + 1 < tokens.length && tokens[j + 1] in MAGNITUDE_WORDS) j++
    if (!(tokens[j] in MAGNITUDE_WORDS)) break
    if (unit !== null) break
    magnitude = MAGNITUDE_WORDS[tokens[j]]
    n = (n as number) * magnitude
    i = j + 1
  }

  // The unit word, if the trader said one.
  if (i < tokens.length && tokens[i] in UNIT_WORDS) {
    const u = UNIT_WORDS[tokens[i]]
    if (u !== null) unit = u
    i++
  }

  if (n === null || !Number.isFinite(n)) return null
  return { n, unit, len: i - idx, magnitude }
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
  /** v0.2.7 — the EXCLUDE side, present only on the seven array fields. A
   *  negated term routes here instead of being refused. Absent means the term
   *  has no exclude side (a symbol, an outcome, a flag), and a negator on one
   *  of those still REFUSES, exactly as the negation beat left it. */
  excludeApply?: (s: TradesFilterState, log: (line: string) => void) => void
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
  const anyTermAt = (rawPhrase: string): boolean => {
    // NORMALISE FIRST, exactly as the vocabulary pass does. Without this the
    // detector cannot see a demonym: "not chinese" left its term unmarked and
    // the word then resolved as an ordinary INCLUDE -- the opposite of the ask.
    // Never exercised before: every negation on record used a literal key
    // ("not china", "not from hong kong"), so the gap only surfaced when
    // exclusion made the term's fate visible.
    const phrase = DEMONYMS[rawPhrase] ?? rawPhrase
    return (
      isStateWord(phrase) ||
    vocabKeys.some(
      (k) =>
        k === phrase ||
        (phrase.length >= 2 && k.startsWith(phrase)) ||
        (phrase.length >= SUBSTRING_FLOOR && k.includes(phrase)),
      )
    )
  }
  const negated: boolean[] = tokens.map(() => false)
  /** UNCLAIMABLE, which is NOT the same as negated and must not share its
   *  array. The comparator beat marks a column whose operator had no value so
   *  the word cannot fall through and quietly become vocabulary. That is a
   *  REFUSAL. Once a negated token began routing to an EXCLUDE side, sharing
   *  one array turned "float under" into "excluding mistake Float or RVOL" --
   *  caught by that beat's own guard. Two meanings, two arrays. */
  const unclaimable: boolean[] = tokens.map(() => false)
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
    // The NEGATOR ITSELF never resolves. It is a grammar word, not a term:
    // leaving it free let "no china" excludeAPPLY the No Setup playbook off the
    // word "no". Marked stop -- consumed silently, the way filler is, because
    // the exclusion it produced is named in the applied line instead.
    negated[i] = true
    let j = i + 1
    while (j < tokens.length && STOPWORDS.has(tokens[j])) {
      negated[j] = true
      j++
    }
    // The governed span, LONGEST first so "hong kong" is taken as one term
    // rather than leaving "kong" free to resolve on its own.
    let governed = false
    for (const span of [3, 2, 1]) {
      if (j + span > tokens.length) continue
      if (!anyTermAt(tokens.slice(j, j + span).join(' '))) continue
      for (let k = j; k < j + span; k++) negated[k] = true
      governed = true
      break
    }
    if (governed) {
      // The NEGATOR ITSELF never resolves -- it is a grammar word, not a term,
      // and leaving it free let "no china" excludeApply the No Setup playbook
      // off the word "no". Silenced only when it actually governs something:
      // a LONE negator still comes back NAMED, which is the negation beat's
      // law and is still the right answer when there is nothing to exclude.
      for (let k = i; k < j; k++) marks[k] = 'stop'
    }
  }

  // ── pass 0: the limit and the sort ────────────────────────────────────────
  // Before the comparison pass, so "last 10" cannot have its number taken for
  // a bare money comparison. A recency word carries its own ordering; a
  // superlative carries a count with no column and is returned as a choice.
  for (let i = 0; i < tokens.length; i++) {
    if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
    const w = tokens[i]
    const isRecency = w in RECENCY_WORDS
    const isSuper = SUPERLATIVE_WORDS.has(w)
    if (!isRecency && !isSuper) continue
    // EXACT vocabulary wins and the word is handed BACK -- a playbook named
    // "Last" is the trader's own name for a setup.
    if (vocabKeys.includes(w)) continue
    // The count: the next value, across stopwords ("the last 10 trades").
    let k = i + 1
    while (k < tokens.length && STOPWORDS.has(tokens[k])) k++
    const v = k < tokens.length ? parseValueAt(tokens, k) : null
    if (!v || !Number.isInteger(v.n) || v.n <= 0) continue
    if (isSuper) {
      // NO COLUMN NAMED. Offer the choice, apply nothing.
      ambiguous.push({ text: tokens.slice(i, k + v.len).join(' '), candidates: [...SUPERLATIVE_CANDIDATES] })
      for (let q = i; q < k + v.len; q++) marks[q] = 'consumed'
      continue
    }
    state = {
      ...state,
      limit: v.n,
      sort: { colId: 'open_time', dir: RECENCY_WORDS[w] },
    }
    log(
      `showing ${v.n}, ${RECENCY_WORDS[w] === 'desc' ? 'newest' : 'oldest'} first`,
      tokens.slice(i, k + v.len).join(' '),
    )
    for (let q = i; q < k + v.len; q++) marks[q] = 'consumed'
  }

  // ── pass 1: comparisons ────────────────────────────────────────────────────
  // (column?)(op)(value). Found first so "over" cannot fall into a stopword
  // and "10m" cannot be mistaken for vocabulary.
  //
  // THE WINDOW RULE, and it is ONE place -- nothing below re-decides it.
  // MEASURED across every phrasing on record: the column phrase and the
  // operator are separated by ZERO tokens ("float under 1m", "market cap under
  // 500m") or by exactly ONE, and that one is always a stopword ("under A
  // float of 1m", "float OF under 1m"). The column may sit on EITHER side of
  // the operator. So a comparison forms when at most one stopword separates
  // them, in either order, and the value is the first value after both.
  //
  // PRECEDENCE, NOT SIMILARITY: this is about which PASS gets the word. A
  // column phrase claims its word only when an operator AND a value are inside
  // the window; a BARE column phrase is left for the vocabulary pass exactly as
  // before, because a column with no operator and no value is not a filter.
  const comparisons: Comparison[] = []
  /** The column phrase at `at`, longest span first, or null. */
  const columnAt = (at: number): { colId: string; span: number } | null => {
    // Descending span: the LONGEST phrase wins, in ONE place. Three words for
    // "risk per share" and "days since catalyst".
    for (const span of [3, 2, 1]) {
      if (at < 0 || at + span > tokens.length) continue
      const hit = COLUMN_PHRASES.find(([p]) => p === tokens.slice(at, at + span).join(' '))
      if (hit) return { colId: hit[1], span }
    }
    return null
  }
  /** The first value at or after `from`, skipping stopwords; null if none.
   *  Refuses a token the user's own vocabulary claims exactly -- a ticker
   *  named TEN is their ticker, not the number ten. */
  const valueFrom = (
    from: number,
  ): { n: number; unit: string | null; end: number; magnitude: number | null } | null => {
    let k = from
    while (k < tokens.length && STOPWORDS.has(tokens[k])) k++
    if (k >= tokens.length) return null
    if (vocabKeys.includes(tokens[k])) return null
    const v = parseValueAt(tokens, k)
    return v ? { n: v.n, unit: v.unit, end: k + v.len - 1, magnitude: v.magnitude } : null
  }

  // TWO-SIDED RANGES: "float between 1m and 5m", "float 1m to 5m". Both fill
  // min AND max on the EXISTING range field -- the ask gains nothing. A
  // "between" with one operand is left alone here and falls through to
  // unresolved: half a range shipped as if it were whole is the same class of
  // lie as a coerced number.
  for (let i = 0; i < tokens.length; i++) {
    if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
    const col = columnAt(i)
    if (!col) continue
    let after = i + col.span
    if (after < tokens.length && tokens[after] === 'between') after++
    const sawBetween = after > i + col.span
    const lo = valueFrom(after)
    if (!lo) continue
    const hi = valueFrom(lo.end + 1)
    if (!hi) {
      // R5 -- a "between" with ONE operand is UNRESOLVED, never a one-sided
      // filter. The column is left unclaimable too, so the word cannot fall
      // through and quietly become a mistake instead.
      if (sawBetween) for (let k = i; k <= lo.end; k++) unclaimable[k] = true
      continue
    }
    // A SHARED magnitude belongs to both operands: "between one and five
    // million" is one million to five million.
    const loN = lo.magnitude === null && hi.magnitude !== null ? lo.n * hi.magnitude : lo.n
    comparisons.push({ colId: col.colId, bound: 'min', value: loN, text: tokens.slice(i, hi.end + 1).join(' ') })
    comparisons.push({ colId: col.colId, bound: 'max', value: hi.n, text: '' })
    for (let k = i; k <= hi.end; k++) marks[k] = 'consumed'
  }

  for (let i = 0; i < tokens.length; i++) {
    if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
    let op = tokens[i]
    let opLen = 1
    if (op === 'at' && i + 1 < tokens.length && (tokens[i + 1] === 'least' || tokens[i + 1] === 'most')) {
      op = tokens[i + 1]
      opLen = 2
    }
    if (!MIN_OPS.has(op) && !MAX_OPS.has(op)) continue
    const opEnd = i + opLen - 1

    // THE WINDOW: the column, on either side, across at most one stopword.
    let colId: string | null = null
    let colStart = i
    let colEnd = opEnd
    for (const gap of [0, 1]) {
      // BEFORE the operator: the column's LAST token sits `gap` back.
      for (const span of [3, 2, 1]) {
        const at = i - gap - span
        if (at < 0) continue
        if (gap === 1 && !STOPWORDS.has(tokens[i - 1])) continue
        const hit = columnAt(at)
        if (hit && hit.span === span) {
          colId = hit.colId
          colStart = at
          colEnd = Math.max(opEnd, at + span - 1)
          break
        }
      }
      if (colId) break
      // AFTER the operator: the column starts `gap` tokens past the operator.
      const at = opEnd + 1 + gap
      if (gap === 1 && !STOPWORDS.has(tokens[opEnd + 1] ?? '')) continue
      const hit = columnAt(at)
      if (hit) {
        colId = hit.colId
        colStart = Math.min(i, at)
        colEnd = at + hit.span - 1
        break
      }
    }

    // THE VALUE: the first one after BOTH the operator and the column,
    // skipping stopwords on the way.
    let vIdx = Math.max(opEnd, colEnd) + 1
    while (vIdx < tokens.length && STOPWORDS.has(tokens[vIdx])) vIdx++
    // Same refusal as the two-sided path: the user's own name beats a number
    // word, and the token is handed BACK rather than consumed.
    const value = vocabKeys.includes(tokens[vIdx] ?? '') ? null : parseValueAt(tokens, vIdx)

    if (!value) {
      // R5 -- a comparator with NO value is UNRESOLVED, never a filter with a
      // missing or coerced number. When a column was in the window it is left
      // unclaimable too, so the word cannot fall through to the vocabulary
      // pass and quietly become something else.
      if (colId) for (let k = colStart; k <= Math.max(colEnd, opEnd); k++) unclaimable[k] = true
      continue
    }

    // R3 -- an EXACT or LONGER vocabulary match beats a windowed column claim.
    // The user's own name for a thing wins, the same way a real ticker beats
    // the filler list. Checked on the column's own text only.
    if (colId) {
      const colText = tokens.slice(colStart, colStart + (colEnd - colStart + 1)).join(' ')
      const colPhrase = columnAt(colStart)
      const exactText = colPhrase
        ? tokens.slice(colStart, colStart + colPhrase.span).join(' ')
        : colText
      if (vocabKeys.includes(exactText)) {
        // Hand the word BACK to the vocabulary pass: dropping the column id
        // alone would still consume the token below, and the user's own name
        // would vanish instead of winning.
        colId = null
        colStart = i
        colEnd = opEnd
      }
    }

    // a bare "5x" is RVOL's — the only label that owns the suffix (G6)
    if (!colId && value.unit === 'x') colId = 'rvol'

    const bound: 'min' | 'max' = MIN_OPS.has(op) ? 'min' : 'max'
    const lo = Math.min(colStart, i)
    const hi = vIdx + value.len - 1
    comparisons.push({
      colId,
      bound,
      value: value.n,
      text: tokens.slice(lo, hi + 1).join(' '),
    })
    for (let k = lo; k <= hi; k++) marks[k] = 'consumed'
  }

  // ── pass 1b: a BARE count ─────────────────────────────────────────────────
  // "show me the 10 stocks that ..." names a count and no ordering at all.
  // AFTER the comparison pass, deliberately: run earlier this would take the
  // hundred out of "net over 100" and call it a limit.
  //
  // A bare count is NOT the superlative case. "top ten" implies a ranking and
  // refuses to guess which; a plain count implies no ranking, so it takes the
  // date-descending default -- the same order the table already shows, so
  // nothing visibly reorders, and the same order "last ten" means.
  if (state.limit === null) {
    for (let i = 0; i < tokens.length; i++) {
      if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
      const v = parseValueAt(tokens, i)
      if (!v || v.len !== 1 || v.unit !== null) continue
      if (!Number.isInteger(v.n) || v.n <= 0) continue
      if (vocabKeys.includes(tokens[i])) continue
      state = { ...state, limit: v.n, sort: { colId: 'open_time', dir: 'desc' } }
      log(`showing ${v.n}, newest first`, tokens[i])
      marks[i] = 'consumed'
      break
    }
  }

  // ── pass 2: the state's own words ─────────────────────────────────────────
  const replaceNote = (label: string, next: string, prev: string | null, source: string) =>
    log(prev && prev !== next ? `${label} ${next} (replaced ${prev})` : `${label} ${next}`, source)

  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] !== 'free' || negated[i] || unclaimable[i]) continue
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
  ) => {
    const excludeField = (
      {
        regions: 'excludeRegions',
        countries: 'excludeCountries',
        sectors: 'excludeSectors',
        industries: 'excludeIndustries',
        catalystTypes: 'excludeCatalystTypes',
      } as const
    )[field]
    pool.push({
      kind, key, display,
      apply: (s, log) => {
        pushUnique(s[field], value)
        log(`${label} ${display}`)
      },
      excludeApply: (s, log) => {
        pushUnique(s[excludeField], value)
        log(`excluding ${label} ${display}`)
      },
    })
  }

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
      excludeApply: (s, log) => {
        if (!s.excludePlaybookIds.includes(pb.id)) s.excludePlaybookIds.push(pb.id)
        log(`excluding playbook ${pb.name}`)
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
      excludeApply: (s, log) => {
        if (!s.excludeMistakeKeys.some((k) => k.axis === mk.axis && k.name === mk.name))
          s.excludeMistakeKeys.push({ axis: mk.axis, name: mk.name })
        log(`excluding mistake ${mk.name}`)
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
    if (marks[i] !== 'free' || unclaimable[i]) continue
    // v0.2.7 — a NEGATED span is no longer skipped: it resolves the same way an
    // ordinary one does and then routes to the term's EXCLUDE side. The scope
    // rule that decided WHICH tokens are negated is untouched -- this changes
    // only what happens to the term it identified.
    const isNeg = negated[i]
    let matched = false
    for (const span of [3, 2, 1]) {
      // a span that overruns the text just means TRY THE SHORTER ONE — a
      // one-word query must still reach span 1.
      if (i + span > tokens.length) continue
      const slice = tokens.slice(i, i + span)
      // Every token of the span must share the negation state of its first --
      // a phrase half-inside a negation is not a phrase.
      if (slice.some((_, k) => marks[i + k] !== 'free' || negated[i + k] !== isNeg)) continue
      const raw = slice.join(' ')
      const phrase = DEMONYMS[raw] ?? raw
      const hits = candidatesFor(phrase)
      if (hits.length === 1) {
        const entry = hits[0]
        // A term with NO exclude side (a symbol, a flag) keeps the negation
        // beat's behaviour: refused, left unclaimed, reported as unread.
        if (isNeg && !entry.excludeApply) break
        if (isNeg) entry.excludeApply!(state, (line) => log(line, raw))
        else entry.apply(state, (line) => log(line, raw))
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

  // ── pass 3b: contradictions ───────────────────────────────────────────────
  // A term asked for on BOTH sides applies NEITHER, and is NAMED. Letting one
  // side win silently produces either an empty book or an unchanged one, and
  // the reader cannot tell which they are looking at -- the same class of
  // quiet wrongness this campaign has been closing all along.
  {
    /** Display strings whose BOTH sides cancelled -- their applied lines must
     *  go too. Removing the value from the state while leaving "region China,
     *  excluding region China" in the applied line is the same lie one layer
     *  up: the filter is gone and the sentence still claims it ran. Found by
     *  typing the contradiction into a running app; the unit guard asserted
     *  the state and the ambiguity and never looked at the line. */
    const cancelled: string[] = []
    const PAIRS = [
      ['playbookIds', 'excludePlaybookIds'],
      ['catalystTypes', 'excludeCatalystTypes'],
      ['regions', 'excludeRegions'],
      ['countries', 'excludeCountries'],
      ['sectors', 'excludeSectors'],
      ['industries', 'excludeIndustries'],
    ] as const
    for (const [inc, exc] of PAIRS) {
      const both = (state[inc] as (string | number | null)[]).filter((v) =>
        (state[exc] as (string | number | null)[]).includes(v),
      )
      if (both.length === 0) continue
      for (const v of both) {
        ambiguous.push({
          text: String(v),
          candidates: [`include ${String(v)}`, `exclude ${String(v)}`],
        })
        const entry = pool.find((e) => e.key === String(v).toLowerCase() || e.display === String(v))
        cancelled.push(entry ? entry.display : String(v))
      }
      state = {
        ...state,
        [inc]: (state[inc] as (string | number | null)[]).filter((v) => !both.includes(v)),
        [exc]: (state[exc] as (string | number | null)[]).filter((v) => !both.includes(v)),
      }
    }
    // mistakeKeys compares by (axis, name), not by identity.
    const sameKey = (a: { axis: string; name: string }, b: { axis: string; name: string }) =>
      a.axis === b.axis && a.name === b.name
    const clash = state.mistakeKeys.filter((k) =>
      state.excludeMistakeKeys.some((x) => sameKey(k, x)),
    )
    if (clash.length > 0) {
      for (const k of clash) {
        ambiguous.push({ text: k.name, candidates: [`include ${k.name}`, `exclude ${k.name}`] })
        cancelled.push(k.name)
      }
      state = {
        ...state,
        mistakeKeys: state.mistakeKeys.filter((k) => !clash.some((c) => sameKey(k, c))),
        excludeMistakeKeys: state.excludeMistakeKeys.filter((k) => !clash.some((c) => sameKey(k, c))),
      }
    }
    // Strip the applied lines for anything that cancelled, keeping the sources
    // index-parallel so the bubble's chips still line up.
    if (cancelled.length > 0) {
      const keep = applied
        .map((line, idx) => ({ line, src: appliedSources[idx]!, idx }))
        .filter(({ line }) => !cancelled.some((d) => line.includes(d)))
      applied.length = 0
      appliedSources.length = 0
      for (const k of keep) {
        applied.push(k.line)
        appliedSources.push(k.src)
      }
    }
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
