// Curated trading-psychology quotes shown in the Today's Session "completed"
// state. Pure module — no I/O, safe to import from any environment.
//
// Categories are theme-based (what the quote is *about*), not state-based.
// The session picker maps the user's current day-context onto a weighted
// subset of themes, so a losing-day picker tends to pull from "losses",
// "psychology", and "risk", while a winning day pulls from "edge" and
// "process". "general" is the always-eligible fallback bucket.

export type QuoteCategory =
  | 'discipline'
  | 'risk'
  | 'psychology'
  | 'patience'
  | 'losses'
  | 'process'
  | 'edge'
  | 'general'

export interface TradingQuote {
  /** Stable index inside the pool — used as the dedup key persisted in
   *  localStorage so the same quote doesn't show twice in a row. */
  id: number
  text: string
  author: string
  category: QuoteCategory
}

export const QUOTES: TradingQuote[] = [
  // ── Mark Douglas ─ psychology / discipline ──────────────────────────
  { id: 0,  text: 'There is no greater edge than the ability to do nothing.', author: 'Mark Douglas', category: 'edge' },
  { id: 1,  text: 'Consistency in your process produces consistency in your results.', author: 'Mark Douglas', category: 'process' },
  { id: 2,  text: 'The market does not generate happy or painful information. It only generates information.', author: 'Mark Douglas', category: 'psychology' },
  { id: 3,  text: 'A loss is the cost of doing business, not evidence that you are wrong.', author: 'Mark Douglas', category: 'losses' },
  { id: 4,  text: 'Thinking in probabilities frees you from the need to be right on any single trade.', author: 'Mark Douglas', category: 'psychology' },

  // ── Jesse Livermore ─ patience / losses / edge ──────────────────────
  { id: 5,  text: 'It was never my thinking that made the big money for me. It always was my sitting.', author: 'Jesse Livermore', category: 'patience' },
  { id: 6,  text: 'Cut your losses short and let your winners run.', author: 'Jesse Livermore', category: 'process' },
  { id: 7,  text: 'A loss never bothers me after I take it. Being wrong and not taking it does the damage.', author: 'Jesse Livermore', category: 'losses' },
  { id: 8,  text: 'There is nothing new in Wall Street. Whatever happens has happened before and will again.', author: 'Jesse Livermore', category: 'general' },
  { id: 9,  text: 'The big money is not in the buying and selling, but in the waiting.', author: 'Jesse Livermore', category: 'patience' },

  // ── Jack Schwager ─ process / risk ──────────────────────────────────
  { id: 10, text: 'The hard work in trading comes in the preparation. The trading itself should be effortless.', author: 'Jack Schwager', category: 'process' },
  { id: 11, text: 'Amateurs think about how much money they can make. Professionals think about how much they can lose.', author: 'Jack Schwager', category: 'risk' },
  { id: 12, text: 'Good traders need good systems. Great traders need the discipline to follow them.', author: 'Jack Schwager', category: 'discipline' },
  { id: 13, text: 'Markets are not random — they are reflexive, driven by participants reacting to each other.', author: 'Jack Schwager', category: 'general' },

  // ── Paul Tudor Jones ─ risk / losses ────────────────────────────────
  { id: 14, text: 'I am always thinking about losing money as opposed to making money.', author: 'Paul Tudor Jones', category: 'risk' },
  { id: 15, text: 'The most important rule of trading is to play great defense, not great offense.', author: 'Paul Tudor Jones', category: 'risk' },
  { id: 16, text: 'Don\'t be a hero. Don\'t have an ego. Always question yourself and your ability.', author: 'Paul Tudor Jones', category: 'psychology' },
  { id: 17, text: 'Where you want to be is always in control, never wishing, always trading.', author: 'Paul Tudor Jones', category: 'discipline' },

  // ── Stanley Druckenmiller ─ edge / process ──────────────────────────
  { id: 18, text: 'The way to build long-term returns is through preservation of capital and home runs.', author: 'Stanley Druckenmiller', category: 'edge' },
  { id: 19, text: 'It takes courage to be a pig — to size up when you know you are right.', author: 'Stanley Druckenmiller', category: 'edge' },
  { id: 20, text: 'Never invest in the present. Invest in where the puck is going, not where it has been.', author: 'Stanley Druckenmiller', category: 'process' },
  { id: 21, text: 'What matters is not whether you are right or wrong, but how much you make when right and how much you lose when wrong.', author: 'George Soros', category: 'edge' },

  // ── Ray Dalio ─ process / psychology ────────────────────────────────
  { id: 22, text: 'He who lives by the crystal ball will eat shattered glass.', author: 'Ray Dalio', category: 'psychology' },
  { id: 23, text: 'Pain plus reflection equals progress.', author: 'Ray Dalio', category: 'process' },
  { id: 24, text: 'The biggest mistake investors make is to believe that what happened recently will keep happening.', author: 'Ray Dalio', category: 'psychology' },
  { id: 25, text: 'Truth — more precisely, an accurate understanding of reality — is the essential foundation for any good outcome.', author: 'Ray Dalio', category: 'general' },

  // ── Ed Seykota ─ discipline / losses ────────────────────────────────
  { id: 26, text: 'If you can\'t take a small loss, sooner or later you will take the mother of all losses.', author: 'Ed Seykota', category: 'losses' },
  { id: 27, text: 'Win or lose, everybody gets what they want out of the market.', author: 'Ed Seykota', category: 'psychology' },
  { id: 28, text: 'Pyramid your winners, never your losers.', author: 'Ed Seykota', category: 'process' },
  { id: 29, text: 'The trading rules I live by are: cut losses, ride winners, keep bets small, follow the rules.', author: 'Ed Seykota', category: 'discipline' },

  // ── Bruce Kovner ─ risk ─────────────────────────────────────────────
  { id: 30, text: 'I know where I am getting out before I get in.', author: 'Bruce Kovner', category: 'risk' },
  { id: 31, text: 'Novice traders trade five to ten times too big — taking 5–10% risk on a trade they should be risking 1–2% on.', author: 'Bruce Kovner', category: 'risk' },
  { id: 32, text: 'Don\'t get caught in a situation where you can lose a great deal of money for reasons you don\'t understand.', author: 'Bruce Kovner', category: 'risk' },

  // ── Linda Raschke ─ patience / process ──────────────────────────────
  { id: 33, text: 'Patience is one of the most important qualities of a successful trader.', author: 'Linda Raschke', category: 'patience' },
  { id: 34, text: 'I would rather miss a trade than chase a bad one.', author: 'Linda Raschke', category: 'patience' },
  { id: 35, text: 'You have to learn to take a loss, and not let it affect the next trade.', author: 'Linda Raschke', category: 'losses' },
  { id: 36, text: 'The market will tell you when to trade. Don\'t force it.', author: 'Linda Raschke', category: 'patience' },
  { id: 37, text: 'Showing up every day is 80% of trading.', author: 'Linda Raschke', category: 'process' },

  // ── Marty Schwartz ─ discipline / psychology ────────────────────────
  { id: 38, text: 'Learn to take losses. The most important thing in making money is not letting your losses get out of hand.', author: 'Marty Schwartz', category: 'losses' },
  { id: 39, text: 'I always laugh at people who say, "I have never met a rich technician." I love that — it is such an arrogant, nonsensical response.', author: 'Marty Schwartz', category: 'general' },
  { id: 40, text: 'Before taking a position, always know the amount you are willing to lose.', author: 'Marty Schwartz', category: 'risk' },
  { id: 41, text: 'After a devastating loss, I always play very small and try to get black ink, black ink.', author: 'Marty Schwartz', category: 'psychology' },

  // ── Richard Dennis ─ process / edge ─────────────────────────────────
  { id: 42, text: 'I have always said you could publish my trading rules in the newspaper and no one would follow them.', author: 'Richard Dennis', category: 'discipline' },
  { id: 43, text: 'Trading has taught me not to take the conventional wisdom for granted.', author: 'Richard Dennis', category: 'edge' },
  { id: 44, text: 'You should expect the unexpected; expect the extreme. Don\'t trade in the middle.', author: 'Richard Dennis', category: 'process' },
  { id: 45, text: 'A good trend-follower will catch big moves and pay small premiums in losers.', author: 'Richard Dennis', category: 'edge' },

  // ── William O'Neil ─ process / discipline ───────────────────────────
  { id: 46, text: 'The whole secret to winning in the stock market is to lose the least amount possible when you are not right.', author: 'William O\'Neil', category: 'losses' },
  { id: 47, text: 'What seems too high and risky to the majority generally goes higher and what seems low and cheap generally goes lower.', author: 'William O\'Neil', category: 'general' },
  { id: 48, text: 'Letting losses run is the most serious mistake made by most investors.', author: 'William O\'Neil', category: 'losses' },
  { id: 49, text: 'You must be willing to make mistakes regularly; there is nothing wrong with it. The key is recognizing them quickly.', author: 'William O\'Neil', category: 'process' },

  // ── Nicolas Darvas ─ patience / process ─────────────────────────────
  { id: 50, text: 'There are no good stocks or bad stocks; there are only stocks that go up and stocks that go down.', author: 'Nicolas Darvas', category: 'general' },
  { id: 51, text: 'I have no fixed rule about when to take profits. But I do have a fixed rule about losses.', author: 'Nicolas Darvas', category: 'discipline' },
  { id: 52, text: 'I knew now that what I had to do was much more difficult than I had thought: I had to be patient.', author: 'Nicolas Darvas', category: 'patience' },

  // ── Larry Williams ─ risk / edge ────────────────────────────────────
  { id: 53, text: 'Of all my technical tools, I rate proper money management as the most important.', author: 'Larry Williams', category: 'risk' },
  { id: 54, text: 'Discipline is doing the boring thing on the hundredth trade exactly as you did on the first.', author: 'Trading wisdom', category: 'discipline' },
  { id: 55, text: 'Forget about what the market will do — focus on what you will do in response.', author: 'Larry Williams', category: 'process' },

  // ── Van Tharp ─ psychology / risk ───────────────────────────────────
  { id: 56, text: 'You do not trade the markets. You trade your beliefs about the markets.', author: 'Van Tharp', category: 'psychology' },
  { id: 57, text: 'Position sizing is the part of your trading system that tells you how many shares to take per trade.', author: 'Van Tharp', category: 'risk' },
  { id: 58, text: 'There are six keys to successful trading, and the most important is position sizing.', author: 'Van Tharp', category: 'risk' },

  // ── Brett Steenbarger ─ psychology / process ────────────────────────
  { id: 59, text: 'The best traders take the fewest, highest-quality trades.', author: 'Brett Steenbarger', category: 'patience' },
  { id: 60, text: 'The market rewards process, not predictions.', author: 'Brett Steenbarger', category: 'process' },
  { id: 61, text: 'The best traders are the best losers.', author: 'Brett Steenbarger', category: 'losses' },
  { id: 62, text: 'In trading, as in life, patience is a virtue. Impatience is fatal.', author: 'Brett Steenbarger', category: 'patience' },
  { id: 63, text: 'Self-mastery precedes market mastery.', author: 'Brett Steenbarger', category: 'psychology' },

  // ── Original / distilled ─ discipline / process / patience / risk ──
  { id: 64, text: 'No setup, no trade. The waiting is the work.', author: 'Trading wisdom', category: 'discipline' },
  { id: 65, text: 'Be the trader who hits singles. Strikeouts are what blow up accounts.', author: 'Trading wisdom', category: 'process' },
  { id: 66, text: 'Take the A+ setups and skip the rest. Boredom is part of the job.', author: 'Trading wisdom', category: 'patience' },
  { id: 67, text: 'Risk is the admission price. Size it so the ticket never costs more than the show is worth.', author: 'Trading wisdom', category: 'risk' },
  { id: 68, text: 'Survive until you thrive. Stay in the game long enough and the skill has time to catch up to your ambition.', author: 'Trading wisdom', category: 'discipline' },
  { id: 69, text: 'This is a marathon, not a sprint. One green month is a data point, not a verdict. Let the years tell your story.', author: 'Trading wisdom', category: 'process' },
  { id: 70, text: 'Want keeps you patient. Desperation makes you force trades. Protect the difference between the two.', author: 'Trading wisdom', category: 'psychology' },
  { id: 71, text: 'A big loss costs you twice: once on the day, and again in the smaller, scared trades that follow it.', author: 'Trading wisdom', category: 'losses' },
  { id: 72, text: 'Stair-step your size. Prove the smaller version works before you fund the bigger one.', author: 'Trading wisdom', category: 'discipline' },
  { id: 73, text: 'Skill is maybe thirty percent of this. The rest is the mind you bring to the screen each morning.', author: 'Trading wisdom', category: 'psychology' },
  { id: 74, text: "The most dangerous account is the one telling you it's fine. Check in before the market checks you.", author: 'Trading wisdom', category: 'psychology' },
  { id: 75, text: 'Quitting a losing trade on time is a skill, not a failure. Knowing when to fold is its own edge.', author: 'Trading wisdom', category: 'edge' },
  { id: 76, text: "You're betting on probabilities, not certainties. A good decision can still lose, and a bad one can still win.", author: 'Trading wisdom', category: 'psychology' },
]

// Map a day-context onto the categories whose quotes should be eligible.
// Returned categories are weighted equally — the picker randomizes within
// the union of their quote pools.

export type DayContext =
  | 'no-trade'
  | 'winning'
  | 'losing'
  | 'mixed'
  | 'journal-only'

export function categoriesFor(ctx: DayContext): QuoteCategory[] {
  switch (ctx) {
    case 'no-trade':     return ['patience', 'process']
    case 'winning':      return ['edge', 'process', 'general']
    case 'losing':       return ['losses', 'psychology', 'risk']
    case 'mixed':        return ['discipline', 'process']
    case 'journal-only': return ['discipline', 'patience']
  }
}

/** Pick a quote whose category matches the context, avoiding `excludeId`
 *  so the same quote doesn't appear back-to-back. Deterministic-ish:
 *  caller supplies a `nonce` (typically Date.now() or a counter) so unit
 *  tests can pin it. */
export function pickQuoteForContext(
  ctx: DayContext,
  excludeId: number | null,
  nonce: number = Date.now(),
): TradingQuote {
  const cats = new Set(categoriesFor(ctx))
  const pool = QUOTES.filter((q) => cats.has(q.category) && q.id !== excludeId)
  // If the only matching quote is the excluded one (tiny edge case for
  // categories with a single entry), fall back to the full pool minus the
  // excluded id.
  const eligible = pool.length > 0 ? pool : QUOTES.filter((q) => q.id !== excludeId)
  const idx = Math.abs(Math.floor(nonce)) % eligible.length
  return eligible[idx]
}

/** Derive the right context from the today-session state. */
export function contextFor({
  status,
  netPnL,
  hasJournalEntry,
}: {
  status: 'active' | 'no-trade' | 'not-started'
  netPnL: number | null
  hasJournalEntry: boolean
}): DayContext {
  if (status === 'no-trade') return 'no-trade'
  if (status === 'active') {
    if (netPnL == null || netPnL === 0) return 'mixed'
    return netPnL > 0 ? 'winning' : 'losing'
  }
  // 'not-started' that reached a committed state must be a journal-only
  // day (no trades, no no-trade-day flag, but journal content present).
  if (hasJournalEntry) return 'journal-only'
  return 'mixed'
}

/** Stable per-date seed — a deterministic hash of a YYYY-MM-DD string, so the
 *  same calendar day always yields the same nonce (the quote stays put all day
 *  across reloads/saves, and rolls to a new one the next calendar day). */
export function dateSeed(dateISO: string): number {
  let h = 0
  for (let i = 0; i < dateISO.length; i++) {
    h = (Math.imul(h, 31) + dateISO.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** The day-pinned "quote of the day" for a calendar date + context.
 *  Deterministic: the same (dateISO, ctx) always returns the same quote
 *  (stable across reloads/saves), rolling to a new one the next day. Context
 *  still picks the category SET; the date hash indexes within it. No dedup
 *  (excludeId null) — determinism, not rotation, is the point here. */
export function quoteForDate(dateISO: string, ctx: DayContext): TradingQuote {
  return pickQuoteForContext(ctx, null, dateSeed(dateISO))
}
