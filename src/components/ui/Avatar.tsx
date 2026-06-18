import { User } from 'lucide-react'

// Pure presentational avatar disc — the single source of truth for the 3-tier
// fallback (extracted from AvatarPicker so the picker and the account-menu
// trigger render the SAME thing): avatar image → initials disc → neutral glyph.
// No IPC, no fetch; the caller passes the data. SaaS-portable (zero
// electron/fs/sqlite), so it drops unchanged into a Next.js page.

interface AvatarProps {
  /** Avatar as a data-URL (Profile.avatar_data); null → fall through. */
  avatarData: string | null
  /** Initials for the no-avatar disc (initialsFrom); null → fall through to glyph. */
  initials: string | null
  /** Disc diameter in px. Default 32 (the h-8 TopBar rhythm). */
  size?: number
  /** Optional data-testid passthrough (the picker keeps its "avatar-disc" hook). */
  testId?: string
}

export default function Avatar({ avatarData, initials, size = 32, testId }: AvatarProps) {
  return (
    <span
      data-testid={testId}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-subtle bg-bg-3"
      style={{ width: size, height: size }}
    >
      {avatarData ? (
        <img src={avatarData} alt="" className="h-full w-full object-cover" />
      ) : initials ? (
        <span className="font-semibold text-gold" style={{ fontSize: Math.round(size * 0.4) }}>
          {initials}
        </span>
      ) : (
        <User
          className="text-fg-tertiary"
          style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
          strokeWidth={2}
        />
      )}
    </span>
  )
}
