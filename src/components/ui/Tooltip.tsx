import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

// Lightweight CSS-only tooltip. Wraps a trigger; popover appears on hover or
// keyboard focus. Width-capped so multi-sentence explanations wrap cleanly.
//
// v0.1.5: surface is always dark regardless of theme — the v0.1.4 light
// mode rendered grey-on-light-grey and the text was invisible. Dark
// popovers on a light page are the Linear/Figma/GitHub convention, so
// switch to a fixed dark surface here. Colors locked via Tailwind
// arbitrary values rather than CSS vars so the popover never flips.
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
        className={`pointer-events-none invisible absolute left-1/2 z-50 -translate-x-1/2 whitespace-normal rounded-md border border-[#2a3142] bg-[#1a1d26]/95 px-3 py-2 text-xs leading-relaxed text-[#f0f2f8] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.18)] backdrop-blur transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${sideClasses}`}
        style={{ maxWidth: 'min(280px, calc(100vw - 32px))' }}
      >
        {content}
      </span>
    </span>
  )
}

export function InfoIcon() {
  return (
    <Info
      size={14}
      strokeWidth={2}
      aria-hidden="true"
      className="cursor-help text-fg-tertiary transition-colors duration-150 group-hover:text-gold"
    />
  )
}
