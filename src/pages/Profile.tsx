// v0.2.5 Phase B Session 4 — the profile page (spec §B/§G; L17-L23). First
// visible surface of the release. THE PAGE GROWS BY SESSION (L18/D24): S4
// ships identity + avatar + level ring + XP progress + streak + member-since
// ONLY — no placeholder sections; S5 adds goals, S6 badges, Phase D the Edge
// Score. Data is fetched on route mount (D24 — no push channel; a single-
// window app cannot be on /profile and mutating trades simultaneously).
// NO P&L anywhere on this page, by design and by smoke.

import { useEffect, useState } from 'react'
import { Snowflake } from 'lucide-react'
import PageShell from '@/components/layout/PageShell'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { ipc } from '@/lib/ipc'
import type { Profile as ProfileRow } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'
import type { TradingStyle } from '@/core/onboarding/types'
import AvatarPicker from '@/components/profile/AvatarPicker'
import LevelRing from '@/components/profile/LevelRing'
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
  const [draft, setDraft] = useState<IdentityDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([ipc.profileGet(), ipc.xpSummaryGet()])
      .then(([p, s]) => {
        if (cancelled) return
        setProfile(p)
        setDraft(draftFrom(p))
        setSummary(s)
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
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* ── Identity card ─────────────────────────────────────────── */}
        <section className="rounded-lg border border-border-subtle bg-bg-2 p-6">
          <h2 className="mb-5 text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
            {S.identity.heading}
          </h2>
          {profile && draft ? (
            <div className="flex flex-col gap-6 sm:flex-row">
              <AvatarPicker
                profile={profile}
                onUpdated={(p) => {
                  setProfile(p)
                  setDraft((d) => d ?? draftFrom(p))
                }}
              />
              <div className="flex-1 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-fg-tertiary">
                    {S.identity.displayNameLabel}
                  </span>
                  <input
                    type="text"
                    value={draft.display_name}
                    placeholder={S.identity.displayNamePlaceholder}
                    onChange={(e) =>
                      setDraft({ ...draft, display_name: e.target.value })
                    }
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
                {profile.member_since && (
                  <p className="pt-2 text-xs text-fg-tertiary">
                    {S.memberSinceLabel}{' '}
                    <span className="font-mono">{profile.member_since}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="h-40 animate-pulse rounded-md bg-bg-3" />
          )}
        </section>

        {/* ── Level + streak column ─────────────────────────────────── */}
        <div className="space-y-4">
          <section className="rounded-lg border border-border-subtle bg-bg-2 p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
              {S.level.heading}
            </h2>
            {summary ? (
              <div className="flex items-center gap-5">
                <LevelRing
                  level={summary.level}
                  intoLevel={summary.intoLevel}
                  neededForNext={summary.neededForNext}
                />
                <div>
                  <AnimatedNumber
                    value={summary.totalXp}
                    format={(n) =>
                      n === null ? '—' : `${Math.round(n).toLocaleString()}`
                    }
                    className="font-mono text-3xl font-bold text-gold"
                  />
                  <span className="ml-1 text-sm text-fg-tertiary">
                    {S.level.xpUnit}
                  </span>
                  <p className="mt-1 text-xs text-fg-tertiary">
                    {summary.neededForNext > 0 ? (
                      <>
                        <span className="font-mono">
                          {summary.neededForNext.toLocaleString()}
                        </span>{' '}
                        {S.level.xpUnit} {S.level.toNextTemplate}
                      </>
                    ) : (
                      S.level.maxLevel
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="h-32 animate-pulse rounded-md bg-bg-3" />
            )}
          </section>

          <section className="rounded-lg border border-border-subtle bg-bg-2 p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-fg-tertiary">
              {S.streak.heading}
            </h2>
            {summary ? (
              summary.currentStreak > 0 || summary.longestStreak > 0 ? (
                <div className="space-y-3">
                  <div>
                    <span className="font-mono text-3xl font-bold text-gold">
                      {summary.currentStreak}
                    </span>{' '}
                    <span className="text-sm text-fg-tertiary">
                      {summary.currentStreak === 1
                        ? S.streak.dayUnitSingular
                        : S.streak.dayUnit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg-tertiary">{S.streak.longestLabel}</span>
                    <span className="font-mono">{streakDays(summary.longestStreak)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg-tertiary">{S.streak.freezesLabel}</span>
                    <span className="inline-flex items-center gap-1 font-mono">
                      {summary.freezesBanked}
                      <Snowflake className="h-3.5 w-3.5 text-info" />
                    </span>
                  </div>
                  <p className="text-xs text-fg-muted">{S.streak.freezeHint}</p>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">{S.streak.emptyHint}</p>
              )
            ) : (
              <div className="h-24 animate-pulse rounded-md bg-bg-3" />
            )}
          </section>
        </div>
      </div>

      {/* ── Goals (S5's L18 increment — full-width below the S4 grid) ── */}
      <GoalsSection />

      {/* ── Badges (S6's L18 increment — the wall + featured-3 picker) ── */}
      <BadgeWall
        featured={profile?.featured_badges ?? []}
        onSetFeatured={(next) => void setFeatured(next)}
      />
    </PageShell>
  )
}
