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
} as const
