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
import type { AnswerIntent, AnswerMetric } from './queryAnswer'
// THE BANDS ARE THE APP'S, IMPORTED RATHER THAN COPIED. Both tables are pure
// (type-only imports of their own) and their edges are locked bucket-for-bucket
// by bucketSchemeParity.test.ts, so there is exactly ONE definition of
// "extended" in the product and it cannot drift into a second one here.
import { EMA_BUCKETS } from '@/core/technicals/emaBuckets'
import { VWAP_BUCKETS } from '@/core/technicals/vwapBuckets'
import { HIGH_FLOAT_MIN, LOW_FLOAT_MAX } from './floatBands'

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
  /** v0.2.7 — an ask Edge UNDERSTOOD and cannot honour, one sentence each.
   *  Distinct from `unresolved`, which is text it could not read at all: a
   *  trader told "I could not read that" about a sentence we understood
   *  perfectly is being told the wrong thing. */
  refusals?: string[]
  /** Tokens that matched more than one candidate in the same kind. */
  ambiguous: AmbiguousToken[]
  /** v0.2.7 -- THE KIND BEHIND EVERY OFFERED DISPLAY, keyed by the ask text
   *  and the display joined by a NUL.
   *
   *  WHY IT EXISTS. The chip list is deduplicated before it is rendered, and a
   *  display alone is not an identity: beat one hundred eighty-seven measured
   *  thirteen displays shared across kinds on three books. Identity IS
   *  available here, at every push site, so it is recorded here and handed on.
   *  Entries with no kind -- the superlative candidates, the include or
   *  exclude pair -- are simply absent, and the merge falls back to the
   *  display for them, which is right because they are not entries. */
  offerKinds?: ReadonlyMap<string, number>
  /** v0.2.7 slice B — the AGGREGATE the ask wants over the filtered rows,
   *  or absent. OPTIONAL on purpose: the strict boundary's discard returns
   *  an object literal that does not mention this field, so an unreadable
   *  ask cannot carry an answer out. The boundary governs answers for the
   *  same reason and by the same line it governs filters.
   */
  answer?: AnswerIntent | null
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
  // TWO OF THE THREE TOKENS THAT BLOCKED THE FOUNDER'S OWN SENTENCE. Both were
  // measured against the ones standard before being added: a word may become
  // filler only if it is a WHOLE TOKEN in NO vocabulary key on ANY measured
  // book, and carries no other meaning an ask could want.
  //
  //   "ive"     zero whole-token hits on three books. It only ever arrives as
  //             the tail of a contraction the tokenizer has already stripped.
  //   "ranges"  appears in no key at all, and is not a column phrase or a band
  //             word. In "price ranges from two to ten" it is doing grammar.
  //
  // "win" WAS REFUSED BY THE SAME STANDARD -- it is a whole token inside a real
  // mistake name on every book, so it offers instead. See WHOLE_WORD_FLOOR.
  'ive', 'ranges',
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
 *  WHAT A NEGATOR DID, AND WHAT IT DOES NOW. The sentence this replaces read:
 *
 *    "What a negator does today is REFUSE, not exclude. The ask has no shape
 *     for everything except China, so the honest answer is to apply nothing
 *     and say which words were not acted on. Real exclusion needs the ask to
 *     grow."
 *
 *  The ask has grown. A negator now EXCLUDES on any field with a set it can
 *  name, and REFUSES BY NAME on the three that have none. What has not
 *  changed is the rule underneath: a negator is never silently dropped. */
export const NEGATORS = new Set(['not', 'no', 'without', 'excluding', 'except'])

/** THE TEN FIELDS AN EXCLUSION CAN NAME A SET FOR.
 *
 *  Membership was DERIVED, not chosen. For each field an SQL twin was written
 *  from the schema for "every row that does NOT match this filter", run on
 *  three books, and required to reconcile: matched plus excluded equal to the
 *  book. Ten reconciled thirty times out of thirty. */
export const EXCLUDABLE_FIELDS = [
  'symbol', 'side', 'outcome', 'duration', 'datePreset',
  'dateFrom', 'dateTo', 'mistakesOnly', 'aPlus', 'ranges',
] as const

/** THE THREE IT CANNOT, AND THEY FAIL FOR TWO DIFFERENT REASONS.
 *
 *  A limit and a sort name a PRESENTATION rather than a set of rows. The five
 *  pillar verdict has a perfectly good meaning and no way to check it, because
 *  it is worked out from settings thresholds and never stored. Telling a
 *  trader the wrong one of those is its own small dishonesty, so each refuses
 *  in its own words below. */
export const UNEXCLUDABLE_FIELDS = ['limit', 'sort', 'dna'] as const

/** A limit hides rows that QUALIFY, so its complement is a real set -- the ask
 *  is an OFFSET, and the honest refusal names the capability we lack rather
 *  than calling the sentence meaningless. */
export const LIMIT_REFUSAL =
  'I can show a set number of trades but I cannot yet skip past them, so I left that part alone'
/** An ordering is not a set, so there is genuinely nothing to leave out. */
export const SORT_REFUSAL =
  'An ordering is not a group of trades, so there is nothing there for me to leave out'
/** The verdict exists; the means to verify it does not. */
export const DNA_REFUSAL =
  'The five pillar verdict is worked out from your settings rather than stored, so I cannot check what leaving it out would give you'

/** The substring tier's floor. FOUR, raised from three: at three "are" reached
 *  sector Healthcare and "but" offered a choice between two industries, both
 *  from ordinary English in the middle of a sentence. Four keeps "pullback"
 *  reaching a multi-word playbook, which is what the tier is for. The exact
 *  tier still has no floor at all; the PREFIX floor is now per-kind, below. */
const SUBSTRING_FLOOR = 4
/** THE SHORTEST TOKEN THAT MAY OFFER A READING, when it is a WHOLE WORD.
 *
 *  WHY "win" WENT UNREAD AND "loss" DID NOT. It was never that one is
 *  vocabulary and the other filler -- beat one hundred ninety four said so and
 *  was wrong, and there is no literal "loss" in this file to do it. "loss" is
 *  FOUR characters and clears SUBSTRING_FLOOR, so it reaches the substring tier
 *  and offers the mistake names it sits inside. "win" is THREE, never reaches
 *  that tier at all, and falls through to the unread set -- where the strict
 *  boundary then throws away whatever the rest of the sentence had earned.
 *
 *  A SUBSTRING match below four characters is noise: three letters occur inside
 *  half the words on a book. A WHOLE WORD is the trader naming something. So a
 *  short token may still offer, but only on an exact word boundary, and it
 *  OFFERS rather than picks -- a word that is both filler and vocabulary is
 *  ambiguous by construction and choosing for the trader is the silent wrong
 *  this campaign exists to remove. */
const WHOLE_WORD_FLOOR = 3

/** HOW MUCH OF AN ENTRY A SINGLE TOKEN MUST COVER BEFORE THE RESOLVER ACTS
 *  ON IT RATHER THAN ASKING. Measured, not chosen: across four thousand
 *  four hundred and eighty-five asks on three books, every ordinary English
 *  word that reached an entry it did not mean covered less than three
 *  tenths of that entry, and every word that meant what it reached covered
 *  more. "traded" is under a quarter of "Traded on tilt - didn't walk
 *  away"; "clinical" is nearly three quarters of "FDA / Clinical".
 *
 *  WHY A PREFIX NEEDED THIS AND A SUBSTRING DID NOT: the substring tier has
 *  ASKED rather than applied since the "United Arab Emi-rate-s" measurement
 *  recorded below. The prefix tier kept applying, so a common verb sitting
 *  at the FRONT of a long mistake name went straight through -- "traded"
 *  reached "Traded on tilt" and returned zero trades for a sentence whose
 *  honest answer was seventeen.
 *
 *  WHAT THIS IS NOT: it is not a refusal. A phrase below the floor is
 *  OFFERED, in the same shape the bubble already renders and takes, so the
 *  trader is asked instead of answered. A rule whose failure mode is a
 *  question cannot invent a silent wrong. */
export const COVERAGE_FLOOR = 0.3

/** Alphanumeric length -- the only measure the two alphabets share. A key is
 *  user-authored and keeps its punctuation; the ask has had its stripped. */
const coverageWeight = (s: string): number => s.replace(/[^A-Za-z0-9]/g, '').length

/** Strong enough to ACT on, or only strong enough to OFFER? A MULTI-token
 *  phrase is already specific. A single-word ENTRY has nothing to be a
 *  fraction of. Everything else is judged by how much of the entry the
 *  token actually covers. EXACT never reaches here. */
export function strongEnoughToApply(phrase: string, key: string): boolean {
  if (phrase.includes(' ')) return true
  const words = key.split(/[^A-Za-z0-9]+/).filter((w) => w.length > 0)
  if (words.length <= 1) return true
  return coverageWeight(phrase) / Math.max(1, coverageWeight(key)) >= COVERAGE_FLOOR
}

/** THE VOCABULARY KEY ALPHABET. A key is USER-AUTHORED, so it carries
 *  whatever punctuation the trader typed -- slashes, dashes, brackets,
 *  ampersands. The ask does not: the tokenizer strips punctuation before
 *  any comparison happens. Comparing the two directly is not a test that
 *  fails, it is a test that CANNOT pass, and it kept eleven measured
 *  entries unreachable by their own full names.
 *
 *  Everything outside this class becomes a single space, whitespace then
 *  collapses, and both sides are lowercased -- so the two alphabets meet.
 *
 *  ASCII BY CONSTRUCTION, written out rather than borrowed from a shorthand
 *  class. The collision census that cleared this change measured the ASCII
 *  reading on three books; a pattern that silently widened to unicode would
 *  not be the thing that was measured. */
export const VOCAB_KEY_ALPHABET = /[^A-Za-z0-9_$ ]/g

/** WHERE THE RESERVATION STOPS. Two, and it is a floor rather than a size:
 *  the span sequence descends from the book's own longest key and halts
 *  here, so a single token can never reserve however long the book's names
 *  are. RK4 is this constant. */
export const RESERVATION_FLOOR = 2

/** KIND ZERO is the ticker. Named because the prefix floor carves it out and
 *  a bare 0 at the predicate would say nothing about why. */
export const SYMBOL_KIND = 0

/** THE PREFIX FLOOR, PER KIND. Measured rather than chosen.
 *
 *  A single floor of THREE for everything eliminates thirty-seven, forty-eight
 *  and one hundred silent applies across the demo, human and larger books --
 *  and takes six, ten and SEVENTY ticker prefixes down with it, because a
 *  trader typing two letters of a ticker means the ticker. Symbols at TWO with
 *  every other kind at FOUR eliminates sixty-two, eighty-eight and one hundred
 *  and two -- MORE on every book -- and costs no ticker at all.
 *
 *  WHAT IT DOES NOT DO: ordinary sentences are made of four-plus-letter words,
 *  which no prefix floor reaches. Ten sentences driven across three books moved
 *  by nothing, two and one. The long-word matches are still live. */
export const SYMBOL_PREFIX_FLOOR = 3
export const PREFIX_FLOOR = 4

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
  // v0.2.7 -- the TWENTY. Every spelling here was driven with a scratch
  // entry BEFORE it was added, and only the survivors are listed: a
  // number-bearing key resolves solely when an operator and a value are
  // present, because the comparison pass runs before the bare-count pass.
  // A bare "20 ema" is still a count, and that is parser work.
  ['20 ema', 'ema20_dist_pct'], ['ema 20', 'ema20_dist_pct'],
  ['ema20', 'ema20_dist_pct'], ['ema20 distance', 'ema20_dist_pct'],
  ['ema20 dist', 'ema20_dist_pct'], ['20 ema distance', 'ema20_dist_pct'],
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

/** Every single word that names a column, for the ONE question of whether a
 *  negator has something to govern. A phrase like "risk per share" governs on
 *  its first word, which is enough for the detector. */
const COLUMN_KEYS: ReadonlySet<string> = new Set(
  COLUMN_PHRASES.flatMap(([p]) => p.split(' ')),
)

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
/** Indicators this app names but has NO band scheme for. The seven-band
 *  scheme was derived for the NINE: its own file calls them "the 7 signed
 *  9-EMA-distance buckets", two labels read "Below 9 EMA" and "At 9 EMA",
 *  and it quotes the spec as giving the twenty "binary crossover only".
 *  Lending those edges to the twenty would invent a threshold.
 *
 *  WITHOUT THIS the pass did not refuse -- it fell through to its default
 *  and answered "extended from the 20 ema" with the NINE's band, reading
 *  the twenty as a limit. A wrong indicator answering silently is worse
 *  than no answer, so a named-but-unsupported indicator refuses outright. */
const BAND_NO_SCHEME: ReadonlySet<string> = new Set(['20 ema', 'ema 20', 'ema20'])

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
const ZERO_BOUND_COLUMNS: ReadonlySet<string> = new Set([
  'vwap_dist_pct',
  'ema9_dist_pct',
  // The twenty is the same KIND of column -- a signed distance whose zero
  // is the level itself -- so it joins the day it lands. Shipping it
  // without this would rebuild the very asymmetry between two indicators
  // that a whole beat was spent removing.
  'ema20_dist_pct',
])

/** TWO-TOKEN COMPARATOR PHRASES, and the reason they are here rather than in
 *  STOPWORDS. "more" and "than" name an OPERATION, and beat 154 DROVE the
 *  alternative rather than assuming it. With both words forced into the filler
 *  list and no operator reading at all, "entries more than five percent
 *  extended from the 9 ema" STRANDS ITS OWN OPERAND -- the number survives
 *  with nothing to bind it to and comes back as the unread "five percent" --
 *  and "price more than five", which the operator reading resolves exactly,
 *  instead refuses with its column orphaned. Swallowing the operator does not
 *  simplify the sentence; it breaks the part that was working.
 *
 *  The shape is the shipped one. "at least" and "at most" already collapse
 *  two tokens into a single op immediately below; these four join that path
 *  and reach MIN_OPS and MAX_OPS through the identical door.
 */
const THAN_OPS: Record<string, string> = {
  more: 'over', greater: 'over', less: 'under', fewer: 'under',
}

/** METRIC PHRASES — the whole of slice B's answer vocabulary, as a named literal.
 *
 *  Matched against the CONTENT SKELETON (see the answer pass), so the stopwords
 *  a trader puts between the words do not have to be enumerated here: "what
 *  percent of my trades were winners" reaches "percent winners" across four of
 *  them.
 *
 *  "percent winners" IS the win rate, and it consumes "winners" deliberately.
 *  Left free, that word applies the winners outcome filter and the rate is then
 *  computed over winners alone -- one hundred percent, every time, on every
 *  book. A confident, wrong, non-zero answer: exactly the class this campaign
 *  removed. */
export const ANSWER_METRIC_PHRASES: Record<string, AnswerMetric> = {
  'how many': 'count',
  'average loss': 'avg_loser',
  'average losses': 'avg_loser',
  'avg loss': 'avg_loser',
  'average gain': 'avg_winner',
  'average win': 'avg_winner',
  'avg gain': 'avg_winner',
  'average hold time': 'avg_hold',
  'average hold': 'avg_hold',
  'win rate': 'win_rate',
  'percent winners': 'win_rate',
  'profit factor': 'profit_factor',
  'total pnl': 'net_pnl',
  'total profit': 'net_pnl',
}

/** The question words, and R245 is why they are HERE and not in STOPWORDS.
 *
 *  Every one of them is consumed CONTEXTUALLY -- only on a sentence that already
 *  produced an answer intent. Unconditionally they would be filler, and beat 156
 *  measured what that costs: "is" is the ONLY unread token in "what is my average
 *  loss" on all three books, so making it filler hands the trader a full table
 *  with three offer chips and no number. "what was my worst day" is out of slice
 *  and must keep refusing, which it does because no metric phrase matches it and
 *  so "was" is never touched. */
export const ANSWER_FILLER: ReadonlySet<string> = new Set([
  'is', 'whats', 'was', 'did', 'take', 'took',
])

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
  /** v0.2.7 -- the COLUMN word carried a negator, so this comparison names a
   *  range to LEAVE OUT rather than one to keep. Recorded here because the
   *  negator attaches to the column while the comparison is driven by the
   *  operator, and the operator is not negated. */
  negated?: boolean
}

type TokenState = 'free' | 'consumed' | 'stop'

/** One vocabulary candidate. `key` is the lowercased match text. */
interface PoolEntry {
  kind: number // index into KIND ORDER — lower wins precedence
  key: string
  display: string
  apply: (s: TradesFilterState, log: (line: string) => void) => void
  /** v0.2.7 — the EXCLUDE side. It was once present only on the array fields,
   *  and the sentence here said SEVEN when the code had EIGHT: macdStates was
   *  the member it forgot. Both counts are now wrong for a better reason --
   *  symbol carries one too, and the state words are handled in pass two.
   *  Absent still means the term has no exclude side. */
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
  /** The state this ask INHERITED, rebuilt fresh each call. The strict
   *  boundary below returns this rather than an empty filter set: an
   *  unreadable ask applies nothing, it does not wipe what the trader
   *  already had on screen. */
  const inherited = (): TradesFilterState => ({
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
  })
  let state: TradesFilterState = inherited()
  const applied: string[] = []
  const appliedSources: string[] = []
  const unresolved: string[] = []
  const log = (line: string, source: string) => {
    applied.push(line)
    appliedSources.push(source)
  }
  const ambiguous: AmbiguousToken[] = []
  /** display and kind, recorded where identity still exists. */
  const offerKinds = new Map<string, number>()
  const offerKey = (text: string, display: string) =>
    `${text}${String.fromCharCode(0)}${display}`
  const noteKinds = (text: string, hits: readonly PoolEntry[]) => {
    for (const h of hits) offerKinds.set(offerKey(text, h.display), h.kind)
  }

  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    // A LEADING MINUS ON A NUMBER SURVIVES. This strip removes punctuation the
    // trader typed around a word; it was also removing the sign in front of a
    // number, so "vwap over -5" arrived as "vwap over 5" and asked for the
    // mirror of the set, with nothing in the ignored clause to say so. The
    // lookahead is deliberately narrow -- only a minus IMMEDIATELY followed by a
    // digit is kept.
    //
    // REVERSED BY BEAT ONE HUNDRED NINETY SEVEN. The sentence here used to end:
    //
    //   "... so "-china", "--5" and "2-5" tokenise exactly as before."
    //
    // That was true and it was the defect. "price 2-10" is how a trader writes
    // a range, and tokenising it as before meant ONE token the parser could
    // not take apart, so the ask read as nothing while "price 2 - 10" worked.
    // Two spellings of one question disagreed.
    //
    // A GLUED RANGE IS NOW SPLIT INTO THE TWO NUMBERS IT NAMES, and nothing
    // else is. The shape is deliberately narrow: a DIGIT, a hyphen, a DIGIT,
    // with an optional currency sign on either number. Beat one hundred eighty
    // six measured that no vocabulary key on any book carries that shape, and
    // this beat re-derived it across three hundred and eighty five keys on
    // three books -- forty five carry a hyphen and NOT ONE would newly split.
    // "1-min Pullback", "Auto - Parts" and "Hold-and-hope" are untouched,
    // because a hyphen between a digit and a LETTER, or with spaces around it,
    // is not this shape.
    .map((t) => t.replace(/^(?!-\d)[^\w$]+|[.,;:!?]+$/g, ''))
    .flatMap((t) => {
      const glued = /^\$?(\d[\d.]*)-\$?(\d[\d.]*)$/.exec(t)
      return glued ? [glued[1], glued[2]] : [t]
    })
    .filter((t) => t.length > 0)
  /** Asks Edge understood and cannot honour. Filled by pass one and pass
   *  two, and handed back so the sentence can say them out loud. */
  const refusals: string[] = []
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
  /** THE SAME KEYS, IN THE ASK'S ALPHABET. Built here and only here, from
   *  vocabKeys itself, so the two lists cannot drift: every key has exactly
   *  one normalised form at the same index.
   *
   *  STRICTLY A SUPERSET. If a raw key equals a probe, its normalised form
   *  equals the normalised probe too -- so nothing that matches today stops
   *  matching. The collision census measured ZERO distinct keys merged by
   *  this on any of the three books, which is the other half of safe: it
   *  matches more, and it never confuses two names for one.
   *
   *  ONE READER ONLY, deliberately. Of the ten places that ask whether text
   *  is a vocabulary key, only the span reservation below uses this list.
   *  The other nine were measured and left alone: five compare a SINGLE
   *  token, and no key on any book normalises to one word while differing
   *  from its lowercased form; three compare against fixed internal tables
   *  that no key newly reaches; and the negation mask probes widths this
   *  cannot help at. Widening a comparison nobody could show a use for is
   *  how a cure grows a blast radius it was never measured over. */
  /** ONE ALPHABET, AND THE WORD "and" IS NOT PART OF A NAME.
   *
   *  A key is USER-AUTHORED and carries whatever punctuation the trader
   *  typed. The ask does not: the tokenizer strips punctuation before any
   *  comparison happens. Everything outside VOCAB_KEY_ALPHABET becomes a
   *  space and both sides are lowercased, so the two alphabets meet.
   *
   *  AND THE AMPERSAND. A book stores "Rental & Leasing Services"; a
   *  trader types it either way. The strip above already deletes a bare
   *  ampersand from BOTH sides, so the stored spelling matched -- but the
   *  SPOKEN one did not, because the word survived on the ask side alone.
   *  Dropping the standalone word closes that, and it is the reading the
   *  rest of this file already gives it: "and" is a STOPWORD.
   *
   *  MEASURED, NOT ASSUMED. Twenty-six names across three books carry an
   *  ampersand and exactly one carries the word; the rule merges NO two
   *  names on any book. A merge would have meant two of the trader own
   *  names becoming one, and it was a stop condition rather than a risk. */
  /** A CONSERVATIVE PLURAL FOLD ON THE LAST WORD ONLY, because a plural is a
   *  word ending and not a phrase ending.
   *
   *  WHAT IT FIXES. "halt resume long" read as a playbook and answered sixteen
   *  trades; "halt resume longs" stopped matching the phrase at all, split into
   *  a catalyst plus a side, and answered nothing. One letter, and the trader
   *  is told they have no such trades.
   *
   *  DELIBERATELY NARROW. No irregulars, no -ves, and a double s is NOT a
   *  plural, so "Traded through max loss" keeps its own name instead of folding
   *  to "los" and going unreachable. Every widening is another chance to merge
   *  two of the trader's own names into one.
   *
   *  AND NO -ies TO -y, WHICH IS THE ONE THIS BEAT HAD TO TAKE BACK OUT. Every
   *  branch here TRUNCATES, so the folded key stays a PREFIX of the original
   *  and the substring tier still reaches it. Rewriting "utilities" to
   *  "utility" does not: it changes characters, so "Utilitie" -- which used to
   *  find the Utilities sector through that tier -- stopped resolving
   *  altogether. The invariant drive caught five such asks across the
   *  vocabulary forms and they were the only off-shape movement in five
   *  thousand one hundred and eighty eight runs. A fold that helps the plural
   *  and breaks the typo is not a trade this campaign makes.
   *
   *  MEASURED BEFORE IT WAS WRITTEN. Across three hundred and eighty five
   *  vocabulary keys on three books it creates ZERO collisions, within a kind
   *  or across kinds -- and the census was proven able to see one by planting a
   *  colliding pair first. */
  const foldPlural = (w: string): string => {
    if (w.length <= 3) return w
    if (w.endsWith('sses') || w.endsWith('shes') || w.endsWith('ches')) return w.slice(0, -2)
    if (w.endsWith('ss')) return w
    if (w.endsWith('s')) return w.slice(0, -1)
    return w
  }
  const normaliseKey = (value: string): string => {
    const words = value
      .replace(VOCAB_KEY_ALPHABET, ' ')
      .toLowerCase()
      .split(' ')
      .filter((w) => w.length > 0 && w !== 'and')
    if (words.length > 0) words[words.length - 1] = foldPlural(words[words.length - 1])
    return words.join(' ')
  }
  const vocabKeysNormalised: string[] = vocabKeys.map(normaliseKey)
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
    MISTAKE_FLAG_WORDS.has(w) ||
    // A RECENCY WORD IS A TERM A NEGATOR CAN GOVERN. Without this line the
    // negator finds nothing to attach to, un-negates itself, and the whole
    // ask lands in the unread set -- which is how "except the last ten" came
    // back as "I could not read except". It IS readable; we simply cannot do
    // it, and that is a refusal to be NAMED rather than a sentence to reject.
    w in RECENCY_WORDS ||
    SUPERLATIVE_WORDS.has(w) ||
    // A COLUMN NAME IS A TERM A NEGATOR CAN GOVERN TOO. Without this,
    // "not price over two" left the negator ungoverned and the range applied
    // POSITIVELY -- the ask reversed in silence. "not float over a million"
    // happened to work only because float is also a vocabulary key.
    COLUMN_KEYS.has(w)
  const anyTermAt = (rawPhrase: string): boolean => {
    // NORMALISE FIRST, exactly as the vocabulary pass does. Without this the
    // detector cannot see a demonym: "not chinese" left its term unmarked and
    // the word then resolved as an ordinary INCLUDE -- the opposite of the ask.
    // Never exercised before: every negation on record used a literal key
    // ("not china", "not from hong kong"), so the gap only surfaced when
    // exclusion made the term's fate visible.
    const phrase = DEMONYMS[rawPhrase] ?? rawPhrase
    // AND IN THE SAME ALPHABET THE RESERVATION PASS USES. Without this a name
    // carrying punctuation could not be governed WHOLE: "not cut winner too
    // early (fear)" matched only the first two words, left the rest free, and
    // the loose word "winner" was then read as an OUTCOME and every winning
    // trade excluded. Both sides in one alphabet, exactly as pass three does.
    const phraseN = normaliseKey(phrase)
    return (
      isStateWord(phrase) ||
      vocabKeysNormalised.some(
        (k) =>
          k === phraseN ||
          (phraseN.length >= 2 && k.startsWith(phraseN)) ||
          (phraseN.length >= SUBSTRING_FLOOR && k.includes(phraseN)),
      ) ||
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
  /** The longest vocabulary key, in tokens, so a negator can govern a whole
   *  name. Computed here because maxKeyTokens is not declared until the
   *  vocabulary pass, and three was never the right ceiling. */
  const negSpanCeiling = Math.max(
    3,
    ...vocabKeys.map((k) => k.split(' ').length),
  )
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
    //
    // THE CEILING IS THE LONGEST KEY, not three. It was three, and a name
    // longer than that ended up HALF negated: "not cut winner too early
    // (fear)" negated only the first two words, the reservation pass then
    // refused the span because its negation state was not aligned, and the
    // word "winner" fell through free -- where a negated outcome branch read
    // it and excluded every WINNING trade instead of the mistake. Measured on
    // three books before this line changed.
    let governed = false
    for (let span = negSpanCeiling; span >= 1; span--) {
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

  // ── the answer pass ───────────────────────────────────────────────────────
  // FIRST, and the order is the whole of it. "average", "loss" and "rate" all
  // reach vocabulary on at least one measured book -- "average" ALONE APPLIES a
  // mistake on the demo book -- so a metric phrase read after the vocabulary
  // pass would already have lost its words to a filter nobody asked for.
  // Reading it here takes the phrase as a UNIT and leaves every other word
  // exactly as it was, which is what keeps "trades where i averaged down"
  // reaching the mistake it always reached.
  let answer: AnswerIntent | null = null
  {
    // THE CONTENT SKELETON: the indices of tokens that are not stopwords, not
    // negated, not unclaimable and not already consumed. Phrases match against
    // CONSECUTIVE skeleton entries, which is how a four-stopword gap closes.
    const skel: number[] = []
    for (let i = 0; i < tokens.length; i++) {
      if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
      if (STOPWORDS.has(tokens[i])) continue
      skel.push(i)
    }
    for (let a = 0; a < skel.length && !answer; a++) {
      // THREE BEFORE TWO, so "average hold time" is not eaten by "average hold".
      for (const span of [3, 2]) {
        // CONTINUE, never break: a three-token span that overruns the end of
        // the skeleton must not stop the two-token span from being tried. As a
        // break it silently killed every two-word metric in a three-word
        // skeleton -- "whats profit factor", "percent winners", "is average
        // loss" -- which is most of the slice.
        if (a + span > skel.length) continue
        const phrase = skel.slice(a, a + span).map((i) => tokens[i]).join(' ')
        const metric = ANSWER_METRIC_PHRASES[phrase]
        if (!metric) continue
        // EXACT vocabulary wins, the rule the recency pass already keeps: a
        // playbook the trader named "win rate" is the trader's own word.
        if (vocabKeys.includes(phrase)) continue
        answer = { metric, source: phrase }
        for (let k = 0; k < span; k++) marks[skel[a + k]] = 'consumed'
        break
      }
    }
    // R245 — the question words, and ONLY once an intent exists.
    if (answer) {
      for (let i = 0; i < tokens.length; i++) {
        if (negated[i] || unclaimable[i] || marks[i] !== 'free') continue
        if (ANSWER_FILLER.has(tokens[i]) && !vocabKeys.includes(tokens[i])) marks[i] = 'stop'
      }
    }
  }

  // ── the span reservation ───────────────────────────────────
  // A MULTI-TOKEN EXACT VOCABULARY MATCH RESERVES ITS SPAN BEFORE ANY CONSUMING
  // PASS. The vocabulary is USER-AUTHORED -- a trader names their own setups,
  // mistakes and catalysts -- so Edge follows the trader's own words ahead of
  // its own, and the rule cannot be an enumerated list of which passes to
  // exempt: a name nobody has typed yet must win just as surely.
  //
  // THIS IS NOT A NEW LAW. It is one already written down three times in this
  // file and scoped, each time, to a single pass:
  //   the negation mask   "no setup" is a playbook NAME, not a refusal of setup
  //   pass 0              a book that names a setup "Last" means the setup
  //   pass 1a             a book that names a setup "Extended" means the setup
  // Every one of those asks whether the FUNCTIONAL WORD ITSELF is a key. None
  // asks whether it sits INSIDE one, and that is the whole defect: "short" is
  // token two of the catalyst "short squeeze", "parabolic" is token one of the
  // playbook "parabolic short". The functional pass took its word, and pass 3
  // then abandoned the span at the `marks[i + k] !== 'free'` test below, so the
  // entry was never even constructed, let alone allowed to win on the exact
  // tier. Two of the six measured cases showed the trader NOTHING -- no offer,
  // no mention of the entry at all.
  //
  // A SEPARATE MASK, not a fourth mark state. `marks` stays 'free' across a
  // reserved span, so pass 3's own gates need no exception and the entry
  // resolves as the tier-one hit it already was. The strict boundary reads
  // `marks` too, so a reserved entry beside an unread token still discards
  // everything -- there is nothing to remember and nothing to keep in step.
  //
  // SINGLE TOKENS NEVER RESERVE. That half stands, and stands unchanged.
  // What has been REVERSED is the second clause, which read:
  //
  //     SINGLE TOKENS NEVER RESERVE. Spans of three and two only, exactly
  //     as the negation mask's own lookahead does. Letting one token
  //     reserve was measured and rejected: on the largest book "my" is the
  //     Malaysia ISO, and a single-token reservation would apply the
  //     country to every sentence containing the word -- the defect beat
  //     152 removed.
  //
  // "SPANS OF THREE AND TWO ONLY" WAS THE DEFECT, not the guard. Beat 165
  // MEASURED it -- raising the bound alone converted nothing, because the
  // two sides of the comparison were in different alphabets and the longer
  // span was compared to a key it could never equal. Beat 166 measured the
  // other half and found the same result mirrored. This beat REVERSES the
  // clause, having removed both constraints at once: eleven of twelve
  // measured captures reach their entry, every one of them CORRECT rather
  // than refused, and four hundred five ordinary sentences did not move.
  //
  // THE MALAYSIA ARGUMENT IS UNTOUCHED AND STILL DECIDES THE FLOOR. "my" is
  // that ISO on the largest book, and a single-token reservation would
  // still apply the country to every sentence carrying the word. The span
  // sequence descends and stops at RESERVATION_FLOOR, so it cannot reach
  // one by construction rather than by anyone remembering not to.
  //
  // AFTER THE ANSWER PASS, per R254. An entry a trader named "Average Loss"
  // would lose to the metric grammar, which exists on no measured book and is
  // the first named question of the stress campaign. The ordering is the seam;
  // this comment is where to find it.
  // THE BOUND IS THE BOOK'S. It is the longest key this trader actually has,
  // tokenised the way their ask will be so the two are comparable, and it is
  // never a number written here. A book of two-word names leaves it at
  // RESERVATION_FLOOR and the scan does no more work than it did before; a
  // trader who names a setup in eight words raises it to eight.
  //
  // A LITERAL WOULD BE A NUMBER THAT FITS THE BOOKS THAT WERE MEASURED,
  // which is a different thing from being right. The seven that the three
  // measured books happen to need is not a property of trading journals.
  const maxKeyTokens = vocabKeys.reduce((m, k) => {
    const n = k.split(/\s+/)
      .map((t) => t.replace(/^(?!-\d)[^\w$]+|[.,;:!?]+$/g, ''))
      .filter((t) => t.length > 0).length
    return n > m ? n : m
  }, RESERVATION_FLOOR)
  const reserved: boolean[] = tokens.map(() => false)
  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] !== 'free' || unclaimable[i]) continue
    // DESCENDING, SO THE LONGEST NAME WINS. The same law the column phrases
    // follow: a longer key must be tried before a shorter one it contains, or
    // the short name swallows the long one and the trader is shown a filter
    // they did not ask for.
    //
    // AND IT STOPS AT THE FLOOR. Single tokens never reserve, and the loop
    // cannot reach one because it terminates above it.
    for (let span = maxKeyTokens; span >= RESERVATION_FLOOR; span--) {
      if (i + span > tokens.length) continue
      const slice = tokens.slice(i, i + span)
      // Aligned to the negation state of the first token, the same test pass 3
      // makes at its own span gate: a phrase half inside a negation is not a
      // phrase, and a negated reserved span must route to the exclude side.
      if (slice.some((_, k) => marks[i + k] !== 'free' || negated[i + k] !== negated[i])) continue
      // BOTH SIDES IN ONE ALPHABET. The raw list is not consulted here: a
      // normalised match is a strict superset of a raw one, so testing both
      // would be testing the same thing twice and inviting them to disagree
      // later.
      if (!vocabKeysNormalised.includes(normaliseKey(slice.join(' ')))) continue
      for (let k = 0; k < span; k++) reserved[i + k] = true
      i += span - 1
      break
    }
  }

  // ── pass 0: the limit and the sort ────────────────────────────────────────
  // Before the comparison pass, so "last 10" cannot have its number taken for
  // a bare money comparison. A recency word carries its own ordering; a
  // superlative carries a count with no column and is returned as a choice.
  for (let i = 0; i < tokens.length; i++) {
    // NEGATED TOKENS ARE LET THROUGH, deliberately. They used to be skipped
    // here, which is why a refusal placed further down could never run.
    if (unclaimable[i] || reserved[i] || marks[i] !== 'free') continue
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
    // A NEGATED RECENCY, AND THE TWO CASES ARE DIFFERENT ASKS.
    // With a count -- "except the last ten" -- the trader named a SET and
    // asked us to skip it. That is an OFFSET, a real thing we do not have,
    // so the refusal names the missing capability rather than the sentence.
    // Without one -- "not newest" -- they named an ORDERING, and the
    // complement of an order is not a set of rows at all.
    if (negated[i] && isRecency) {
      const hasCount = !!v && Number.isInteger(v.n) && v.n > 0
      refusals.push(hasCount ? LIMIT_REFUSAL : SORT_REFUSAL)
      for (let q = i; q < (hasCount ? k + v!.len : i + 1); q++) marks[q] = 'consumed'
      continue
    }
    if (negated[i]) continue
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
    if (negated[i] || unclaimable[i] || reserved[i] || marks[i] !== 'free') continue
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
    let refused = false
    for (const width of [2, 1]) {
      if (j + width > tokens.length) continue
      if (BAND_NO_SCHEME.has(tokens.slice(j, j + width).join(' '))) {
        refused = true
        break
      }
    }
    if (refused) {
      // A REFUSED WORD IS NOT A FREE WORD. A bare `continue` here left every
      // token of the phrase claimable, and the vocabulary pool took it: on the
      // two books measured, "extended" and "very extended" became the mistake
      // "Chased extended", "blow off" became the catalyst "Offering /
      // Dilution", and "parabolic" became the playbook "Parabolic Short" --
      // four of the seven band words on one book, two on the other, each with a
      // confident applied line and an empty ignored clause.
      //
      // `unclaimable` is beat 109's seam and this is exactly what it is for:
      // not matchable, still reported. `marks` stays 'free', so the unresolved
      // builder still NAMES the word and the trader learns it went unread
      // instead of silently receiving a different filter.
      //
      // THE BAND WORD ONLY. The indicator tokens keep the reading they already
      // had -- a bare "20 ema" is still a count -- because no ruling asked for
      // that to change and marking them would change it.
      for (let q = i; q < i + span; q++) unclaimable[q] = true
      continue
    }
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
    if (negated[i] || unclaimable[i] || reserved[i] || marks[i] !== 'free') continue
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
    if (negated[i] || unclaimable[i] || reserved[i] || marks[i] !== 'free') continue
    let op = tokens[i]
    let opLen = 1
    if (op === 'at' && i + 1 < tokens.length && (tokens[i + 1] === 'least' || tokens[i + 1] === 'most')) {
      op = tokens[i + 1]
      opLen = 2
    } else if (i + 1 < tokens.length && tokens[i + 1] === 'than' && THAN_OPS[op]) {
      op = THAN_OPS[op]
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

    // WAS THE COLUMN NEGATED? The negator marks the column word, never the
    // operator, so this is where the fact lives.
    let colNegated = false
    for (let k = colStart; k <= colEnd; k++) if (negated[k]) colNegated = true
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
          negated: colNegated,
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
      negated: colNegated,
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
      // Negated tokens let through for the same reason as pass zero.
      if (unclaimable[i] || reserved[i] || marks[i] !== 'free') continue
      const v = parseValueAt(tokens, i)
      if (!v || v.len !== 1 || v.unit !== null) continue
      if (!Number.isInteger(v.n) || v.n <= 0) continue
      if (vocabKeys.includes(tokens[i])) continue
      // A NEGATED LIMIT. "except the last ten" plausibly means SKIP those ten,
      // which is a real set of rows -- an OFFSET. We have no offset, so the
      // refusal names the missing capability and applies nothing.
      if (negated[i]) {
        refusals.push(LIMIT_REFUSAL)
        marks[i] = 'consumed'
        break
      }
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
    if (marks[i] !== 'free' || unclaimable[i] || reserved[i]) continue
    const t = tokens[i]
    // A NEGATED STATE WORD. The fields with a set to name EXCLUDE; the three
    // without REFUSE BY NAME. Nothing here is ever dropped in silence.
    if (negated[i]) {
      if (OUTCOME_WORDS[t]) {
        pushUnique(state.excludeOutcomes, OUTCOME_WORDS[t])
        log(`excluding outcome ${OUTCOME_WORDS[t]}`, t)
        marks[i] = 'consumed'
      } else if (SIDE_WORDS[t]) {
        pushUnique(state.excludeSides, SIDE_WORDS[t])
        log(`excluding side ${SIDE_WORDS[t]}`, t)
        marks[i] = 'consumed'
      } else if (PRESET_WORDS[t]) {
        // A preset RESOLVES to a window, so the window is what gets excluded.
        // Holding the preset name in a second member would light the Clear
        // control while filtering nothing.
        const w = withDatePreset(emptyFilters(), PRESET_WORDS[t], now)
        state = { ...state, excludeDateFrom: w.dateFrom, excludeDateTo: w.dateTo }
        log(`excluding date ${PRESET_WORDS[t]}`, t)
        marks[i] = 'consumed'
      } else if (MISTAKE_FLAG_WORDS.has(t)) {
        state = { ...state, excludeMistakesOnly: true }
        log('excluding trades carrying a mistake', t)
        marks[i] = 'consumed'
      } else if (DNA_WORDS[t]) {
        refusals.push(DNA_REFUSAL)
        marks[i] = 'consumed'
      }
      continue
    }
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

  // THE TWO FLOAT PHRASES, AT THE APP'S OWN THRESHOLD. "low float" and "high
  // float" are how this whole strategy is described and neither resolved to
  // anything. The number comes from LOW_FLOAT_MAX, which is the one the
  // Low-Float Hunter badge has always counted by -- not a number chosen here.
  //
  // A ROW WITH NO FLOAT IS IN NEITHER PHRASE. That is the range predicate's own
  // null rule and it is not being reversed: an unmeasured row is not secretly
  // small. Low plus high plus the never-measured equals the whole book, and the
  // skipped count is reported the way every other range reports it.
  for (const [phrase, bound] of [
    ['low float', 'max'],
    ['high float', 'min'],
  ] as const) {
    pool.push({
      kind: 0,
      key: phrase,
      display: phrase,
      apply: (s, log) => {
        const prev = s.ranges.float ?? { min: null, max: null }
        s.ranges = {
          ...s.ranges,
          float:
            bound === 'max'
              ? { ...prev, max: LOW_FLOAT_MAX }
              : { ...prev, min: HIGH_FLOAT_MIN },
        }
        // THE SAME WORDS EVERY OTHER RANGE USES. "at least" and "at most" say
        // the bound is inclusive; min and max leave the trader to guess.
        log(
          bound === 'min'
            ? `float at least ${HIGH_FLOAT_MIN}`
            : `float at most ${LOW_FLOAT_MAX}`,
        )
      },
    })
  }
  for (const sym of vocab.symbols)
    pool.push({
      kind: SYMBOL_KIND, key: sym.toLowerCase(), display: sym,
      apply: (s, log) => {
        replaceNoteInto(log, 'symbol', sym, s.symbol || null)
        s.symbol = sym
      },
      excludeApply: (s, log) => {
        pushUnique(s.excludeSymbols, sym)
        log(`excluding symbol ${sym}`)
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
  // THE TWO WORDS A MOMENTUM TRADER USES FOR A STATE THE APP ALREADY HAS.
  // Neither appears as, or inside, any vocabulary key on any measured book, so
  // no name of the trader's is shadowed by adding them. Each maps onto the
  // existing MACD state rather than to a threshold invented here, and each logs
  // through the SAME expression the canonical ask uses so the two spellings of
  // one filter cannot print different sentences.
  const MACD_SYNONYMS: Record<string, string> = { bullish: 'positive', bearish: 'negative' }
  for (const [word, value] of Object.entries(MACD_SYNONYMS)) {
    const m = (vocab.macdStates ?? []).find((x) => x.value === value)
    if (!m) continue
    pool.push({
      kind: 7,
      key: word,
      display: m.display,
      apply: (s, log) => {
        pushUnique(s.macdStates, m.value)
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
  }
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
  /** POOL KEYS IN THE NORMALISED ALPHABET, computed once. A key is
   *  user-authored and carries punctuation; the ask has had its stripped by
   *  the tokenizer. Comparing the two directly is not a test that fails, it
   *  is a test that CANNOT pass -- the words already at VOCAB_KEY_ALPHABET.
   *  The span reservation has compared in this alphabet since the E and A
   *  cure; the TIERS never did, and that is the whole of this half. */
  const poolNormalised = pool.map((e) => ({ e, nkey: normaliseKey(e.key) }))

  function candidatesFor(phrase: string): PoolEntry[] {
    const isFiller = phrase.split(' ').every((w) => STOPWORDS.has(w))
    // ONE ALPHABET ON BOTH SIDES. The floors still measure the phrase the
    // trader typed, not the normalised form, so no floor moves.
    const nphrase = normaliseKey(phrase)
    const tiers: ((c: { e: PoolEntry; nkey: string }) => boolean)[] = [
      (c) => c.nkey === nphrase,
      (c) =>
        !isFiller &&
        phrase.length >= (c.e.kind === SYMBOL_KIND ? SYMBOL_PREFIX_FLOOR : PREFIX_FLOOR) &&
        c.nkey.startsWith(nphrase),
      (c) =>
        !isFiller &&
        (phrase.length >= SUBSTRING_FLOOR
          ? c.nkey.includes(nphrase)
          : // BELOW THE SUBSTRING FLOOR, ONLY A WHOLE WORD MAY OFFER.
            phrase.length >= WHOLE_WORD_FLOOR && c.nkey.split(' ').includes(nphrase)),
    ]
    for (const match of tiers) {
      const hits = poolNormalised.filter(match).map((c) => c.e)
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

  /** HOW FAR THE VOCABULARY PASS REACHES. Three was enough while a name
   *  could only ever match a fragment of itself; once both sides share one
   *  alphabet a FOUR word name can match as a whole, and a loop that stops
   *  at three would still hand it to its first token. The reservation has
   *  descended from the book's own longest key since the E and A cure --
   *  this is the same bound, read from the same place, so the two cannot
   *  disagree about how long a name may be. Descending, so the LONGEST name
   *  wins: a short name must never swallow the long one containing it. */
  const spanSequence: number[] = []
  for (let s = Math.max(3, maxKeyTokens); s >= 1; s--) spanSequence.push(s)

  for (let i = 0; i < tokens.length; i++) {
    if (marks[i] !== 'free' || unclaimable[i]) continue
    // v0.2.7 — a NEGATED span is no longer skipped: it resolves the same way an
    // ordinary one does and then routes to the term's EXCLUDE side. The scope
    // rule that decided WHICH tokens are negated is untouched -- this changes
    // only what happens to the term it identified.
    const isNeg = negated[i]
    let matched = false
    for (const span of spanSequence) {
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
        noteKinds(raw, hits)
        ambiguous.push({ text: raw, candidates: hits.map((h) => h.display) })
        break
      }
      if (hits.length === 1) {
        const entry = hits[0]
        // A SUBSTRING hit ASKS. Exact and prefix still apply. Measured: a
        // four-letter ordinary word reaches inside a long vocabulary name --
        // "rate" inside "United Arab Emi-rate-s" filtered a book to twelve
        // trades for a question about halt resumes.
        // ONE ALPHABET HERE TOO. candidatesFor now matches normalised, so a
        // tier recomputed against the RAW key would call every newly reached
        // name a substring and ask about a name the trader typed in full.
        const entryKeyN = normaliseKey(entry.key)
        const phraseN = normaliseKey(phrase)
        const hitTier = entryKeyN === phraseN ? 1 : (entryKeyN.startsWith(phraseN) ? 2 : 3)
        if (hitTier === 3 || (hitTier === 2 && !strongEnoughToApply(phrase, entry.key))) {
          noteKinds(raw, [entry])
          ambiguous.push({ text: raw, candidates: [entry.display] })
          for (let k = 0; k < span; k++) marks[i + k] = 'consumed'
          matched = true
          break
        }
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
        noteKinds(raw, hits)
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
    if (c.negated) {
      // A RANGE TO LEAVE OUT. It writes the exclude map, never `ranges`, and
      // the predicate reads it as the negation of matchesRange -- which is
      // what keeps the never-measured row in the result rather than dropping
      // it, the opposite of what an include range does.
      const prevX = state.excludeRanges[colId] ?? { min: null, max: null }
      state = {
        ...state,
        excludeRanges: { ...state.excludeRanges, [colId]: { ...prevX, [bound]: value } },
      }
      const wordX = bound === 'min' ? 'at least' : 'at most'
      log(`excluding ${colId} ${wordX} ${value}`, c.text)
      continue
    }
    const prev = state.ranges[colId] ?? { min: null, max: null }
    state = {
      ...state,
      ranges: { ...state.ranges, [colId]: { ...prev, [bound]: value } },
    }
    // U4 -- REVERSED BY BEAT ONE HUNDRED EIGHTY-EIGHT, measured by beat one
    // hundred eighty-six. WAS: `${colId} ${bound} ${value}`, which printed
    // the internal words min and max. numericRange documents on its own line
    // thirty-four that BOTH BOUNDS ARE INCLUSIVE, and the predicate on lines
    // forty-nine and fifty uses a strict comparison to achieve it -- so a
    // value EQUAL to the bound is inside. At least and at most say that; min
    // and max leave the trader to guess. THE COMPARISON IS NOT TOUCHED.
    const boundWord = bound === 'min' ? 'at least' : 'at most'
    log(`${colId} ${boundWord} ${value}`, c.text)
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

  // STRICT PARTIAL APPLICATION. If ANY content token went unread, the whole
  // ask applies NOTHING. Stopwords and fillers are already excluded from
  // `unresolved` (they carry marks 'stop'); a token left UNCLAIMABLE by a
  // deliberate refusal is still 'free' and so still counts as unread, which
  // is the point -- refusing to read a word does not license answering the
  // rest of the sentence. Offers survive: the trader is still asked.
  if (unresolved.length > 0) {
    return { state: inherited(), applied: [], appliedSources: [], unresolved, ambiguous }
  }
  // THE ANSWER DESCRIBES THE STATE THAT WAS APPLIED, and claims nothing
  // beyond it. An offer standing alongside is a separate and VISIBLE
  // question about a word the answer did not need.
  //
  // Suppressing the number whenever an offer exists was tried first and
  // measured worse on both counts. On the largest book "my" EXACTLY
  // matches the Malaysia ISO -- the exact tier is not filler-gated, by
  // design -- so an ambiguity is present in almost every sentence there,
  // and suppression deleted the feature on that book entirely. Worse, it
  // left the FILTER applied with no number beside it: the answered-as-a-
  // filter bucket, which this slice exists to empty.
  return { state, applied, appliedSources, unresolved, ambiguous, answer, offerKinds, refusals }
}
