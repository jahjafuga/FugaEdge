// DivergingBar — a centered diverging-bar SVG primitive. The bar grows from a
// centerline (x = width/2) toward the right (rightColor) when `value` is
// positive and toward the left (leftColor) when negative, its length scaled by
// `value` against a symmetric `extent`:
//   len = (min(|value|, extent) / extent) * (width / 2)
// so |value| >= extent caps the bar at the half-width edge.
//
// value = 0 renders NO <rect>; the SVG is intentionally empty. If a centerline
// tick is needed, the consumer composes it as a sibling element — the primitive
// stays minimal and makes no visual assumption beyond the bar itself.
//
// Value-agnostic AND color-agnostic by design: it takes two raw hex colors
// (never chartColors) and a number, and it does NOT know what `value` represents
// — bucket center vs data mean vs index position is the consumer's semantic,
// settled when the VWAP/EMA section aggregators land at wiring time (D-F5.2
// deferred). First consumer: F5's BucketRow (Sections 3 / 4 distance rows, §G
// "a centered diverging bar, left = below the level, right = above").
//
// SVG idiom follows Sparkline: width/height props (default 80x8), raw px space
// (no viewBox), hex colors via props. Decorative by default (aria-hidden); pass
// `ariaLabel` to expose it as role="img" with a label.

interface DivergingBarProps {
  value: number
  extent: number
  leftColor: string
  rightColor: string
  width?: number
  height?: number
  ariaLabel?: string
}

export default function DivergingBar({
  value,
  extent,
  leftColor,
  rightColor,
  width = 80,
  height = 8,
  ariaLabel,
}: DivergingBarProps) {
  const cx = width / 2
  const half = width / 2
  const frac = extent > 0 ? Math.min(Math.abs(value), extent) / extent : 0
  const len = frac * half

  return (
    <svg
      width={width}
      height={height}
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {value !== 0 && extent > 0 && (
        <rect
          x={value > 0 ? cx : cx - len}
          y={0}
          width={len}
          height={height}
          fill={value > 0 ? rightColor : leftColor}
        />
      )}
    </svg>
  )
}
