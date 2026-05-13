import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

// Lightweight CSS-only tooltip. Wraps a trigger; popover appears on hover or
// keyboard focus. Width-capped so multi-sentence explanations wrap cleanly.
export default function Tooltip({
  content,
  children,
  side = 'top',
  className = '',
}: TooltipProps) {
  const sideClasses =
    side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute z-50 left-1/2 -translate-x-1/2 whitespace-normal rounded-md border border-border bg-bg/95 px-3 py-2 text-xs leading-relaxed text-text opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${sideClasses}`}
        style={{ maxWidth: 'min(280px, calc(100vw - 32px))' }}
      >
        {content}
      </span>
    </span>
  )
}

export function InfoIcon() {
  return (
    <span className="cursor-help font-mono text-[10px] text-muted transition-colors group-hover:text-gold">
      ⓘ
    </span>
  )
}
