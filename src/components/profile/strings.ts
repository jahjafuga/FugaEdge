// v0.2.5 Phase B Session 4 — all profile-page copy (D16 i18n-readiness
// convention: new UI copy lives in per-feature strings modules; extraction
// later becomes mechanical). NO P&L language anywhere on this page.

export const profileStrings = {
  subtitle:
    'Your trader identity — the process record behind your journal.',

  identity: {
    heading: 'Identity',
    displayNameLabel: 'Display name',
    displayNamePlaceholder: 'How should we greet you?',
    handleLabel: 'Handle',
    handlePlaceholder: '@handle',
    styleLabel: 'Trading style',
    styleOptions: {
      'small-cap': 'Small-cap momentum',
      'large-cap': 'Large-cap momentum',
      mixed: 'Mixed / both',
      unset: 'Not set',
    },
    marketsLabel: 'Markets',
    marketsPlaceholder: 'e.g. US equities, premarket movers',
    bioLabel: 'Bio',
    bioPlaceholder: 'A line about how you trade.',
    save: 'Save changes',
    saving: 'Saving…',
    saved: 'Saved',
    unnamed: 'Unnamed trader',
  },

  avatar: {
    add: 'Add photo',
    change: 'Change photo',
    processing: 'Processing…',
    tooLarge: 'That image is still too large after processing — try a smaller one.',
    readError: 'Could not read that image — try a different file.',
  },

  level: {
    heading: 'Level',
    ringLabel: 'LVL',
    xpUnit: 'XP',
    toNextTemplate: 'to next level', // rendered after the remaining-XP number
    maxLevel: 'Max level reached',
  },

  streak: {
    heading: 'Journaling streak',
    currentLabel: 'Current',
    dayUnit: 'days',
    dayUnitSingular: 'day',
    longestLabel: 'Longest',
    freezesLabel: 'Freezes banked',
    freezeHint:
      'Earned every 30 journaled days — one freeze bridges one missed day.',
    emptyHint: 'Journal a trading day (tag every trade + rate the session) to start a streak.',
  },

  memberSinceLabel: 'Member since',

  // ── Goals (Session 5 — L28/L32/L33). Broadcast-grade copy: direct,
  // technical, peer-to-peer; no exclamation marks. ──────────────────────
  goals: {
    heading: 'Challenges',
    newGoal: 'New challenge',
    startedPrefix: 'Started',
    completedHeading: 'Completed',
    abandonAction: 'Abandon',
    abandonTitle: 'Abandon this challenge?',
    abandonBody:
      'It moves out of your active list. The work you logged stays in the ledger.',
    abandonConfirm: 'Abandon challenge',
    // Goal identity icons live in ./goals/icons.ts now — flat lucide, gold-
    // tinted (D26 grammar), shared by the preset chips and the goal cards. The
    // OS-emoji glyphs were retired in the iteration-4 live-look (founder ruling).
    corruptProgress: '—',
    percentSuffix: '%',
    empty: {
      headline: 'Start your first challenge',
      body: 'Pick a process target — days journaled, trades annotated, disciplined entries — and let the ledger keep score.',
      action: 'New challenge',
    },
    create: {
      title: 'New challenge',
      presetsLabel: 'Start from a preset',
      presetTitles: {
        'journal-30': 'Journal 30 Days',
        'annotation-century': 'Annotation Century',
        'discipline-week': 'Discipline Week',
        'review-ritual': 'Review Ritual',
        'equity-grow-base': 'Grow the Base',
        'equity-million': 'Make a Million',
      } as Record<string, string>,
      presetMeta: {
        journaled_days: 'journaled days',
        weekly_reviews: 'weekly reviews',
        annotated_trades: 'annotated trades',
        disciplined_entries: 'disciplined entries',
      } as Record<string, string>,
      // Equity-chip meta RENDERS the dollar target — the NAMED L28 exception
      // (founder ruling 2026-06-13): journal-P&L dollar text is permitted
      // inside equity preset chips and equity goal cards, and nowhere else on
      // /profile. The amount comes from the shared fmtDollars formatter (config
      // carries the numbers); absolute presets show just the target
      // ("$1,000,000"), delta presets append this suffix ("+$1,000 from your
      // start") — the delta is start-agnostic, so no personal figure leaks.
      presetDeltaSuffix: 'from your start',
      kindLabel: 'Kind',
      kindProcess: 'Process',
      kindEquity: 'Equity',
      titleLabel: 'Title',
      titlePlaceholder: 'Name the challenge',
      metricLabel: 'Metric',
      targetLabel: 'Target',
      startDateLabel: 'Start date',
      startAmountLabel: 'Starting amount',
      targetAmountLabel: 'Target amount',
      submit: 'Create challenge',
      submitting: 'Creating…',
      equityNote:
        'Equity challenges track account growth from the start date. They earn a badge on completion — never XP.',
    },
  },

  // ── Badges (Session 6 — the wall + featured-3 picker). The wall shows the
  // whole catalog: earned in gold, locked dimmed with the threshold hint, so
  // it reads as a goal board from day one even before threshold-minting ships.
  badges: {
    heading: 'Badges',
    featuredHeading: 'Featured',
    emptyFeatured: 'Pick up to 3 earned badges to feature on your profile.',
    earnedWord: 'earned', // "{n} of {total} earned"
    pickHint: 'Tap an earned badge to feature it — up to 3.',
    capReached: 'Featured is full — unfeature one first.',
    locked: 'Locked',
    tierLabels: { copper: 'Copper', silver: 'Silver', gold: 'Gold' } as Record<
      string,
      string
    >,
    categoryLabels: {
      process: 'Process',
      milestone: 'Milestones',
      challenge: 'Challenges',
    } as Record<string, string>,
  },
} as const
