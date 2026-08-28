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
// THE BANDS ARE THE APP'S, IMPORTED RATHER THAN COPIED. Both tables are pure
// (type-only imports of their own) and their edges are locked bucket-for-bucket
// by bucketSchemeParity.test.ts, so there is exactly ONE definition of
// "extended" in the product and it cannot drift into a second one here.
import { EMA_BUCKETS } from '@/core/technicals/emaBuckets'
import { VWAP_BUCKETS } from '@/core/technicals/vwapBuckets'

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
  /** v0.2.7 -- the MACD states, supplied by the page rather than derived
   *  from the book: unlike a ticker or a setup name these are the FACET's
   *  own enumeration. Keyed as TWO WORDS, and that is measured rather than
   *  chosen -- a single entry keyed "macd" loses "macd negative" to the
   *  mistake named "MACD negative at entry", whose name that phrase is a
   *  PREFIX of, because longer spans are tried first. */
  macdStates?: { key: string; display: string; value: string | null }[]
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
  // v0.2.7 -- nine more, every one measured before it was added. Twenty
  // sentences a trader would actually type were driven against a real book and
  // ten came back with a non-empty ignored clause while being understood
  // perfectly; these are the words that filled it. Each was driven ALONE
  // first and applied nothing, so none of them can ever narrow a book by
  // itself, which is the only test for joining this list.
  //
  // "last" was REFUSED entry by that test even though it appeared the same
  // way: "last week" is a real range, and calling it filler would silently
  // accept it as "this week". A word that means something is not filler just
  // because the parser cannot reach it yet.
  'give', 'where', 'what', 'were', 'are', 'find', 'everything', 'this',
  // "money" earns its place for a different reason: "lost money" already
  // resolved to losers off "lost", so the word narrows nothing that is not
  // already narrowed. It remains a COLUMN name -- "money over one hundred"
  // still resolves, because comparisons reach columns by a different path.
  'money',
  // v0.2.7 -- ELEVEN MORE, and the test that admitted them is the point. Two
  // earlier beats refused a word because driving it ALONE showed it matching a
  // mistake name. They drove it BEFORE adding it -- and `isFiller` gates
  // exactly the two tiers those matches came through, so the measurement
  // answered a different question than the one being asked. Add-then-drive
  // reverses both refusals: as filler, none of these reaches anything.
  //
  // SEVEN were landing in the ignored clause and meant nothing at all:
  'but', 'plus', 'also', 'then', 'only', 'just', 'still',
  // FOUR were APPLYING A FILTER NOBODY ASKED FOR, which is why they are worth
  // more than tidier reporting. "before" reached the mistake "Entered too
  // early / before trigger" by substring; "first" reached the playbook "First
  // Pullback to VWAP" by prefix; "want" reached "High-volume pullback (wanted
  // low volume)"; "even" reached "Revenge trade (after a loss)". "first" stays
  // a RECENCY word -- "the first ten trades" still sorts ascending, because
  // that path never consults this list.
  'want', 'even', 'before', 'first',
  //
  // REFUSED, on the same test that kept "last" out: a word that NAMES a
  // dimension or an operation is not filler just because the parser cannot
  // reach it yet. "or", "vs" and "versus" name a disjunction the ask has no
  // shape for, and today the ignored clause is the ONLY sign that half the
  // sentence was dropped. Every time-of-day word -- morning, open, yesterday --
  // names a time. Swallowing any of them converts a REPORTED gap into a silent
  // wrong answer, which is strictly worse than saying so. Each refusal is
  // pinned by a guard.
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
  // v0.2.7 -- the phrasings a trader actually types. "dist" is the column's own
  // abbreviation on the Technicals tab ("VWAP dist", "EMA 9 dist"). The
  // number-bearing forms are reachable HERE and only here: the comparison pass
  // runs BEFORE the bare-count pass, so "9 ema over 5" claims the phrase before
  // the nine can be taken for a limit. Proven with a scratch entry before it
  // was added. A BARE "9 ema" is still read as a count -- that is parser work,
  // not a phrase, and it stays out of this beat.
  ['vwap dist', 'vwap_dist_pct'], ['vwap distance', 'vwap_dist_pct'],
  ['ema9 dist', 'ema9_dist_pct'], ['ema dist', 'ema9_dist_pct'],
  ['9 ema', 'ema9_dist_pct'], ['ema 9', 'ema9_dist_pct'],
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
/** The trader's word for each canonical band, as an INDEX into the imported
 *  tables -- never as a number written down here. Only "extended" merges
 *  upward, and only because the app's own predicate already says it does.
 *
 *  "ABOVE" IS DELIBERATELY ABSENT. It is the one band word whose canonical
 *  definition contradicts its plain meaning: the band "Above VWAP (trending)"
 *  is +2.0% to +5.0%, while a trader saying "above VWAP" means more than zero.
 *  On a real book that is fourteen trades against seventy-eight. Shipping
 *  either number silently would answer a question nobody asked, so the word
 *  stays out until it is ruled on, and a guard keeps the omission deliberate. */
const BAND_WORDS: Record<string, { idx: number; merged: boolean }> = {
  // "below" WAS HERE and has left, quoted rather than deleted:
  //     below: { idx: 0, merged: false },
  // It is a DIRECTION word now, not a band word: "below vwap" means below the
  // level, max zero, the same rule "above" follows. The lowest band keeps its
  // meaning and loses its bare word, and stays reachable as "vwap under -0.5".
  at: { idx: 1, merged: false },
  near: { idx: 2, merged: false },
  extended: { idx: 4, merged: true },
  'very extended': { idx: 5, merged: false },
  'blow off': { idx: 6, merged: false },
  blowoff: { idx: 6, merged: false },
  parabolic: { idx: 6, merged: false },
}

/** Band words that already mean something else in this file. "at" is the tail
 *  of the column phrase "sold at", so it is read as a band ONLY when an
 *  indicator follows it and "sold at 5" resolves exactly as it always has.
 *
 *  "below" used to be in this set too. It is no longer a band word at all --
 *  it is a comparator, and a comparator with no value on a distance column
 *  binds to zero, which is the rule that now owns it. */
const BAND_NEEDS_INDICATOR: ReadonlySet<string> = new Set(['at'])

/** How a trader names the indicator a band belongs to. A bare "9 ema" is read
 *  as a count everywhere else in this file; inside a band phrase it is safe,
 *  because the band word has already claimed the span and the bare-count pass
 *  runs afterwards. */
const BAND_INDICATORS: Record<string, string> = {
  vwap: 'vwap_dist_pct',
  '9 ema': 'ema9_dist_pct',
  'ema 9': 'ema9_dist_pct',
  ema9: 'ema9_dist_pct',
  'nine ema': 'ema9_dist_pct',
  ema: 'ema9_dist_pct',
}

const RECENCY_WORDS: Record<string, 'asc' | 'desc'> = {
  last: 'desc', latest: 'desc', newest: 'desc', recent: 'desc',
  earliest: 'asc', oldest: 'asc', first: 'asc',
}

/** Superlatives that name a COUNT but no COLUMN. "top ten" of what? These are
 *  returned as an AMBIGUITY with candidates rather than guessed at, and
 *  NOTHING is applied -- half an ask is not an ask. */
const SUPERLATIVE_WORDS = new Set(['top', 'biggest', 'best', 'worst', 'largest', 'smallest'])
const SUPERLATIVE_CANDIDATES = ['net P&L', 'gain %', 'date']

/** Columns where an operator with NO VALUE binds to ZERO.
 *
 *  A signed DISTANCE from an indicator is the one place where zero does not
 *  have to be guessed: it IS the indicator -- the price sitting exactly on
 *  VWAP, or exactly on the nine. "Above VWAP" is not a comparison missing its
 *  number; the number is implied by the word and it is the only number the
 *  word can mean.
 *
 *  EVERY OTHER COLUMN REFUSES, and the two reasons are different. Float,
 *  shares, hold time and price are never negative, so "above float" would
 *  match the whole book while looking like a filter. Net P&L, gain per cent
 *  and R multiple ARE signed and their zero IS meaningful -- but they are not
 *  distances, "above zero" there is already spelled by the outcome words, and
 *  the ruling was scoped to distances. */
const ZERO_BOUND_COLUMNS: ReadonlySet<string> = new Set(['vwap_dist_pct', 'ema9_dist_pct'])

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
  // THE SIGN, READ ONCE AND PEELED FIRST. Everything below sees the number
  // without it, so the comma grouping and the glued-suffix regex are untouched
  // and the spoken, glued and comma forms cannot disagree about what a minus
  // means -- there is only one place that decides.
  //
  // READING a minus the user wrote is not INFERRING one they did not. G4's
  // refusal to guess a sign for a bare money comparison is untouched by this,
  // and so is the magnitude-of-loss law that deliberately flips one under an
  // outcome. Both are guarded.
  const negative = raw.startsWith('-')
  const cleaned = stripGroupedCommas(negative ? raw.slice(1) : raw)
  if (cleaned === null) return null
  const m = /^\$?(\d+(?:\.\d+)?)(k|m|b|x|%)?$/i.exec(cleaned)
  if (!m) return null
  let n = Number(m[1])
  const unit = m[2]?.toLowerCase() ?? null
  if (unit === 'k') n *= 1_000
  else if (unit === 'm') n *= 1_000_000
  else if (unit === 'b') n *= 1_000_000_000
  return { n: negative ? -n : n, unit }
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
    // arrays and ranges are copied so composition never mutates the caller's.
    // BOTH SIDES. The exclude half was missed when exclusions landed, so
    // pushUnique wrote straight through into the caller's array -- and the one
    // caller is the bubble, resolving on every keystroke against a ref that IS
    // the committed state. Typing accumulated exclusions the user never
    // committed, and the discard path had nothing to undo them with.
    playbookIds: [...(base?.playbookIds ?? [])],
    mistakeKeys: [...(base?.mistakeKeys ?? [])],
    catalystTypes: [...(base?.catalystTypes ?? [])],
    regions: [...(base?.regions ?? [])],
    countries: [...(base?.countries ?? [])],
    sectors: [...(base?.sectors ?? [])],
    industries: [...(base?.industries ?? [])],
    excludePlaybookIds: [...(base?.excludePlaybookIds ?? [])],
    excludeMistakeKeys: [...(base?.excludeMistakeKeys ?? [])],
    excludeCatalystTypes: [...(base?.excludeCatalystTypes ?? [])],
    excludeRegions: [...(base?.excludeRegions ?? [])],
    excludeCountries: [...(base?.excludeCountries ?? [])],
    excludeSectors: [...(base?.excludeSectors ?? [])],
    excludeIndustries: [...(base?.excludeIndustries ?? [])],
    macdStates: [...(base?.macdStates ?? [])],
    excludeMacdStates: [...(base?.excludeMacdStates ?? [])],
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
    // A LEADING MINUS ON A NUMBER SURVIVES. This strip removes punctuation the
    // trader typed around a word; it was also removing the sign in front of a
    // number, so "vwap over -5" arrived as "vwap over 5" and asked for the
    // mirror of the set, with nothing in the ignored clause to say so. The
    // lookahead is deliberately narrow -- only a minus IMMEDIATELY followed by a
    // digit is kept, so "-china", "--5" and "2-5" tokenise exactly as before.
    // This preserves a CHARACTER; what the character MEANS is decided in one
    // place, parseValue, and nowhere else.
    .map((t) => t.replace(/^(?!-\d)[^\w$]+|[.,;:!?]+$/g, ''))
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
    // The MACD states belong here for ONE reason: the negation mask asks
    // anyTermAt whether a span is a term at all, and without these keys the
    // two-word span went undetected. "not macd positive" then negated only
    // "macd", left "positive" free, and the facet applied POSITIVELY -- the
    // exact opposite of the ask, silently. The other readers of this list
    // test SINGLE tokens or column phrases and cannot see a two-word key.
    ...(vocab.macdStates ?? []).map((m) => m.key),
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
    // Provisionally negated. Whether it STAYS negated depends on finding a
    // term to govern, decided below.
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
    // THE NEGATOR IS NEVER VOCABULARY, governed or not -- but it leaves by two
    // different doors, and which door is the whole of this.
    if (governed) {
      // It did its job. Consumed silently, the way filler is, because the
      // exclusion it produced is named in the applied line instead.
      for (let k = i; k < j; k++) marks[k] = 'stop'
    } else {
      // Nothing to negate. UNCLAIMABLE, not negated: it must not be matched as
      // a term, and it must still come back NAMED rather than vanishing.
      //
      // Leaving it merely `negated` was the defect. A negated token is not
      // skipped by the vocabulary pass -- being negated is precisely how a term
      // routes to the EXCLUDE side -- so an ungoverned negator fell through and
      // the prefix tier, floor two, matched "no" to the seeded playbook "No
      // Setup". Asking for something a book does not contain excluded a
      // playbook nobody mentioned. `unclaimable` is the existing seam for
      // exactly this: not matchable, still refused. Two meanings, two arrays.
      for (let k = i; k < j; k++) {
        negated[k] = false
        unclaimable[k] = true
      }
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

  // ── pass 1a: the trader's own band words ────────────────────────
  // "extended", "near", "below" are how a momentum trader describes an entry,
  // and this app already defines every one of them numerically. This pass turns
  // the word into the SAME range a hand-written comparison would produce: it
  // writes into `ranges` and touches nothing else.
  //
  // BEFORE the bare-count pass, deliberately -- "extended from the 9 ema" has
  // to claim its nine before that pass can read it as a limit.
  //
  // THE DEFAULT INDICATOR IS THE NINE EMA, and that is a product ruling rather
  // than a measurement. The nine is the pullback reference a trader enters off
  // and names only when asked; VWAP is the level you are above or below. The
  // app's own extended predicate is nine-EMA-only, which is the same instinct
  // written down earlier. Naming VWAP still selects VWAP, and the applied line
  // always says which indicator was used, so the default can be disagreed with.
  for (let i = 0; i < tokens.length; i++) {
    if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
    let band: { word: string; idx: number; merged: boolean } | null = null
    let span = 0
    for (const width of [2, 1]) {
      if (i + width > tokens.length) continue
      const phrase = tokens.slice(i, i + width).join(' ')
      const hit = BAND_WORDS[phrase]
      if (!hit) continue
      // EXACT vocabulary wins and the word is handed BACK -- the same rule pass
      // zero applies to a recency word, for the same reason: a book that names
      // a setup "Extended" means the setup. A SUBSTRING match is not a claim.
      if (vocabKeys.includes(phrase)) break
      band = { word: phrase, idx: hit.idx, merged: hit.merged }
      span = width
      break
    }
    if (!band) continue
    // "below" is ALSO a comparator and "at" is ALSO the tail of the column
    // phrase "sold at". Those two are read as a band only when an indicator
    // follows, so "float below 5" and "sold at 5" keep the readings they have.
    // The unambiguous words -- extended, near, blow off -- stand alone.
    // The indicator, if the trader named one: the first indicator phrase after
    // the band word, across stopwords -- "extended FROM THE 9 ema".
    let j = i + span
    while (j < tokens.length && marks[j] === 'free' && STOPWORDS.has(tokens[j])) j++
    let colId = 'ema9_dist_pct'
    let end = i + span - 1
    for (const width of [2, 1]) {
      if (j + width > tokens.length) continue
      const named = BAND_INDICATORS[tokens.slice(j, j + width).join(' ')]
      if (!named) continue
      colId = named
      end = j + width - 1
      break
    }
    if (end === i + span - 1 && BAND_NEEDS_INDICATOR.has(band.word)) continue
    const table = colId === 'vwap_dist_pct' ? VWAP_BUCKETS : EMA_BUCKETS
    const meta = table[band.idx]!
    const min = Number.isFinite(meta.lo) ? meta.lo : null
    // ONE MERGE, AND IT IS THE APP'S OWN. Bare "extended" means AT OR BEYOND
    // the extended band's lower edge rather than that band alone --
    // ema9DistanceBuckets.ts defines the clean-vs-extended split exactly that
    // way and analytics already ships it. A trader asking for extended entries
    // means the blow-off ones too.
    const max = band.merged || !Number.isFinite(meta.hi) ? null : meta.hi
    const prev = state.ranges[colId] ?? { min: null, max: null }
    state = { ...state, ranges: { ...state.ranges, [colId]: { ...prev, min, max } } }
    const label = colId === 'vwap_dist_pct' ? 'VWAP' : '9 EMA'
    const bounds =
      max === null ? `at or beyond ${min}` : min === null ? `under ${max}` : `${min} to ${max}`
    log(`${label} ${band.word} (${bounds})`, tokens.slice(i, end + 1).join(' '))
    for (let q = i; q <= end; q++) marks[q] = 'consumed'
    i = end
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
      // ZERO IS THE ONE VALUE THAT NEED NOT BE GUESSED, and only here. On a
      // signed distance column the operator alone already names its bound:
      // "above vwap" means the price was above the level, which is the most
      // common VWAP question in small-cap momentum and resolved to nothing at
      // all until now. The bound goes through the SAME comparison record every
      // other range uses, so the applied line names the column, the bound and
      // the zero -- a reader who meant the band can see what was applied and
      // say so.
      if (colId && ZERO_BOUND_COLUMNS.has(colId)) {
        const zLo = Math.min(colStart, i)
        const zHi = Math.max(colEnd, opEnd)
        comparisons.push({
          colId,
          bound: MIN_OPS.has(op) ? 'min' : 'max',
          value: 0,
          text: tokens.slice(zLo, zHi + 1).join(' '),
        })
        for (let k = zLo; k <= zHi; k++) marks[k] = 'consumed'
        continue
      }
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
  // A pool entry of its own rather than addArrayEntry, because the untagged
  // member is a real VALUE here (null means "never computed") and the shared
  // helper's value is a string.
  //
  // KIND SEVEN, AHEAD OF THE MISTAKES, and that is the whole reason a bare
  // "macd" now asks instead of guessing. Mistakes moved to eight. A
  // first-class facet must beat a PREFIX hit on a free-text tag name -- but
  // the tag's FULL name still wins, because tier is checked before kind and
  // an exact match is tier one. RH7 pins both halves.
  for (const m of vocab.macdStates ?? [])
    pool.push({
      kind: 7,
      key: m.key.toLowerCase(),
      display: m.display,
      apply: (s, log) => {
        pushUnique(s.macdStates, m.value)
        // THE COVERAGE AND THE TIMEFRAME, both named. Two-thirds of a real
        // book has no computed MACD, and the two timeframes disagree on
        // nearly half the demo book, so a bare count would be the same
        // silent lie this facet exists to end.
        log(
          m.value === null
            ? `${m.display} (1-minute)`
            : `${m.display} (1-minute, uncomputed excluded)`,
        )
      },
      excludeApply: (s, log) => {
        pushUnique(s.excludeMacdStates, m.value)
        log(`excluding ${m.display} (1-minute)`)
      },
    })
  for (const mk of vocab.mistakes)
    pool.push({
      kind: 8, key: mk.name.toLowerCase(), display: mk.name,
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
      // A WORD THAT IS BOTH FILLER AND VOCABULARY IS A QUESTION, and Edge does
      // not answer it silently.
      //
      // The filler list marks a word only AFTER the match attempt and only when
      // nothing matched, so it suppresses the REPORT of an unmatched word and
      // never prevents a match. Tiers two and three already refuse an
      // all-filler phrase; tier one did not, so a stopword that EXACTLY equals
      // a ticker or a country code applied outright. Measured: seven of twenty
      // ordinary sentences filtered the book down to Malaysia because the user
      // typed "my", every one of them with an empty ignored clause.
      //
      // The filler reading wins by DEFAULT -- it is what the user almost
      // certainly meant -- and the vocabulary reading is OFFERED rather than
      // discarded, in the same shape the bubble already renders and takes.
      // Nothing is consumed here, so the filler mark below still claims the
      // word and it stays out of the ignored clause.
      if (hits.length > 0 && slice.every((w) => STOPWORDS.has(w))) {
        ambiguous.push({ text: raw, candidates: hits.map((h) => h.display) })
        break
      }
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
