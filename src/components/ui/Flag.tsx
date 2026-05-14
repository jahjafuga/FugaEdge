import ReactCountryFlag from 'react-country-flag'

// Single point of truth for flag rendering. Always SVG via react-country-flag
// so Windows, macOS, and Linux all render the same flag glyph — emoji-based
// flag rendering relied on the OS emoji font and degraded to letter pairs
// on Windows. ISO 3166-1 alpha-2 only; pass `iso` from a TradeListRow or a
// REGION_REPRESENTATIVE_COUNTRY lookup.
//
// Sizing notes:
//   - `width`/`height` HTML attrs are passed so the underlying <img>
//     reserves correct layout space before the SVG resolves (no jank).
//   - `style` repeats the size in CSS and adds `objectFit: cover` so flags
//     with non-square aspect ratios (most of them) fill the box cleanly
//     instead of squashing.
//   - The thin border + 2px corner-radius keeps tiny flags (14px in the
//     trades table) visually distinct from surrounding text — without it
//     the flag bleeds into the dark surface and reads as a smudge.

interface FlagProps {
  /** ISO 3166-1 alpha-2 (any case). Null/undefined/empty returns null. */
  iso: string | null | undefined
  /** Side length in pixels for both width and height. */
  size?: number
  /** Tooltip + accessible label. Defaults to the ISO code. */
  title?: string
}

export default function Flag({ iso, size = 16, title }: FlagProps) {
  if (!iso) return null
  return (
    <ReactCountryFlag
      countryCode={iso}
      svg
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'cover' }}
      title={title}
      aria-label={title ?? iso}
      className="inline-block rounded-[2px] border border-border-subtle align-middle"
    />
  )
}
