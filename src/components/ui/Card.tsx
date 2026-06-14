import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  /** Border tints to default on hover. Off when card isn't interactive. */
  hover?: boolean
}

// MASTER §11.1 (Edge flagship Beat 1) — premium card shape via .card-premium:
// a felt 0.92 surface so the §11.2 aurora reads through, a white@6% hairline,
// 20px radius, the §11.1 lift shadow. DARK MODE this beat; .card-premium falls
// back to the shipped flat bg-2 surface in light (premium light = Beat 1.5).
// Per-tone glows are opt-in (Edge hero cards), never default here. §11.6
// supersedes the §10 shadow/glow ban within the sweep. Padding stays 16px.
export default function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  padded = true,
  hover = true,
}: CardProps) {
  const hoverCls = hover
    ? 'transition-colors duration-150 ease-out-soft hover:border-border'
    : ''
  return (
    <div
      className={`card-premium ${hoverCls} ${className}`}
    >
      {(title || right || subtitle) && (
        <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle px-4 py-3">
          <div className="min-w-0">
            {title && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="mt-1 text-sm text-fg-secondary">{subtitle}</div>
            )}
          </div>
          {right && <div className="shrink-0 text-sm text-fg-tertiary">{right}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </div>
  )
}
