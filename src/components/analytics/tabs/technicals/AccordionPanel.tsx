import type { ReactNode } from 'react'

// Inline-expansion panel (§97) — SettingsAccordion's grid-rows-[0fr]→[1fr]
// technique. The inner min-h-0 overflow-hidden is load-bearing: it lets the row
// track collapse to 0 and clips content during the transition. Reduced-motion
// is handled globally (index.css zeroes transition-duration). pt-3 spaces the
// table from the card row above when open; it contributes nothing when the row
// track is 0fr (closed), so the resting grid stays tight.
export default function AccordionPanel({
  open,
  children,
}: {
  open: boolean
  children: ReactNode
}) {
  return (
    <div
      className={`grid transition-[grid-template-rows] duration-200 ease-out-soft ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="min-h-0 overflow-hidden" aria-hidden={!open}>
        <div className="pt-3">{children}</div>
      </div>
    </div>
  )
}
