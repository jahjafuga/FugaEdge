// v0.2.5 Phase A — USER profile repo (spec §B identity tables). This is the
// trader's local identity row — NOT the FMP company-profile backfill that
// lives at electron/import/backfill-profile.ts / the PROFILE_BACKFILL*
// channels (those fetch sector/industry for tickers).
//
// Single-row table. getOrCreateProfile seeds it exactly once; member_since
// follows L2 — the earliest non-deleted trade date when trades exist (a
// long-time user's profile says member-since their first journaled trade),
// else today.

import { openDatabase } from '../db/database'
import { newUlid } from '@/core/ids/ulid'
import type { Profile, UpdateProfileInput } from '@shared/identity-types'

interface ProfileDbRow {
  id: string
  display_name: string | null
  handle: string | null
  avatar_data: string | null
  trading_style: string | null
  markets: string | null
  bio: string | null
  featured_badges_json: string
  member_since: string | null
  created_at: string | null
  updated_at: string | null
}

function parseFeatured(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((s) => String(s)) : []
  } catch {
    return []
  }
}

function rowToProfile(r: ProfileDbRow): Profile {
  return {
    id: r.id,
    display_name: r.display_name,
    handle: r.handle,
    avatar_data: r.avatar_data,
    trading_style: r.trading_style,
    markets: r.markets,
    bio: r.bio,
    featured_badges: parseFeatured(r.featured_badges_json),
    member_since: r.member_since,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function getOrCreateProfile(): Profile {
  const db = openDatabase()
  const existing = db.prepare('SELECT * FROM profile LIMIT 1').get() as
    | ProfileDbRow
    | undefined
  if (existing) return rowToProfile(existing)

  // L2 — earliest non-deleted trade date, else today (ISO date).
  const earliest = db
    .prepare('SELECT MIN(date) AS d FROM trades WHERE deleted_at IS NULL')
    .get() as { d: string | null } | undefined
  const memberSince = earliest?.d ?? new Date().toISOString().slice(0, 10)

  const now = new Date().toISOString()
  const id = newUlid()
  db.prepare(
    `INSERT INTO profile (id, featured_badges_json, member_since, created_at, updated_at)
     VALUES (?, '[]', ?, ?, ?)`,
  ).run(id, memberSince, now, now)

  const created = db.prepare('SELECT * FROM profile LIMIT 1').get() as
    | ProfileDbRow
    | undefined
  // The read-back can only miss if something external deleted the row mid-
  // call; reconstruct from what was just written rather than throwing.
  return created
    ? rowToProfile(created)
    : {
        id,
        display_name: null,
        handle: null,
        avatar_data: null,
        trading_style: null,
        markets: null,
        bio: null,
        featured_badges: [],
        member_since: memberSince,
        created_at: now,
        updated_at: now,
      }
}

// Column allow-list for updateProfile — input keys map 1:1 except
// featured_badges, which serializes to featured_badges_json.
const UPDATABLE: Record<string, string> = {
  display_name: 'display_name',
  handle: 'handle',
  avatar_data: 'avatar_data',
  trading_style: 'trading_style',
  markets: 'markets',
  bio: 'bio',
  featured_badges: 'featured_badges_json',
  member_since: 'member_since',
}

export function updateProfile(input: UpdateProfileInput): Profile {
  const db = openDatabase()
  const current = getOrCreateProfile()

  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries(UPDATABLE)) {
    if (!(key in input)) continue
    const raw = (input as Record<string, unknown>)[key]
    sets.push(`${column} = ?`)
    values.push(key === 'featured_badges' ? JSON.stringify(raw ?? []) : raw)
  }
  sets.push('updated_at = ?')
  values.push(new Date().toISOString())

  db.prepare(`UPDATE profile SET ${sets.join(', ')} WHERE id = ?`).run(
    ...values,
    current.id,
  )

  const after = db.prepare('SELECT * FROM profile LIMIT 1').get() as
    | ProfileDbRow
    | undefined
  return after ? rowToProfile(after) : current
}
