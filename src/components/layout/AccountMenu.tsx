import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Settings as SettingsIcon, User } from 'lucide-react'
import { ipc } from '@/lib/ipc'
import type { Profile } from '@shared/identity-types'
import { initialsFrom } from '@/components/profile/helpers'
import Avatar from '@/components/ui/Avatar'

// Top-right account menu — the avatar opens a dropdown to Profile / Settings /
// Import (route links to the existing pages). Mirrors PlaybookPicker's open +
// click-outside mechanics, and adds the Escape + ARIA the picker lacks. The
// profile is fetched once on mount (the same ipc.profileGet() the Profile page
// uses); until it resolves the avatar shows its honest glyph fallback — never a
// broken image, never fabricated data. Pure routing — no IPC beyond the read.

const ITEMS = [
  { to: '/profile', label: 'Profile', Icon: User },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/import', label: 'Import', Icon: Download },
] as const

export default function AccountMenu() {
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fetch the profile once on mount (D24 — no push channel needed; a single
  // window can't be on /profile and mutating identity simultaneously).
  useEffect(() => {
    let cancelled = false
    ipc
      .profileGet()
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch(() => {
        // Leave null → the glyph fallback shows. A profile-read hiccup must
        // never block the chrome from rendering.
      })
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // Tour anchor — the import step re-anchors here (Phase 1). After Beat 2
        // strips the rail's Import row, this is the only nav-import element.
        data-tour="nav-import"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full outline-none transition duration-150 ease-out-soft hover:ring-2 hover:ring-gold/40 focus-visible:ring-2 focus-visible:ring-gold/50"
      >
        <Avatar avatarData={profile?.avatar_data ?? null} initials={initials} size={32} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
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
