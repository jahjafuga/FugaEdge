import ReactCountryFlag from 'react-country-flag'

// Single point of truth for flag rendering. Always SVG via react-country-flag
// so Windows, macOS, and Linux all render the same flag glyph — emoji-based
// flag rendering relied on the OS emoji font and degraded to letter pairs
// on Windows. ISO 3166-1 alpha-2 only; pass `iso` from a TradeListRow or a
// REGION_REPRESENTATIVE_COUNTRY lookup.

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
      style={{ width: size, height: size }}
      title={title}
      aria-label={title ?? iso}
    />
  )
}
