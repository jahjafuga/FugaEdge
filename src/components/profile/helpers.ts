// v0.2.5 Phase B Session 4 — pure display helpers for the profile page.
// No React, no DOM: testable as plain functions.

import { LEVEL_CAP } from '@/core/xp/curve'

/** L23 — ring progress fraction. Full at the level cap (neededForNext is 0
 *  there by levelProgress's contract); 0 on a defensive zero denominator. */
export function ringFraction(
  intoLevel: number,
  neededForNext: number,
  level: number,
): number {
  if (level >= LEVEL_CAP) return 1
  const total = intoLevel + neededForNext
  if (total <= 0) return 0
  return intoLevel / total
}

/** Whole-dollar display for equity figures — "$1,000,000": rounded, comma-
 *  grouped, no decimals. The SINGLE formatter shared by the equity goal card
 *  and the equity preset chips — the only two /profile surfaces permitted to
 *  show journal-P&L dollar text (D25/L28 named exception, 2026-06-13). */
export function fmtDollars(n: number): string {
  return `$${Math.round(n).toLocaleString()}`
}

/** L21 — initials for the no-avatar disc: first letters of the first two
 *  words of display_name, uppercased. null when there is no usable name —
 *  the caller renders a neutral icon disc instead. */
export function initialsFrom(displayName: string | null): string | null {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}
