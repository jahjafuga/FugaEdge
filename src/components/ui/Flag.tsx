import type { CSSProperties, HTMLAttributes, SVGProps } from 'react'
import { FLAG_COMPONENTS } from './flag-registry'

// Single point of truth for flag rendering. Uses country-flag-icons —
// bundled SVG React components, NO external image requests, so Electron's
// CSP `img-src 'self' data: blob: electron:` can stay locked down.
//
// Aspect ratio is 3:2 (24×16, 21×14, etc.) — the wrapper sizes via `size`
// as the WIDTH. Height is computed as `size * 2 / 3`.
//
// Fallback: if the ISO code isn't in FLAG_COMPONENTS (e.g. a Polygon
// response returned 'AE' but the registry doesn't import it yet), render
// the code in a small bordered pill so the missing-flag case stays
// visible to the user rather than disappearing silently.

interface FlagProps {
  /** ISO 3166-1 alpha-2 (any case). Null/undefined/empty returns null. */
  iso: string | null | undefined
  /** Width in pixels. Height derives from 3:2 aspect ratio. */
  size?: number
  /** Tooltip + accessible label. Defaults to the ISO code. */
  title?: string
  /** Extra classes appended to the flag/pill — useful for spacing/margins. */
  className?: string
}

function flagHeight(size: number): number {
  // 3:2 aspect — width / 1.5 rounded down so size=22 gives ~14, size=24
  // gives 16, etc. Even sizes look cleaner pixel-wise.
  return Math.round((size * 2) / 3)
}

export default function Flag({ iso, size = 20, title, className }: FlagProps) {
  if (!iso) return null
  const code = iso.toUpperCase()
  const Component = FLAG_COMPONENTS[code]
  const label = title ?? code

  if (!Component) {
    return (
      <span
        title={label}
        aria-label={label}
        className={`inline-flex items-center justify-center rounded border border-border-subtle bg-bg-1 px-1 font-mono text-[10px] text-fg-tertiary ${className ?? ''}`}
        style={{ height: flagHeight(size), minWidth: size }}
      >
        {code}
      </span>
    )
  }

  const style: CSSProperties = {
    width: size,
    height: flagHeight(size),
    objectFit: 'cover',
  }

  return (
    <Component
      role="img"
      title={label}
      aria-label={label}
      style={style}
      className={`inline-block shrink-0 rounded-sm border border-border-subtle align-middle ${className ?? ''}`}
    />
  )
}

// ── SVG-embedding helper ────────────────────────────────────────────────
//
// Recharts custom-tick renderers run inside the chart's <svg>, so they
// can't host the HTML-flavoured <Flag/> wrapper above (which uses CSS
// classes and `inline-block`). FlagSvg renders the raw country-flag-icons
// SVG component, accepting standard SVG props (x, y, width, height) so
// the caller can position it inside a <g transform="…">. Returns null
// when the ISO is missing or unsupported — the caller is responsible for
// any fallback drawing.

interface FlagSvgProps extends SVGProps<SVGSVGElement> {
  iso: string | null | undefined
}

export function FlagSvg({ iso, ...svgProps }: FlagSvgProps) {
  if (!iso) return null
  const code = iso.toUpperCase()
  const Component = FLAG_COMPONENTS[code]
  if (!Component) return null
  // FLAG_COMPONENTS is typed with HTMLAttributes<SVGElement> from the
  // upstream lib. We funnel through `unknown` because the upstream type
  // omits SVG-specific positional props (x, y) that we legitimately need
  // for Recharts tick layout. Runtime is unaffected — the underlying
  // element IS an <svg>, which accepts these natively.
  return <Component {...(svgProps as unknown as HTMLAttributes<SVGElement>)} />
}
