import { useState, type ReactNode } from 'react'

interface CollapsibleCardProps {
  title: string
  subtitle?: string
  right?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  padded?: boolean
  hover?: boolean
}

// Accordion-style card used by the Reports → Breakdown tab (WIN VS LOSS DAYS,
// DRAWDOWN, BY PRICE RANGE, BY DAY OF WEEK, BY HOUR, BY SYMBOL).
//
// Surface uses --bg-3 ("elevated") so the header reads as a step above the
// page background in both themes. All colors are themed CSS-var tokens; no
// fixed hex / white-alpha values that would go invisible on light surfaces.
export default function CollapsibleCard({
  title,
  subtitle,
  right,
  children,
  defaultOpen = true,
  padded = false,
  hover = true,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen)

  const hoverClasses = hover
    ? 'transition-colors duration-150 ease-smooth hover:border-gold/40'
    : ''

  return (
    <div className={`rounded-md border border-border bg-bg-2 shadow-sm ${hoverClasses}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between gap-4 border-b border-border px-5 py-3 text-left transition-colors duration-150 hover:bg-bg-3"
        aria-expanded={open}
      >
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-fg-primary">
            <Chevron open={open} />
            <span>{title}</span>
          </div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-fg-tertiary">{subtitle}</div>
          )}
        </div>
        {right && <div className="text-sm text-fg-secondary">{right}</div>}
      </button>
      {open && <div className={padded ? 'p-5' : ''}>{children}</div>}
    </div>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-block text-fg-secondary transition-transform duration-200 ease-smooth ${
        open ? 'rotate-90' : ''
      }`}
    >
      ›
    </span>
  )
}
