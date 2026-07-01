// A subtle hexagonal crest frame for earned badge coins (badge card richness) —
// in-brand SVG, the LevelRing precedent. The stroke inherits currentColor, so
// the caller sets the tier text color; it overlays the existing disc container
// (absolute inset-0) and frames the coin WITHOUT enlarging the card. Earned-only.
export default function BadgeCrest({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" aria-hidden>
      <polygon
        points="18,2.5 31,10 31,26 18,33.5 5,26 5,10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}
