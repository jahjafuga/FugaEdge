import { flagEmoji } from '@/core/country/flag'

// The renderer's primary font (Inter) doesn't ship the U+1F1E6..U+1F1FF
// regional-indicator block, so without an explicit fallback the browser
// falls through to Segoe UI on Windows and renders the indicators as plain
// letter pairs ('IL' instead of 🇮🇱). Listing the OS emoji fonts here
// forces the flag glyphs to render as actual flags wherever they exist.
const EMOJI_FONT_STACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif'

interface FlagProps {
  iso: string | null | undefined
  className?: string
}

export default function Flag({ iso, className }: FlagProps) {
  const emoji = flagEmoji(iso)
  if (!emoji) return null
  return (
    <span
      className={className}
      style={{ fontFamily: EMOJI_FONT_STACK }}
      aria-hidden="true"
    >
      {emoji}
    </span>
  )
}
