// v0.2.5 Phase B Session 4 — the profile page (spec §B/§G; L17-L23). First
// visible surface of the release. THE PAGE GROWS BY SESSION (L18/D24): S4
// ships identity + avatar + level ring + XP progress + streak + member-since
// ONLY — no placeholder sections; S5 adds goals, S6 badges, Phase D the Edge
// Score. Data is fetched on route mount (D24 — no push channel; a single-
// window app cannot be on /profile and mutating trades simultaneously).
// NO P&L anywhere on this page, by design and by smoke.
//
// Profile redesign (Slice 1) — identity/avatar/level/XP unified into the
// ProfileHero band at the top; the standalone Level card is dissolved into it.
// The card below the hero is the editable identity FORM; Streak is enriched.
// All cards use the card-premium idiom. Presentation/layout only — no change
// to data wiring or XP/level/streak logic.

import { useEffect, useState } from 'react'
import { Flame, Snowflake } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import { ipc } from '@/lib/ipc'
import type { Profile as ProfileRow, BadgeAward, NewlyMinted } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'
import type { TradingStyle } from '@/core/onboarding/types'
import ProfileHero from '@/components/profile/ProfileHero'
import { featuredEmblem } from '@/components/profile/badges/tierMetal'
import GoalsSection from '@/components/profile/goals/GoalsSection'
import BadgeWall from '@/components/profile/badges/BadgeWall'
import { profileStrings as S } from '@/components/profile/strings'

interface IdentityDraft {
  display_name: string
  handle: string
  trading_style: string
  markets: string
  bio: string
}

function draftFrom(p: ProfileRow): IdentityDraft {
  return {
    display_name: p.display_name ?? '',
    handle: p.handle ?? '',
    trading_style: p.trading_style ?? '',
    markets: p.markets ?? '',
    bio: p.bio ?? '',
  }
}

const STYLE_VALUES: Array<TradingStyle | ''> = ['', 'small-cap', 'large-cap', 'mixed']

export default function Profile() {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [summary, setSummary] = useState<XpSummary | null>(null)
  const [awards, setAwards] = useState<BadgeAward[]>([])
  const [newlyMinted, setNewlyMinted] = useState<NewlyMinted[]>([])
  const [draft, setDraft] = useState<IdentityDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([ipc.profileGet(), ipc.xpSummaryGet(), ipc.badgesList({ mint: true })])
      .then(([p, s, a]) => {
        if (cancelled) return
        setProfile(p)
        setDraft(draftFrom(p))
        setSummary(s)
        setAwards(a.awards)
        setNewlyMinted(a.newlyMinted)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function saveIdentity() {
    if (!draft || saving) return
    setSaving(true)
    setError(null)
    try {
      const updated = await ipc.profileUpdate({
        display_name: draft.display_name.trim() || null,
        handle: draft.handle.trim() || null,
        trading_style: draft.trading_style || null,
        markets: draft.markets.trim() || null,
        bio: draft.bio.trim() || null,
      })
      setProfile(updated)
      setDraft(draftFrom(updated))
      setSavedFlash(true)
      window.setTimeout(() => setSavedFlash(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  // R4 — persist the featured-3 selection. The picker enforces the cap
  // client-side; updateProfile rejects >3 defensively (surfaced as an error).
  async function setFeatured(next: string[]) {
    if (!profile) return
    try {
      setProfile(await ipc.profileUpdate({ featured_badges: next }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const streakDays = (n: number) =>
    `${n} ${n === 1 ? S.streak.dayUnitSingular : S.streak.dayUnit}`

  return (
    <PageShell subtitle={S.subtitle}>
      {error && (
        <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {profile && summary && draft ? (
        <>
          <ProfileHero
            profile={profile}
            summary={summary}
            emblem={featuredEmblem(profile.featured_badges, awards)}
            onAvatarUpdated={(p) => {
              setProfile(p)
              setDraft((d) => d ?? draftFrom(p))
            }}
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
            {/* ── Identity — the editable form (the hero above is the display) ── */}
            <section className="card-premium p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
                {S.identity.heading}
              </h2>
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-tertiary">
                    {S.identity.displayNameLabel}
                  </span>
                  <input
                    type="text"
                    value={draft.display_name}
                    placeholder={S.identity.displayNamePlaceholder}
                    onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                    className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs text-fg-tertiary">
                      {S.identity.handleLabel}
                    </span>
                    <input
                      type="text"
                      value={draft.handle}
                      placeholder={S.identity.handlePlaceholder}
                      onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
                      className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-fg-tertiary">
                      {S.identity.styleLabel}
                    </span>
                    <select
                      value={draft.trading_style}
                      onChange={(e) =>
                        setDraft({ ...draft, trading_style: e.target.value })
                      }
                      className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
                    >
                      {STYLE_VALUES.map((v) => (
                        <option key={v} value={v}>
                          {v === ''
                            ? S.identity.styleOptions.unset
                            : S.identity.styleOptions[v]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-tertiary">
                    {S.identity.marketsLabel}
                  </span>
                  <input
                    type="text"
                    value={draft.markets}
                    placeholder={S.identity.marketsPlaceholder}
                    onChange={(e) => setDraft({ ...draft, markets: e.target.value })}
                    className="w-full rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-tertiary">
                    {S.identity.bioLabel}
                  </span>
                  <textarea
                    value={draft.bio}
                    placeholder={S.identity.bioPlaceholder}
                    rows={3}
                    onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                    className="w-full resize-none rounded-md border border-border-subtle bg-bg-1 px-3 py-1.5 text-sm"
                  />
                </label>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void saveIdentity()}
                    disabled={saving}
                    className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-gold-hover disabled:opacity-60"
                  >
                    {saving ? S.identity.saving : S.identity.save}
                  </button>
                  {savedFlash && (
                    <span className="text-xs text-fg-tertiary">{S.identity.saved}</span>
                  )}
                </div>
              </div>
            </section>

            {/* ── Journaling streak — enriched cluster ─────────────────── */}
            <section className="card-premium p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
                {S.streak.heading}
              </h2>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.08]">
                    <Flame
                      className={`h-6 w-6 ${
                        summary.currentStreak > 0 ? 'text-gold' : 'text-fg-muted'
                      }`}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div>
                    <div className="font-mono text-3xl font-bold leading-none text-gold">
                      {summary.currentStreak}
                    </div>
                    <div className="mt-1 text-xs text-fg-tertiary">
                      {summary.currentStreak === 1
                        ? S.streak.dayUnitSingular
                        : S.streak.dayUnit}{' '}
                      current
                    </div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border-subtle pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg-tertiary">{S.streak.longestLabel}</span>
                    <span className="font-mono text-fg-primary">
                      {streakDays(summary.longestStreak)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg-tertiary">{S.streak.freezesLabel}</span>
                    <span className="inline-flex items-center gap-1 font-mono text-fg-primary">
                      {summary.freezesBanked}
                      <Snowflake className="h-3.5 w-3.5 text-info" />
                    </span>
                  </div>
                </div>
                <p className="text-xs text-fg-muted">
                  {summary.currentStreak > 0 || summary.longestStreak > 0
                    ? S.streak.freezeHint
                    : S.streak.emptyHint}
                </p>
              </div>
            </section>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="h-44 animate-pulse rounded-2xl bg-bg-3" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="h-72 animate-pulse rounded-2xl bg-bg-3" />
            <div className="h-72 animate-pulse rounded-2xl bg-bg-3" />
          </div>
        </div>
      )}

      {/* ── Goals (S5's L18 increment — full-width below the hero grid) ── */}
      <GoalsSection />

      {/* ── Badges (S6's L18 increment — the wall + featured-3 picker) ── */}
      <BadgeWall
        featured={profile?.featured_badges ?? []}
        onSetFeatured={(next) => void setFeatured(next)}
        awards={awards}
        newlyMinted={newlyMinted}
      />
    </PageShell>
  )
}
