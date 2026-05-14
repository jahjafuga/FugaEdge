// Community link config. Single source of truth — when the Discord
// invite URL changes, edit it here and every entry point picks up the
// new value automatically.
//
// Empty string disables the feature: the sidebar nav item, Settings
// card, and onboarding pitch all guard on a truthy value and hide
// themselves when this is blank.

export const DISCORD_INVITE_URL = 'https://discord.gg/8aJvmde97U'

/** True when the community feature is enabled (URL non-empty). */
export function hasCommunityLink(): boolean {
  return DISCORD_INVITE_URL.trim() !== ''
}
