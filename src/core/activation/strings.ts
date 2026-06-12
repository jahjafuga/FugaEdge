// v0.2.5 §C — every user-facing string for the activation feature (D16:
// per-feature strings module; no i18n library this release, extraction
// later becomes mechanical). Brand voice: direct, technical, peer-to-peer,
// no hype, no exclamation marks.

import type { VerifyFailureReason } from './verify'

/** R3 — "Request access" target. One constant; opened via APP_OPEN_EXTERNAL. */
export const REQUEST_ACCESS_URL = 'https://x.com/fugaedge'

export const ACTIVATION_STRINGS = {
  title: 'FugaEdge is invite-only',
  pitch:
    'Paste your access key to unlock the app. Keys are issued personally — ' +
    'if you were sent one, it starts with FUGA-.',
  inputPlaceholder: 'FUGA-…',
  inputLabel: 'Access key',
  activate: 'Activate',
  activating: 'Verifying…',
  requestAccess: 'Request access',
  notNow: 'Not now',

  // Locked mode (post-grace) — same screen, plus working exports (R1).
  lockedTitle: 'Access key needed',
  lockedBody:
    'The 14-day grace window has ended. The app unlocks the moment a key ' +
    'is entered — nothing has been deleted or changed.',
  dataYours:
    'Your data is yours. Every export below works right now, key or no key.',
  exportTrades: 'Export trades CSV',
  exportJournal: 'Export journal JSON',
  exportBackup: 'Back up database',
  exportSaved: (path: string) => `Saved — ${path}`,
  exportFailed: (message: string) => `Export failed: ${message}`,

  // Grace banner (AppLayout-level, UpdateBanner placement).
  graceBanner: (days: number) =>
    `Access key needed — ${days} day${days === 1 ? '' : 's'} left`,
  graceBannerBody:
    'FugaEdge stays fully functional during the grace window. Enter your ' +
    'key any time.',
  graceCta: 'Enter key',

  errors: {
    'malformed-key':
      'That does not look like a FugaEdge key — keys start with FUGA- and ' +
      'contain one dot. Check that the whole key was pasted.',
    'bad-signature':
      'The key failed its signature check. Check for missing characters, ' +
      'or request a fresh key.',
    'bad-payload':
      'The key verified but its contents are unreadable — request a fresh key.',
    'verify-error':
      'Could not run the verifier on this machine. Restart the app and try again.',
  } satisfies Record<VerifyFailureReason, string>,
  saveFailed:
    'The key verified but saving it failed — try Activate again.',
} as const
