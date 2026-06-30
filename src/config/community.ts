// Community + socials link config. Single source of truth — when the Discord
// invite URL or a social handle changes, edit it here and every entry point
// picks up the new value automatically.
//
// Empty DISCORD_INVITE_URL disables the community feature: the sidebar nav
// item, Settings card, and onboarding pitch all guard on a truthy value and
// hide themselves when this is blank.

export const DISCORD_INVITE_URL = 'https://discord.gg/8aJvmde97U'

// Channel-specific Discord invites (never-expire) for the Help > Support card —
// feature requests and bug reports each land in their own channel.
export const FEATURE_REQUEST_URL = 'https://discord.gg/Xn6dUMSCFc'
export const BUGS_URL = 'https://discord.gg/Bbjp5eNhxG'

// Public social handles. URLs live here (config), never hardcoded in JSX, so a
// handle change is a one-line edit. Rendered as a compact link row in
// Settings > Help.
export const X_URL = 'https://x.com/fugaedge'
export const INSTAGRAM_URL = 'https://www.instagram.com/fugaedge/'
export const YOUTUBE_URL = 'https://www.youtube.com/@fugaedge'
export const TIKTOK_URL = 'https://www.tiktok.com/@fugaedge'

/** Socials in display order; label + url only, icon choice stays in the UI. */
export const SOCIALS: ReadonlyArray<{ label: string; url: string }> = [
  { label: 'X', url: X_URL },
  { label: 'Instagram', url: INSTAGRAM_URL },
  { label: 'YouTube', url: YOUTUBE_URL },
  { label: 'TikTok', url: TIKTOK_URL },
]

/** True when the community feature is enabled (URL non-empty). */
export function hasCommunityLink(): boolean {
  return DISCORD_INVITE_URL.trim() !== ''
}
