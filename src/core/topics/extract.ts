// Honest, local topic extraction for the Journal — pure string matching: no AI
// model, no API, no network. This file could run unchanged inside a Next.js page
// (no electron/fs/sqlite imports), per the architecture rules.
//
// HONESTY: surface ONLY terms that literally appear in the text. Never infer,
// never invent. Under-matching (missing an unusual phrasing) is acceptable;
// over-matching (a false positive on a substring or an article) is not.

export type TopicCategory = 'ticker' | 'setup' | 'term'

export interface TopicMatch {
  /** Canonical display form: an uppercase ticker, the setup's own name, or the
   *  curated term's canonical casing. */
  term: string
  category: TopicCategory
}

/** A curated term. A bare string matches only itself; the object form accepts
 *  several phrasings ("followed the plan", "stuck to plan", …) that all surface
 *  as ONE canonical chip. Single-word terms stay trivial as bare strings. */
export type CuratedTerm = string | { canonical: string; variants: string[] }

export interface TopicVocab {
  /** The day's traded symbols (uppercase), e.g. dayTrades.map(t => t.symbol). */
  tickers: string[]
  /** The user's playbook/setup names, e.g. playbooksList().map(p => p.name). */
  setups: string[]
  /** Curated process / psychology / structure terms (see ./terms). */
  terms: CuratedTerm[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// A curated term or setup is "present" when it appears as a whole word / phrase,
// case-insensitively. The \b anchors stop "discipline" matching inside
// "undisciplined" and "gap" matching inside "gapped".
function phrasePresent(text: string, phrase: string): boolean {
  const trimmed = phrase.trim()
  if (!trimmed) return false
  return new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'i').test(text)
}

// A bare string is its own single variant — single-word terms stay trivial in
// the list; only multi-word concepts enumerate their accepted phrasings.
function normalizeTerm(t: CuratedTerm): { canonical: string; variants: string[] } {
  return typeof t === 'string' ? { canonical: t, variants: [t] } : t
}

// Ticker candidates in the prose: an optional leading $ then a letter-led token,
// not glued to other word characters. Case-sensitivity is enforced downstream by
// comparing the RAW candidate against the (uppercase) vocab — so "AAPL" hits but
// "aapl" and the article "in" do not, even when "IN" is a real ticker.
const TICKER_CANDIDATE = /(?<![A-Za-z0-9])(\$?)([A-Za-z][A-Za-z0-9.]*)(?![A-Za-z0-9])/g

function tickerMatches(text: string, tickers: string[]): string[] {
  const vocab = new Set(tickers.filter((t) => t && t.trim().length > 0))
  if (vocab.size === 0) return []
  const found: string[] = []
  for (const m of text.matchAll(TICKER_CANDIDATE)) {
    const hadDollar = m[1] === '$'
    const symbol = m[2]
    if (!vocab.has(symbol)) continue // case-sensitive: "aapl" / "in" never hit
    // A bare single letter (no $) is almost always a word or an initial ("I",
    // "A"), not a ticker — require the $ to disambiguate ("$F").
    if (symbol.length === 1 && !hadDollar) continue
    found.push(symbol)
  }
  return found
}

/**
 * Extract the topics that LITERALLY appear in `text`, drawn from the supplied
 * vocabulary. Returns canonical-cased, de-duplicated matches in a stable order:
 * tickers, then setups, then curated terms (each in vocab order). Empty / blank
 * text → []; nothing found → []. Pure and synchronous.
 */
export function extractTopics(text: string, vocab: TopicVocab): TopicMatch[] {
  if (!text || !text.trim()) return []
  const out: TopicMatch[] = []
  const seen = new Set<string>()

  const push = (term: string, category: TopicCategory): void => {
    const key = `${category}|${term.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ term, category })
  }

  for (const symbol of tickerMatches(text, vocab.tickers)) push(symbol, 'ticker')
  for (const setup of vocab.setups) if (phrasePresent(text, setup)) push(setup, 'setup')
  for (const t of vocab.terms) {
    const { canonical, variants } = normalizeTerm(t)
    // Any accepted phrasing → the single canonical chip. push() dedups by
    // canonical, so a variant + the canonical in one entry collapse to one.
    if (variants.some((v) => phrasePresent(text, v))) push(canonical, 'term')
  }

  return out
}
