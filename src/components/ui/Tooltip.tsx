import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  className?: string
  /** Keyboard-focus reveal (group-focus-within). Default ON for a11y; pass
   *  false for hover-only triggers that are not keyboard-reachable
   *  (tabIndex=-1), where a mere click would otherwise pin the popover —
   *  the 69ade1c sentiment-badge stick. */
  focusable?: boolean
  /** ~400ms transition-delay on the REVEAL only (close stays instant), so
   *  fast pointer traversal never flashes the popover. */
  openDelay?: boolean
}

// Lightweight CSS-only tooltip. Wraps a trigger; popover appears on hover
// (and keyboard focus unless focusable={false}). Width-capped so
// multi-sentence explanations wrap cleanly.
//
// HOTFIX (69ade1c regression): the reveal is scoped to a NAMED Tailwind
// group (group/tt). The unnamed `group` collided with ancestor .group
// wrappers — the calendar DayCell is itself a .group, so hovering ANYWHERE
// on a cell revealed the badge tooltip. Named-group variants only respond
// to their own wrapper, app-wide and permanent.
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
  align = 'center',
  className = '',
  focusable = true,
  openDelay = false,
}: TooltipProps) {
  const sideClasses =
    side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
  const alignClasses =
    align === 'start' ? 'left-0' : align === 'end' ? 'right-0' : 'left-1/2 -translate-x-1/2'
  const focusClasses = focusable
    ? ' group-focus-within/tt:visible group-focus-within/tt:opacity-100'
    : ''
  // delay-0 on the base keeps the CLOSE transition instant; the named hover
  // variant delays only the reveal.
  const delayClasses = openDelay ? ' delay-0 group-hover/tt:delay-[400ms]' : ''
  return (
    <span className={`group/tt relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute z-50 whitespace-normal rounded-md border border-[#2a3142] bg-[#1a1d26]/95 px-3 py-2 text-xs leading-relaxed text-[#f0f2f8] opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.18)] backdrop-blur transition-opacity duration-150 group-hover/tt:visible group-hover/tt:opacity-100${focusClasses}${delayClasses} ${sideClasses} ${alignClasses}`}
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
      className="cursor-help text-fg-tertiary transition-colors duration-150 group-hover/tt:text-gold"
    />
  )
}
