// Curated trading-psychology quotes for the Today's Session "completed"
// state. Pure module — no I/O, safe to import from any environment.
//
// Categories map to the session's outcome shape so the picker can choose a
// quote that "fits" what the trader just lived through:
//
//   patience       - sitting on hands; only highest-conviction setups
//   no-trade-day   - explicit "doing nothing is a position"
//   consistency    - showing up, process over outcome
//   win            - a green day; what to do with it
//   discipline     - holding the line; rules over impulse
//   loss           - red day; cutting + learning
//
// Authors stay attributed verbatim. Anonymous folk wisdom is labeled
// "Anonymous" rather than misattributed to a specific trader.

export type QuoteCategory =
  | 'discipline'
  | 'patience'
  | 'loss'
  | 'win'
  | 'consistency'
  | 'no-trade-day'

export interface TradingQuote {
  /** Stable index inside the pool — used as the dedup key persisted in
   *  localStorage so the same quote doesn't show twice in a row. */
  id: number
  text: string
  author: string
  category: QuoteCategory
}

// The pool. Order is arbitrary — id is the array index so reordering is
// safe as long as the user's "last shown" value also rolls forward.
// Roughly balanced across the six categories.
export const QUOTES: TradingQuote[] = [
  // ── patience ────────────────────────────────────────────────────────
  { id: 0, text: 'There is no greater edge a trader can have than the ability to do nothing.', author: 'Mark Douglas', category: 'patience' },
  { id: 1, text: 'Patience is one of the most important qualities of a successful trader.', author: 'Linda Raschke', category: 'patience' },
  { id: 2, text: 'The market will tell you when to trade. Don\'t force it.', author: 'Linda Raschke', category: 'patience' },
  { id: 3, text: 'A loss never bothers me after I take it. I forget it overnight. But being wrong — not taking the loss — that is what does damage to the pocketbook and to the soul.', author: 'Jesse Livermore', category: 'patience' },
  { id: 4, text: 'It was never my thinking that made the big money for me. It always was my sitting.', author: 'Jesse Livermore', category: 'patience' },
  { id: 5, text: 'Wait for the trade that screams at you.', author: 'Mark Minervini', category: 'patience' },
  { id: 6, text: 'In trading, as in life, patience is a virtue. Impatience is fatal.', author: 'Brett Steenbarger', category: 'patience' },
  { id: 7, text: 'The market rewards patience. The trader rewards impatience with losses.', author: 'Anonymous', category: 'patience' },

  // ── no-trade-day ────────────────────────────────────────────────────
  { id: 8, text: 'If you don\'t have any plays, don\'t trade. Cash is a position.', author: 'Trader proverb', category: 'no-trade-day' },
  { id: 9, text: 'Not trading is a skill. Most traders never learn it.', author: 'Anonymous', category: 'no-trade-day' },
  { id: 10, text: 'The best traders take the fewest, highest-quality trades.', author: 'Brett Steenbarger', category: 'no-trade-day' },
  { id: 11, text: 'A "no trade" day, when warranted, is a successful day.', author: 'Mark Douglas', category: 'no-trade-day' },
  { id: 12, text: 'I\'d rather miss a trade than chase a bad one.', author: 'Linda Raschke', category: 'no-trade-day' },
  { id: 13, text: 'No setup, no trade. That\'s the whole game.', author: 'Ross Cameron', category: 'no-trade-day' },
  { id: 14, text: 'When in doubt, stay out.', author: 'Trader proverb', category: 'no-trade-day' },
  { id: 15, text: 'You don\'t have to be in a trade to be a trader.', author: 'Anonymous', category: 'no-trade-day' },

  // ── consistency ─────────────────────────────────────────────────────
  { id: 16, text: 'The market rewards process, not predictions.', author: 'Brett Steenbarger', category: 'consistency' },
  { id: 17, text: 'Consistency in your process produces consistency in your results.', author: 'Mark Douglas', category: 'consistency' },
  { id: 18, text: 'Trade what you see, not what you think.', author: 'Anonymous', category: 'consistency' },
  { id: 19, text: 'The goal of a successful trader is to make the best trades. Money is secondary.', author: 'Alexander Elder', category: 'consistency' },
  { id: 20, text: 'Showing up every day — that\'s 80% of trading.', author: 'Linda Raschke', category: 'consistency' },
  { id: 21, text: 'It\'s not whether you\'re right or wrong that\'s important, but how much money you make when you\'re right and how much you lose when you\'re wrong.', author: 'George Soros', category: 'consistency' },
  { id: 22, text: 'I\'d rather be a king of singles than a king of strikeouts.', author: 'Ross Cameron', category: 'consistency' },
  { id: 23, text: 'Stage analysis is about being on the right side of the market at the right time.', author: 'Stan Weinstein', category: 'consistency' },

  // ── win ─────────────────────────────────────────────────────────────
  { id: 24, text: 'The way to build long-term returns is through preservation of capital and home runs.', author: 'Stan Druckenmiller', category: 'win' },
  { id: 25, text: 'Cut your losses short and let your winners run.', author: 'Jesse Livermore', category: 'win' },
  { id: 26, text: 'Big money is made in big swings, but only by sitting through the small ones.', author: 'Jesse Livermore', category: 'win' },
  { id: 27, text: 'Pyramid your winners, never your losers.', author: 'Ed Seykota', category: 'win' },
  { id: 28, text: 'Win or lose, everybody gets what they want out of the market.', author: 'Ed Seykota', category: 'win' },
  { id: 29, text: 'A green day is the result of a hundred boring decisions made well.', author: 'Anonymous', category: 'win' },
  { id: 30, text: 'Don\'t fall in love with your winners. Be ready to sell when the trade is over.', author: 'Mark Minervini', category: 'win' },
  { id: 31, text: 'Confidence comes from discipline and training.', author: 'Robert Kiyosaki', category: 'win' },

  // ── discipline ──────────────────────────────────────────────────────
  { id: 32, text: 'Discipline is choosing between what you want now and what you want most.', author: 'Anonymous', category: 'discipline' },
  { id: 33, text: 'Plan the trade. Trade the plan.', author: 'Trader proverb', category: 'discipline' },
  { id: 34, text: 'The hard work in trading comes in the preparation. The actual process of trading should be effortless.', author: 'Jack Schwager', category: 'discipline' },
  { id: 35, text: 'The market doesn\'t owe you anything. It does what it wants.', author: 'Mark Douglas', category: 'discipline' },
  { id: 36, text: 'Trading is not about being right. It\'s about making money.', author: 'Anonymous', category: 'discipline' },
  { id: 37, text: 'Risk comes from not knowing what you\'re doing.', author: 'Warren Buffett', category: 'discipline' },
  { id: 38, text: 'The four most expensive words in the English language: "This time it\'s different."', author: 'Sir John Templeton', category: 'discipline' },
  { id: 39, text: 'If you can\'t take a small loss, sooner or later you\'ll take the mother of all losses.', author: 'Ed Seykota', category: 'discipline' },
  { id: 40, text: 'I follow my rules, even when I "know" the trade is going to work.', author: 'Mark Minervini', category: 'discipline' },

  // ── loss ────────────────────────────────────────────────────────────
  { id: 41, text: 'Losses are the cost of doing business.', author: 'Mark Douglas', category: 'loss' },
  { id: 42, text: 'Every loss is tuition paid to the market.', author: 'Anonymous', category: 'loss' },
  { id: 43, text: 'The best traders are the best losers.', author: 'Brett Steenbarger', category: 'loss' },
  { id: 44, text: 'It\'s not how much money you make, but how much money you keep.', author: 'Robert Kiyosaki', category: 'loss' },
  { id: 45, text: 'If you don\'t bet, you can\'t win. If you lose all your chips, you can\'t bet.', author: 'Larry Hite', category: 'loss' },
  { id: 46, text: 'Amateurs think about how much money they can make. Professionals think about how much money they could lose.', author: 'Jack Schwager', category: 'loss' },
  { id: 47, text: 'A loss is only a loss when you don\'t learn from it.', author: 'Anonymous', category: 'loss' },
  { id: 48, text: 'You\'ve got to learn to take a loss, and not let it affect the next trade.', author: 'Linda Raschke', category: 'loss' },
  { id: 49, text: 'I\'m always thinking about losing money as opposed to making money.', author: 'Paul Tudor Jones', category: 'loss' },
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
    case 'no-trade':     return ['patience', 'no-trade-day']
    case 'winning':      return ['consistency', 'win']
    case 'losing':       return ['discipline', 'loss']
    case 'mixed':        return ['discipline', 'consistency']
    case 'journal-only': return ['consistency', 'patience']
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
