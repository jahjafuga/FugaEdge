// Profile redesign, Slice 1 — the hero identity band. Unifies the avatar, the
// level ring (wrapped AROUND the avatar via LevelRing's `center` slot, reusing
// its ringFraction math), and the identity display (name / handle / style /
// member-since / bio) + XP. Pure presentation: the avatar upload lives in the
// reused AvatarPicker, the level/XP data comes from the `summary` prop
// (xpSummaryGet) — no math or data-source change here.

import AnimatedNumber from '@/components/ui/AnimatedNumber'
import AvatarPicker from './AvatarPicker'
import HeroAccountPanel from './HeroAccountPanel'
import LevelRing from './LevelRing'
import { badgeIcon } from './badges/badgeIcons'
import { tierColor, type FeaturedEmblem } from './badges/tierMetal'
import { profileStrings as S } from './strings'
import type { Profile } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'
import type { TradingStyle } from '@/core/onboarding/types'

interface ProfileHeroProps {
  profile: Profile
  summary: XpSummary
  /** The single pinned badge's emblem (icon + tier), or null when none. */
  emblem?: FeaturedEmblem | null
  /** Avatar upload completed — parent updates its profile (and seeds the draft). */
  onAvatarUpdated: (profile: Profile) => void
}

const RING = 140
const AVATAR = 112

export default function ProfileHero({
  profile,
  summary,
  emblem,
  onAvatarUpdated,
}: ProfileHeroProps) {
  const EmblemIcon = emblem ? badgeIcon(emblem.icon) : null
  const emblemColor = emblem ? tierColor(emblem.tier) : null
  const name = profile.display_name?.trim() || S.identity.unnamed
  const handle = profile.handle?.trim()
  const styleLabel = profile.trading_style
    ? S.identity.styleOptions[profile.trading_style as TradingStyle]
    : null
  const bio = profile.bio?.trim()

  return (
    <section className="card-premium p-6 sm:p-8">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        {/* Level-avatar — the ring wraps the avatar; the LVL chip sits at its base. */}
        <div className="relative shrink-0" style={{ width: RING, height: RING }}>
          <LevelRing
            level={summary.level}
            intoLevel={summary.intoLevel}
            neededForNext={summary.neededForNext}
            size={RING}
            center={
              <AvatarPicker
                profile={profile}
                onUpdated={onAvatarUpdated}
                size={AVATAR}
                hero
              />
            }
          />
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-gold/40 bg-bg-1 px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-gold shadow-sm">
            {S.level.ringLabel} {summary.level}
          </span>
          {/* Featured-badge emblem (Beat 2) — the single pinned badge, top-right,
              sitting ON the ring like a notification badge (z above the ring). */}
          {EmblemIcon && emblemColor && (
            <div
              className={`absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-bg-1 shadow-sm ${emblemColor.coin}`}
              aria-hidden
            >
              <EmblemIcon className={`h-5 w-5 ${emblemColor.icon}`} strokeWidth={1.75} />
            </div>
          )}
        </div>

        {/* Identity + XP */}
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <h2 className="truncate text-2xl font-bold tracking-tight text-fg-primary">
            {name}
          </h2>
          {/* Normalize to exactly one '@' — a stored handle may already
              carry it (the '@@' ride-along, Stage 3 beat 3). */}
          {handle && (
            <p className="mt-0.5 text-sm text-fg-tertiary">@{handle.replace(/^@+/, '')}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:justify-start">
            {styleLabel && (
              <span className="rounded-full border border-border-subtle bg-bg-1 px-2.5 py-0.5 text-xs text-fg-secondary">
                {styleLabel}
              </span>
            )}
            {profile.member_since && (
              <span className="text-xs text-fg-tertiary">
                {S.memberSinceLabel}{' '}
                <span className="font-mono">{profile.member_since}</span>
              </span>
            )}
          </div>

          {bio && <p className="mt-3 text-sm text-fg-secondary">{bio}</p>}

          <div className="mt-4 flex flex-col items-center gap-0.5 sm:items-start">
            <div className="flex items-baseline gap-1.5">
              <AnimatedNumber
                value={summary.totalXp}
                format={(n) =>
                  n === null ? '—' : `${Math.round(n).toLocaleString()}`
                }
                className="font-mono text-2xl font-bold text-gold"
              />
              <span className="text-sm text-fg-tertiary">{S.level.xpUnit}</span>
            </div>
            <p className="text-xs text-fg-tertiary">
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

        {/* The account panel (Stage 3 beat 3) — the hero's right side
            follows the switcher: broker, details, and the COMPUTED LEDGER
            balance. The page's only scope consumer; identity stays global. */}
        <HeroAccountPanel />
      </div>
    </section>
  )
}
