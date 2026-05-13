// Pure types for the Product Tour. Web-portable per /ARCHITECTURE.md —
// no DOM refs in here, just data describing each step. The component
// layer turns these into anchor lookups via `[data-tour="<anchor>"]`.

export interface TourStep {
  /** Stable id used by analytics and as a React key. */
  id: string
  /** `data-tour` attribute value on the target element. Null means the
   *  step has no anchor and the tooltip should render centered. */
  anchor: string | null
  title: string
  body: string
  /** Label override for the "Next" button on the final step
   *  ("Start trading"). Falls back to "Next". */
  finalLabel?: string
}

export const TOUR_FLAG_KEY = 'fugaedge-tour-complete'
/** Force-restart token (Settings → Restart tour). Cleared on completion. */
export const TOUR_FORCE_KEY = 'fugaedge-tour-force'
