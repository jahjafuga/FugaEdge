import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Download, Settings as SettingsIcon, User } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import type { BadgeAward, Profile } from '@shared/identity-types'
import type { XpSummary } from '@shared/xp-types'
import { initialsFrom } from '@/components/profile/helpers'
import { badgeIcon } from '@/components/profile/badges/badgeIcons'
import { featuredEmblem, tierColor } from '@/components/profile/badges/tierMetal'
import Avatar from '@/components/ui/Avatar'
import LevelRing from '@/components/profile/LevelRing'

// Top-right PROFILE menu (multi-account Beat 3 rename — formerly AccountMenu;
// "account" now means a trading account) — the avatar opens a dropdown to
// Profile / Settings / Import (route links to the existing pages). Mirrors
// PlaybookPicker's open + click-outside mechanics, and adds the Escape + ARIA
// the picker lacks.
//
// The avatar now carries the level-progress ring (games-style), reusing the
// Profile hero's LevelRing + ringFraction at a small stroke. The profile is
// fetched once on mount (D24 — no push channel), but the XP summary is
// REFETCHED ON ROUTE CHANGE: the TopBar mounts once and never remounts, so a
// mount-only XP fetch would go stale all session as XP is earned. Until XP
// loads (or on a read hiccup) the avatar renders WITHOUT a ring — never a fake
// 0% arc that reads as real progress.

const ITEMS = [
  { to: '/profile', label: 'Profile', Icon: User },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/import', label: 'Import', Icon: Download },
] as const

// Ring geometry — a thin toolbar ring around the established 40px avatar.
const AVATAR = 40
const RING = 48

export default function ProfileMenu() {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [summary, setSummary] = useState<XpSummary | null>(null)
  const [awards, setAwards] = useState<BadgeAward[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Profile — refetched on route change (mirrors the XP summary below) so the
  // toolbar avatar reflects a photo or name changed on the Profile tab. The
  // TopBar mounts once and never remounts, so a mount-only fetch would show a
  // stale avatar all session. Cancelled-guard + keep-last-good-on-failure.
  useEffect(() => {
    let cancelled = false
    ipc
      .profileGet()
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {
        // Non-blocking — keep the last good profile; a read hiccup must never
        // blank the chrome or flicker the avatar to its fallback.
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  // XP summary — refetched on every route change so the toolbar ring stays
  // fresh. Fires on mount (initial pathname) and whenever pathname changes;
  // a failure leaves the last good summary in place (no flicker to no-ring on
  // a transient nav read).
  useEffect(() => {
    let cancelled = false
    ipc
      .xpSummaryGet()
      .then((s) => {
        if (!cancelled) setSummary(s)
      })
      .catch(() => {
        // Non-blocking — keep the last ring; just skip this cycle.
      })
    return () => {
      cancelled = true
    }
  }, [pathname])

  // Featured-badge awards — refetched on route change (mirrors profile/summary)
  // so the toolbar emblem dot tracks a pin made on the Profile tab.
  useEffect(() => {
    let cancelled = false
    ipc
      .badgesList()
      .then((a) => {
        if (!cancelled) setAwards(a.awards)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [pathname])

  // Click-outside closes (mirrors PlaybookPicker).
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Escape closes (borrows the DetailModalShell pattern — the a11y the picker
  // is missing).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const initials = initialsFrom(profile?.display_name ?? null)
  const displayName = profile?.display_name?.trim() || 'Add your name'
  const handle = profile?.handle?.trim()
  const emblem = featuredEmblem(profile?.featured_badges ?? [], awards)
  const EmblemIcon = emblem ? badgeIcon(emblem.icon) : null

  const avatar = (
    <Avatar avatarData={profile?.avatar_data ?? null} initials={initials} size={AVATAR} />
  )

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Tour anchor — the import step anchors here (the only nav-import element).
        data-tour="nav-import"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Profile menu"
        // The gold progress arc IS the ring, so the old gold hover-ring would
        // clash — hover grows the disc instead; focus keeps a gold ring set off
        // by a gap so it reads as focus, not part of the arc.
        className="relative inline-flex cursor-pointer items-center justify-center rounded-full outline-none transition-transform duration-150 ease-out-soft hover:scale-105 focus-visible:ring-2 focus-visible:ring-gold/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      >
        {summary ? (
          <LevelRing
            level={summary.level}
            intoLevel={summary.intoLevel}
            neededForNext={summary.neededForNext}
            size={RING}
            stroke={3}
            center={avatar}
          />
        ) : (
          <span
            className="inline-flex items-center justify-center"
            style={{ width: RING, height: RING }}
          >
            {avatar}
          </span>
        )}
        {/* Featured-badge emblem (Beat 2) — a mini emblem at toolbar scale: the
            badge icon in its tier color, top-right, z above the ring. */}
        {emblem && EmblemIcon && (
          <span
            className={`absolute right-0 top-0 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-bg-1 shadow-sm ${tierColor(emblem.tier).coin}`}
            aria-hidden
          >
            <EmblemIcon className={`h-3 w-3 ${tierColor(emblem.tier).icon}`} strokeWidth={2} />
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Profile"
          className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-bg-2/95 shadow-lg backdrop-blur"
        >
          <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-3">
            <Avatar avatarData={profile?.avatar_data ?? null} initials={initials} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg-primary">{displayName}</div>
              {handle && <div className="truncate text-xs text-fg-tertiary">@{handle}</div>}
            </div>
          </div>
          <div className="p-1">
            {ITEMS.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-sm text-fg-secondary transition-colors duration-150 hover:bg-white/[0.04] hover:text-fg-primary"
              >
                <Icon size={15} strokeWidth={2} aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
