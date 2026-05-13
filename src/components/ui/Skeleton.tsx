interface SkeletonProps {
  className?: string
}

// MASTER §5.12 — bg-3 base with subtle gold-tinted shimmer band.
// `skeleton` class is defined in src/index.css.
export default function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}
