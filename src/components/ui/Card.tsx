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

// MASTER §5.2 — flat bg-2 surface, 12px radius, 16px padding, subtle border.
// No gradients, no shadow lift, no scale on hover (anti-pattern).
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
      className={`rounded-lg border border-border-subtle bg-bg-2 shadow-sm ${hoverCls} ${className}`}
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
