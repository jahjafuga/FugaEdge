// Weekly pattern memory — pure cross-entry aggregation for the Weekly Review.
// Reuses the Phase-4 per-entry matcher (./extract) over a week's entries and
// tallies recurrence. No AI, no model, no network, no storage. Could run
// unchanged inside a Next.js page (zero electron/fs/sqlite imports).
//
// WELLBEING: this is reflect-and-support, not a scoreboard. It counts terms the
// trader actually WROTE and groups them so strengths (process) are surfaced as
// readily as struggles (pitfall); structure is neutral context. Honest: only
// real matches, [] for a sparse week — never a fabricated pattern.

import { extractTopics, type TopicCategory, type TopicMatch, type TopicVocab } from './extract'
import { TERM_GROUP, type TermGroup } from './terms'

/** One week entry's free text (the two journal fields). */
export interface WeekEntryText {
  premarket: string
  postsession: string
}

export interface TopicCount {
  /** Canonical display form (uppercase ticker, setup name, or curated term). */
  term: string
  category: TopicCategory
  /** Balanced-view bucket. Curated terms carry their authored group; tickers and
   *  setups are neutral context, so they land in 'structure'. */
  group: TermGroup
  /** Number of ENTRIES that mentioned this term (NOT total occurrences) — a
   *  term written three times in one entry counts once, because extractTopics
   *  already dedups per entry. Recurrence across days is the pattern signal. */
  count: number
}

// The strengths/struggles split is meaningful only for the curated psychology /
// process vocabulary. Tickers (AAPL) and setups (Bull Flag) are neutral facts
// about the week, so they sit in the neutral 'structure' context bucket.
function groupOf(match: TopicMatch): TermGroup {
  if (match.category === 'term') return TERM_GROUP[match.term] ?? 'structure'
  return 'structure'
}

/**
 * Aggregate the topics across a week's entries into grouped recurrence counts.
 * For each entry, runs the Phase-4 matcher over `premarket + postsession` and
 * counts how many ENTRIES mention each canonical term. Returns one TopicCount
 * per distinct term, in first-appearance order. Empty / no-match week → [].
 * Pure and synchronous.
 */
export function aggregateWeekTopics(
  entries: WeekEntryText[],
  vocab: TopicVocab,
): TopicCount[] {
  const counts = new Map<string, TopicCount>()
  for (const entry of entries) {
    const text = `${entry.premarket}\n${entry.postsession}`
    // extractTopics dedups within the entry, so each canonical contributes at
    // most one to that entry's tally — the +1 below is therefore per-entry.
    for (const match of extractTopics(text, vocab)) {
      const key = `${match.category}|${match.term.toLowerCase()}`
      const existing = counts.get(key)
      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, {
          term: match.term,
          category: match.category,
          group: groupOf(match),
          count: 1,
        })
      }
    }
  }
  return [...counts.values()]
}
